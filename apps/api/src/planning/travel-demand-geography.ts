import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { DatabaseService } from '../common/database.service';
import {
  readPopulationCells,
  PopulationCellLimitError,
  PopulationRasterCapacityError,
  isPopulationRasterReadError,
  type PopulationCells,
} from '../enrichment/import/raster';
import type { Bounds } from '../enrichment/registry';
import type { DemandInputSource, DemandZone } from './travel-demand-inputs';

// A fully known 200,000-cell window measured 5.8s for zones and 7.9s for demographic fragments.
export const NATIVE_POPULATION_QUERY_TIMEOUT = '12s';
const LAYERS = ['roads', 'pois', 'population'] as const;
export const DEMAND_CATEGORIES = [
  'business',
  'education',
  'shopping',
  'food_and_drink',
  'healthcare',
  'transport',
  'leisure',
  'tourism',
  'religious',
] as const;

interface DemandImport extends DemandInputSource {
  layer: (typeof LAYERS)[number];
  id: string;
  rasterPath: string | null;
}

export async function readDemandGeography(
  db: DatabaseService,
  countryCode: string,
  bounds: Bounds,
  signal: AbortSignal,
  gridSize = 3,
  schoolFootprint?: { longitude: number; latitude: number; radiusKm: number },
): Promise<{
  sources: DemandInputSource[];
  zones: DemandZone[];
  warnings: string[];
  populationCells?: PopulationCells['cells'];
}> {
  const imports = await db.transaction(async (manager) => {
    await manager.query("SET LOCAL statement_timeout = '4s'");
    return manager.query<DemandImport[]>(
      `SELECT DISTINCT ON (layer) id, layer, source_key AS "sourceKey", version,
        reference_year AS "referenceYear", attribution, licence_url AS "licenceUrl",
        raster_path AS "rasterPath"
      FROM enrichment_imports
      WHERE country_code = $1 AND active AND data_class = 'production' AND layer = ANY($2::text[])
        AND ST_Covers(coverage, ST_MakeEnvelope($3,$4,$5,$6,4326))
      ORDER BY layer, reference_year DESC, fetched_at DESC, id`,
      [countryCode, LAYERS, ...bounds],
    );
  });
  const sources = imports.map(({ id: _id, rasterPath: _path, ...source }) => source);
  const missing = LAYERS.filter((layer) => !imports.some((source) => source.layer === layer));
  if (missing.length)
    return {
      sources,
      zones: [],
      warnings: [`No production import covers the study area for: ${missing.join(', ')}.`],
    };

  const population = imports.find((source) => source.layer === 'population')!;
  let raster: PopulationCells;
  try {
    raster = await readPopulationCells(population.rasterPath!, bounds, {
      maxCells: 200_000,
      timeoutMs: 10_000,
      signal,
    });
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof PopulationCellLimitError) throw new BadRequestException(error.message);
    if (error instanceof PopulationRasterCapacityError)
      throw new ServiceUnavailableException(error.message);
    if (isPopulationRasterReadError(error))
      throw new ServiceUnavailableException(
        'The imported WorldPop raster could not be read for this area. Ask the operator to repair or reimport the population reference, then retry.',
      );
    throw error;
  }
  signal.throwIfAborted();
  const zones = await db
    .transaction(async (manager) => {
      await manager.query(`SET LOCAL statement_timeout = '${NATIVE_POPULATION_QUERY_TIMEOUT}'`);
      return manager.query<DemandZone[]>(
        `WITH zones AS (
        SELECT y * $9::int + x + 1 AS id, ST_MakeEnvelope(
          $1::float8 + x * ($3::float8 - $1::float8) / $9::float8,
          $2::float8 + y * ($4::float8 - $2::float8) / $9::float8,
          $1::float8 + (x + 1) * ($3::float8 - $1::float8) / $9::float8,
          $2::float8 + (y + 1) * ($4::float8 - $2::float8) / $9::float8, 4326
        ) AS geom FROM generate_series(0,$9::int - 1) x CROSS JOIN generate_series(0,$9::int - 1) y
      ), raw_cells AS MATERIALIZED (
        SELECT (value->>'value')::float8 AS residents,
          ST_SetSRID(ST_GeomFromGeoJSON((value->'geometry')::text),4326) AS geom
        FROM jsonb_array_elements($7::jsonb) WHERE value->>'value' IS NOT NULL
      ), cells AS MATERIALIZED (
        SELECT *,ST_Area(geom::geography) AS cell_area FROM raw_cells
      ), cell_overlaps AS (
        SELECT z.id, c.residents, c.cell_area,
          CASE WHEN ST_Covers(z.geom,c.geom) THEN c.cell_area
            ELSE ST_Area(ST_Intersection(z.geom,c.geom)::geography) END AS covered_area
        FROM zones z JOIN cells c ON z.geom && c.geom
      ), residents AS (
        SELECT id, sum(residents * covered_area / NULLIF(cell_area,0)) AS residents,
          sum(covered_area) AS known_area FROM cell_overlaps WHERE covered_area > 0 GROUP BY id
      ), assigned_places AS (
        SELECT DISTINCT ON (f.external_id) z.id, f.properties->>'category' AS category
        FROM zones z JOIN enrichment_features f
          ON f.import_id = $6 AND f.geom && z.geom
        WHERE f.properties->>'category' = ANY($8::text[])
          AND ST_Covers(z.geom, ST_PointOnSurface(f.geom))
        ORDER BY f.external_id, z.id
      ), place_counts AS (
        SELECT id, category, count(*)::int AS count FROM assigned_places GROUP BY id, category
      ), places AS (
        SELECT id, jsonb_object_agg(category,count) AS categories FROM place_counts GROUP BY id
      )
      SELECT z.id, p.residents,
        jsonb_build_object('longitude',ST_X(ST_Centroid(z.geom)),'latitude',ST_Y(ST_Centroid(z.geom))) AS center,
        (SELECT count(DISTINCT f.external_id)::int FROM enrichment_features f
          WHERE f.import_id=$6 AND f.properties->>'subcategory'='school' AND f.geom && z.geom
            AND ST_Covers(z.geom,ST_PointOnSurface(f.geom))) AS "schoolCount",
        (SELECT count(DISTINCT f.external_id)::int FROM enrichment_features f
          WHERE f.import_id=$6 AND f.properties->>'subcategory'='school' AND f.geom && z.geom
            AND ST_Covers(z.geom,ST_PointOnSurface(f.geom)) AND
            ST_DWithin(ST_PointOnSurface(f.geom)::geography,ST_SetSRID(ST_MakePoint($10,$11),4326)::geography,$12::float8*1000)) AS "selectedSchoolCount",
        LEAST(1, COALESCE(p.known_area,0) / ST_Area(z.geom::geography)) AS "populationCoverage",
        CASE WHEN road.point IS NOT NULL THEN jsonb_build_object(
          'longitude', ST_X(road.point), 'latitude', ST_Y(road.point)
        ) END AS "roadPoint",
        COALESCE(a.categories,'{}'::jsonb) AS places
      FROM zones z LEFT JOIN residents p USING (id) LEFT JOIN places a USING (id)
      LEFT JOIN LATERAL (
        SELECT ST_ClosestPoint(ST_Intersection(r.geom,z.geom), ST_Centroid(z.geom)) AS point
        FROM enrichment_features r
        WHERE r.import_id = $5 AND ST_Intersects(r.geom,z.geom)
          AND r.properties->>'roadClass' IN ('primary','secondary','tertiary','trunk','residential','unclassified')
          AND COALESCE(r.properties->>'access','yes') IN ('yes','permissive','designated')
          AND COALESCE(r.properties->>'motorVehicle','yes') IN ('yes','permissive','designated')
        ORDER BY ST_Distance(r.geom::geography,ST_Centroid(z.geom)::geography), r.external_id
        LIMIT 1
      ) road ON true
      ORDER BY z.id`,
        [
          ...bounds,
          imports.find((source) => source.layer === 'roads')!.id,
          imports.find((source) => source.layer === 'pois')!.id,
          JSON.stringify(raster.cells),
          DEMAND_CATEGORIES,
          gridSize,
          schoolFootprint?.longitude ?? (bounds[0] + bounds[2]) / 2,
          schoolFootprint?.latitude ?? (bounds[1] + bounds[3]) / 2,
          schoolFootprint?.radiusKm ?? 0,
        ],
      );
    })
    .catch((error: unknown) => {
      signal.throwIfAborted();
      if (error && typeof error === 'object' && 'code' in error && error.code === '57014')
        throw new ServiceUnavailableException(
          'Population aggregation timed out for this study area. Retry when the service is less busy or choose a smaller area.',
        );
      throw error;
    });
  signal.throwIfAborted();
  return { sources, zones, warnings: raster.warnings, populationCells: raster.cells };
}

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AdministrativeContext,
  ContextMetric,
  ContextProvenance,
  EnrichmentLayer,
  PoiSummary,
  NamedRoadMetric,
  RoadContext,
  SiteGeographicContext,
  TrafficObservation,
} from '@abonten/contracts/enrichment';
import type { EntityManager } from 'typeorm';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { DatabaseService } from '../common/database.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  CONTEXT_DISCLAIMER,
  CONTEXT_RADII,
  catchmentReadBounds,
  populationMetric,
  unavailable,
} from './context-math';
import { countryFor } from './registry';
import { readPopulationCells, type PopulationCells } from './import/raster';

interface ImportRow {
  id: string;
  source_key: string;
  layer: EnrichmentLayer;
  version: string;
  reference_year: number;
  published_at: Date | null;
  fetched_at: Date;
  licence: string;
  licence_url: string;
  attribution: string;
  source_url: string;
  checksum: string;
  quality: ContextProvenance['quality'];
  warnings: string[];
  raster_path: string | null;
}
interface SiteLocation {
  latitude: number;
  longitude: number;
  country: string;
}
interface FeatureRow {
  external_id: string;
  properties: Record<string, unknown>;
  distance: number;
}
const POINT_SQL = 'ST_SetSRID(ST_MakePoint($2,$3),4326)';
const METHOD_POI =
  'OSM mapped features within a geodesic radius; polygon distance is to its footprint, and each OSM feature is counted once.';
const METHOD_ROAD =
  'Nearest mapped road within 1000 metres, measured with PostGIS geography on the WGS84 spheroid; not traffic exposure.';
const METHOD_NAMED_ROAD =
  'Nearest source-named mapped road within 1000 metres, measured with PostGIS geography on the WGS84 spheroid; distinct from the closest mapped segment, not traffic exposure.';
const METHOD_ADMIN =
  'Administrative polygons covering the site coordinate, including boundary matches.';
const METHOD_TRAFFIC =
  'Observed counting locations within 1000 metres; proximity does not establish exposure to the billboard.';

function provenance(row: ImportRow): ContextProvenance {
  const iso = (value: Date | string) => new Date(value).toISOString();
  return {
    importId: row.id,
    sourceKey: row.source_key,
    version: row.version,
    referenceYear: row.reference_year,
    publishedAt: row.published_at ? iso(row.published_at) : null,
    fetchedAt: iso(row.fetched_at),
    licence: row.licence,
    licenceUrl: row.licence_url,
    attribution: row.attribution,
    sourceUrl: row.source_url,
    checksum: row.checksum,
    quality: row.quality,
    warnings: row.warnings,
  };
}
function metric<T>(
  row: ImportRow,
  value: T,
  method: string,
  warnings: string[] = [],
  partial = false,
): ContextMetric<T> {
  return {
    value,
    method,
    status: partial ? 'partial' : 'available',
    provenance: provenance(row),
    warnings: [...row.warnings, ...warnings],
  };
}
function missingLayer<T>(row: ImportRow, method: string, warning: string): ContextMetric<T> {
  return { ...unavailable<T>(method, warning), provenance: provenance(row) };
}
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

@Injectable()
export class GeographicContextService {
  private readonly logger = new Logger(GeographicContextService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly inventory: InventoryService,
  ) {}

  async getSiteContext(
    user: AuthenticatedUser,
    orgId: string | undefined,
    siteId: string,
  ): Promise<SiteGeographicContext> {
    // No context query, local raster access or coordinate exposure before the existing
    // capability + owner/platform/listed-marketplace gate. Never accepts raw coordinates.
    await this.inventory.assertCanReadSite(user, orgId, siteId);
    return this.db.transaction(async (manager) => {
      const sites: SiteLocation[] = await manager.query(
        'SELECT latitude, longitude, country FROM billboard_sites WHERE id = $1',
        [siteId],
      );
      const site = sites[0];
      if (!site) throw new NotFoundException('Site not found');
      const country = countryFor(site.country);
      const result: SiteGeographicContext = {
        siteId,
        countryCode: country?.code ?? null,
        supported: Boolean(country),
        generatedAt: new Date().toISOString(),
        dataClass: 'production',
        disclaimer: CONTEXT_DISCLAIMER,
        nearestRoad: unavailable(METHOD_ROAD),
        nearestNamedRoad: {
          ...unavailable<RoadContext>(METHOD_NAMED_ROAD),
          searchRadiusMetres: 1000,
          searchCoverage: 'unavailable',
        },
        administrative: [unavailable(METHOD_ADMIN), unavailable(METHOD_ADMIN)],
        catchments: CONTEXT_RADII.map((radiusMetres) => ({
          radiusMetres,
          pois: unavailable(METHOD_POI),
          population: unavailable('Area-weighted local population grid'),
        })),
        traffic: unavailable(
          METHOD_TRAFFIC,
          'No licensed production traffic observations have been imported. Missing traffic is not zero.',
        ),
      };
      if (!country) return result;
      // Hold exact immutable import IDs throughout the read, even if an operator
      // activates a newer version concurrently. Production never reads demo imports.
      const imports: ImportRow[] = await manager.query(
        `SELECT DISTINCT ON (layer) * FROM enrichment_imports
         WHERE country_code = $1 AND data_class = 'production' AND active = true
         ORDER BY layer, reference_year DESC, fetched_at DESC, id`,
        [country.code],
      );
      const byLayer = new Map(imports.map((row) => [row.layer, row]));
      const road = byLayer.get('roads');
      if (road) {
        result.nearestRoad = await this.nearestRoad(manager, site, road);
        result.nearestNamedRoad = await this.nearestNamedRoad(manager, site, road);
      }
      for (const [index, layer] of ['admin1', 'admin2'].entries()) {
        const row = byLayer.get(layer as EnrichmentLayer);
        if (row) result.administrative[index] = await this.administrative(manager, site, row);
      }
      const poi = byLayer.get('pois');
      if (poi)
        for (const catchment of result.catchments) {
          catchment.pois = await this.pois(manager, site, poi, catchment.radiusMetres);
        }
      const population = byLayer.get('population');
      if (population?.raster_path) {
        let raster: PopulationCells | undefined;
        try {
          raster = await readPopulationCells(
            population.raster_path,
            catchmentReadBounds(site.latitude, site.longitude),
            { maxCells: 10000 },
          );
        } catch {
          this.logger.warn(`Local population processing unavailable for import ${population.id}`);
          for (const catchment of result.catchments)
            catchment.population = missingLayer(
              population,
              'Area-weighted local population grid',
              'The imported population raster is temporarily unavailable. No estimate has been substituted.',
            );
        }
        if (raster) {
          // Cells are native (not resampled) persons/pixel. Use fractional overlap,
          // not population density multiplication, and keep null NoData cells.
          const rows: {
            radius: number;
            people: number | null;
            validArea: number;
            rasterArea: number;
            catchmentArea: number;
          }[] = await manager.query(
            `
            WITH cells AS (
              SELECT (value->>'value')::double precision AS people,
                ST_SetSRID(ST_GeomFromGeoJSON((value->'geometry')::text),4326) AS geom
              FROM jsonb_array_elements($1::jsonb)
            ), circles AS (
              SELECT radius, ST_Buffer(ST_SetSRID(ST_MakePoint($2,$3),4326)::geography, radius, 'quad_segs=64')::geometry AS geom
              FROM unnest(ARRAY[250,500,1000]) AS radius
            ), cell_intersections AS (
              SELECT circles.radius, circles.geom AS circle, cells.people, cells.geom AS cell,
                ST_Intersection(circles.geom,ST_Intersection(cells.geom,
                  (SELECT coverage FROM enrichment_imports WHERE id=$4))) AS overlap
              FROM circles LEFT JOIN cells ON ST_Intersects(circles.geom,cells.geom)
            ) SELECT radius,
              CASE WHEN count(people) > 0 THEN sum(people * ST_Area(overlap::geography) / NULLIF(ST_Area(cell::geography),0)) ELSE NULL END AS people,
              coalesce(sum(ST_Area(overlap::geography)) FILTER (WHERE people IS NOT NULL),0) AS "validArea",
              coalesce(sum(ST_Area(overlap::geography)),0) AS "rasterArea",
              ST_Area(circle::geography) AS "catchmentArea"
            FROM cell_intersections GROUP BY radius,circle ORDER BY radius`,
            [JSON.stringify(raster.cells), site.longitude, site.latitude, population.id],
          );
          for (const catchment of result.catchments) {
            const row = rows.find((entry) => entry.radius === catchment.radiusMetres);
            if (row) {
              catchment.population = populationMetric(row, provenance(population));
              catchment.population.warnings.push(...raster.warnings);
            }
          }
        }
      }
      const traffic = byLayer.get('traffic');
      if (traffic) result.traffic = await this.traffic(manager, site, traffic);
      return result;
    });
  }

  private async nearestRoad(
    manager: EntityManager,
    site: SiteLocation,
    row: ImportRow,
  ): Promise<ContextMetric<RoadContext>> {
    const rows: FeatureRow[] = await manager.query(
      `SELECT external_id, properties,
      ST_Distance(geom::geography,${POINT_SQL}::geography) AS distance
      FROM enrichment_features WHERE import_id=$1
      AND ST_DWithin(geom::geography,${POINT_SQL}::geography,1000)
      ORDER BY distance,external_id LIMIT 1`,
      [row.id, site.longitude, site.latitude],
    );
    if (!rows[0])
      return missingLayer(
        row,
        METHOD_ROAD,
        'No road is mapped within 1000 metres in this import; mapping completeness is unknown.',
      );
    const feature = rows[0];
    return metric(
      row,
      {
        sourceId: feature.external_id,
        name: stringOrNull(feature.properties.name),
        roadClass: String(feature.properties.roadClass),
        ref: stringOrNull(feature.properties.ref),
        distanceMetres: Number(feature.distance),
      },
      METHOD_ROAD,
      ['OSM mapping completeness is unknown.'],
    );
  }

  private async nearestNamedRoad(
    manager: EntityManager,
    site: SiteLocation,
    row: ImportRow,
  ): Promise<NamedRoadMetric> {
    const [coverage]: { intersects: boolean; complete: boolean }[] = await manager.query(
      `SELECT ST_Intersects(coverage,ST_Buffer(${POINT_SQL}::geography,1000)::geometry) AS intersects,
      ST_Covers(coverage,ST_Buffer(${POINT_SQL}::geography,1000)::geometry) AS complete
      FROM enrichment_imports WHERE id=$1`,
      [row.id, site.longitude, site.latitude],
    );
    if (!coverage?.intersects)
      return {
        ...missingLayer<RoadContext>(
          row,
          METHOD_NAMED_ROAD,
          'The 1000 metre named-road search is outside this import coverage.',
        ),
        searchRadiusMetres: 1000,
        searchCoverage: 'outside',
      };
    const rows: FeatureRow[] = await manager.query(
      `SELECT external_id,properties,
      ST_Distance(geom::geography,${POINT_SQL}::geography) AS distance
      FROM enrichment_features WHERE import_id=$1
      AND NULLIF(BTRIM(properties->>'name'),'') IS NOT NULL
      AND ST_DWithin(geom::geography,${POINT_SQL}::geography,1000)
      ORDER BY distance,external_id LIMIT 1`,
      [row.id, site.longitude, site.latitude],
    );
    const warnings = ['OSM mapping completeness is unknown.'];
    if (!coverage.complete)
      warnings.push(
        'The 1000 metre named-road search is only partly covered by this import; a closer named road may be missing.',
      );
    const feature = rows[0];
    if (!feature) {
      const missing = missingLayer<RoadContext>(
        row,
        METHOD_NAMED_ROAD,
        'No source-named road is mapped within 1000 metres in the covered area; this does not establish the absence of real named roads.',
      );
      missing.warnings.push(...warnings);
      return {
        ...missing,
        searchRadiusMetres: 1000,
        searchCoverage: coverage.complete ? 'complete' : 'partial',
      };
    }
    return {
      ...metric(
        row,
        {
          sourceId: feature.external_id,
          name: stringOrNull(feature.properties.name),
          ref: stringOrNull(feature.properties.ref),
          roadClass: String(feature.properties.roadClass),
          distanceMetres: Number(feature.distance),
        },
        METHOD_NAMED_ROAD,
        warnings,
        !coverage.complete,
      ),
      searchRadiusMetres: 1000,
      searchCoverage: coverage.complete ? 'complete' : 'partial',
    };
  }

  private async administrative(
    manager: EntityManager,
    site: SiteLocation,
    row: ImportRow,
  ): Promise<ContextMetric<AdministrativeContext[]>> {
    const rows: FeatureRow[] = await manager.query(
      `SELECT external_id,properties FROM enrichment_features
      WHERE import_id=$1 AND ST_Covers(geom,${POINT_SQL}) ORDER BY external_id`,
      [row.id, site.longitude, site.latitude],
    );
    if (!rows.length)
      return missingLayer(
        row,
        METHOD_ADMIN,
        'No containing administrative polygon in this import.',
      );
    return metric(
      row,
      rows.map((feature) => ({
        sourceId: feature.external_id,
        name: String(feature.properties.name),
        level: row.layer === 'admin1' ? 1 : 2,
      })),
      METHOD_ADMIN,
      rows.length > 1
        ? ['The point intersects multiple boundaries; no administrative match has been discarded.']
        : [],
    );
  }

  private async pois(
    manager: EntityManager,
    site: SiteLocation,
    row: ImportRow,
    radius: number,
  ): Promise<ContextMetric<PoiSummary>> {
    const coverage: { intersects: boolean; complete: boolean }[] = await manager.query(
      `SELECT
      ST_Intersects(coverage,ST_Buffer(${POINT_SQL}::geography,$4)::geometry) AS intersects,
      ST_Covers(coverage,ST_Buffer(${POINT_SQL}::geography,$4)::geometry) AS complete
      FROM enrichment_imports WHERE id=$1`,
      [row.id, site.longitude, site.latitude, radius],
    );
    if (!coverage[0]?.intersects)
      return missingLayer(row, METHOD_POI, 'The catchment is outside this import coverage.');
    const counts: { category: string; count: number }[] = await manager.query(
      `SELECT properties->>'category' AS category,count(*)::int AS count
      FROM enrichment_features WHERE import_id=$1 AND ST_DWithin(geom::geography,${POINT_SQL}::geography,$4)
      GROUP BY properties->>'category' ORDER BY category`,
      [row.id, site.longitude, site.latitude, radius],
    );
    const nearest: FeatureRow[] = await manager.query(
      `SELECT external_id,properties,ST_Distance(geom::geography,${POINT_SQL}::geography) AS distance
      FROM enrichment_features WHERE import_id=$1 AND ST_DWithin(geom::geography,${POINT_SQL}::geography,$4)
      ORDER BY distance,external_id LIMIT 20`,
      [row.id, site.longitude, site.latitude, radius],
    );
    return metric(
      row,
      {
        mappedCount: counts.reduce((total, group) => total + group.count, 0),
        byCategory: Object.fromEntries(counts.map((group) => [group.category, group.count])),
        nearest: nearest.map((feature) => ({
          sourceId: feature.external_id,
          name: stringOrNull(feature.properties.name),
          category: String(feature.properties.category),
          distanceMetres: Number(feature.distance),
        })),
        completeness: 'unknown',
      },
      METHOD_POI,
      [
        'Mapped counts are not a complete census of nearby POIs. Zero means no matching mapped features, not no real-world POIs.',
        ...(!coverage[0].complete
          ? ['Only part of this catchment lies inside the import coverage.']
          : []),
      ],
      !coverage[0].complete,
    );
  }

  private async traffic(
    manager: EntityManager,
    site: SiteLocation,
    row: ImportRow,
  ): Promise<ContextMetric<TrafficObservation[]>> {
    const features: FeatureRow[] = await manager.query(
      `SELECT external_id,properties,ST_Distance(geom::geography,${POINT_SQL}::geography) AS distance
      FROM enrichment_features WHERE import_id=$1 AND ST_DWithin(geom::geography,${POINT_SQL}::geography,1000)
      ORDER BY distance,external_id LIMIT 50`,
      [row.id, site.longitude, site.latitude],
    );
    if (!features.length)
      return missingLayer(
        row,
        METHOD_TRAFFIC,
        'No observed counting location within 1000 metres. Traffic remains unknown.',
      );
    return metric(
      row,
      features.map((feature) => ({
        sourceId: feature.external_id,
        observedFrom: String(feature.properties.startedAt),
        observedTo: String(feature.properties.endedAt),
        durationMinutes: Number(feature.properties.durationMinutes),
        count: feature.properties.count === null ? null : Number(feature.properties.count),
        unit: feature.properties.unit as TrafficObservation['unit'],
        direction: String(feature.properties.direction),
        vehicleClasses: feature.properties.vehicleClasses as string[],
        method: String(feature.properties.method),
        distanceMetres: Number(feature.distance),
      })),
      METHOD_TRAFFIC,
      [
        'Observed interval counts are not AADT and must not be scaled into reach or impressions.',
        ...(features.length === 50 ? ['Showing the nearest 50 counting locations.'] : []),
      ],
    );
  }
}

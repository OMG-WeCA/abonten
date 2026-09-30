import { randomUUID } from 'node:crypto';
import { stat, mkdir, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { DataSource, QueryRunner } from 'typeorm';
import { validateManifest, requiredString, type ImportManifest } from './manifest';
import { readVectorFeatures, type NormalizedFeature } from './adapters';
import { readOsmPbf } from './osm';
import {
  enrichmentDataDirectory,
  inspectPopulationRaster,
  preservePopulationRaster,
  publishImmutableFile,
  sha256File,
  type PopulationRasterInfo,
} from './raster';
export interface ImportResult {
  id: string;
  featureCount: number;
  replayed: boolean;
}
async function preserveVectorArtifact(path: string, checksum: string): Promise<string> {
  const suffix = /\.pbf$/i.test(path)
    ? 'pbf'
    : /\.(geojsons|geojsonl|ndjson)$/i.test(path)
      ? 'geojsons'
      : 'geojson';
  const dir = join(enrichmentDataDirectory(), 'raw');
  await mkdir(dir, { recursive: true, mode: 0o750 });
  const target = join(await realpath(dir), `${checksum}.${suffix}`);
  await publishImmutableFile(path, target, checksum);
  return target;
}
async function insertBatch(
  runner: QueryRunner,
  importId: string,
  batch: NormalizedFeature[],
  manifest: ImportManifest,
): Promise<void> {
  const data = JSON.stringify(batch);
  const invalid: { count: string }[] = await runner.query(
    `WITH features AS (
    SELECT ST_SetSRID(ST_GeomFromGeoJSON(f.geometry::text),4326) AS geom
    FROM jsonb_to_recordset($1::jsonb) f(geometry jsonb))
    SELECT count(*)::text AS count FROM features WHERE ST_IsEmpty(geom) OR NOT ST_IsValid(geom)
      OR NOT ST_CoveredBy(geom,ST_SetSRID(ST_GeomFromGeoJSON($2),4326))`,
    [data, JSON.stringify(manifest.coverage)],
  );
  if (Number(invalid[0]?.count))
    throw new Error('Features contain invalid geometry or lie outside manifest coverage');
  await runner.query(
    `INSERT INTO enrichment_features(import_id,external_id,geom,properties)
    SELECT $1,f."externalId",ST_SetSRID(ST_GeomFromGeoJSON(f.geometry::text),4326),f.properties
    FROM jsonb_to_recordset($2::jsonb) f("externalId" text,geometry jsonb,properties jsonb)`,
    [importId, data],
  );
}
/** Operator-only ingestion. There is deliberately no HTTP remote-fetch endpoint. */
export async function importDataset(
  dataSource: DataSource,
  options: { inputPath: string; manifest: unknown; operator: string },
): Promise<ImportResult> {
  const manifest = validateManifest(options.manifest);
  const operator = requiredString(options.operator, 'operator', 200);
  let input = resolve(options.inputPath);
  const inputStat = await stat(input);
  if (!inputStat.isFile() || inputStat.size === 0 || inputStat.size > 2 * 1024 ** 3)
    throw new Error('Input must be a non-empty regular local file no larger than 2 GiB');
  if ((await sha256File(input)) !== manifest.checksum)
    throw new Error('Input SHA-256 does not match manifest');
  let rasterPath: string | null = null;
  let rasterInfo: PopulationRasterInfo | null = null;
  if (manifest.layer === 'population') {
    rasterPath = await preservePopulationRaster(input, manifest.checksum);
    rasterInfo = await inspectPopulationRaster(rasterPath);
  } else {
    input = await preserveVectorArtifact(input, manifest.checksum);
  }
  const rawPath = rasterPath ?? input;
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
      `enrichment:${manifest.countryCode}:${manifest.sourceKey}:${manifest.layer}:${manifest.dataClass}`,
    ]);
    const prior: {
      id: string;
      checksum: string;
      feature_count: number;
      same_coverage: boolean;
      reference_year: number;
      published_at: Date | null;
      fetched_at: Date;
      licence: string;
      licence_url: string;
      attribution: string;
      source_url: string;
      original_crs: string;
      unit: string;
      quality: string;
      warnings: string[];
    }[] = await runner.query(
      `SELECT id,checksum,feature_count,reference_year,published_at,fetched_at,licence,licence_url,attribution,source_url,original_crs,unit,quality,warnings,
      ST_Equals(coverage,ST_SetSRID(ST_GeomFromGeoJSON($6),4326)) AS same_coverage FROM enrichment_imports
      WHERE country_code=$1 AND source_key=$2 AND layer=$3 AND version=$4 AND data_class=$5 FOR UPDATE`,
      [
        manifest.countryCode,
        manifest.sourceKey,
        manifest.layer,
        manifest.version,
        manifest.dataClass,
        JSON.stringify(manifest.coverage),
      ],
    );
    if (prior.length) {
      if (prior[0].checksum !== manifest.checksum)
        throw new Error('Version already exists with a different checksum; choose a new version');
      const p = prior[0];
      const stored = [
        p.reference_year,
        p.published_at?.toISOString() ?? null,
        p.fetched_at.toISOString(),
        p.licence,
        p.licence_url,
        p.attribution,
        p.source_url,
        p.original_crs,
        p.unit,
        p.quality,
        p.warnings,
      ];
      const incoming = [
        manifest.referenceYear,
        manifest.publishedAt ? new Date(manifest.publishedAt).toISOString() : null,
        new Date(manifest.fetchedAt).toISOString(),
        manifest.licence,
        manifest.licenceUrl,
        manifest.attribution,
        manifest.sourceUrl,
        manifest.originalCrs,
        manifest.unit,
        manifest.quality,
        manifest.warnings,
      ];
      if (!p.same_coverage || JSON.stringify(stored) !== JSON.stringify(incoming))
        throw new Error(
          'Version already exists with different provenance or coverage; choose a new operator revision',
        );
      await runner.commitTransaction();
      return { id: prior[0].id, featureCount: prior[0].feature_count, replayed: true };
    }
    const coverageValidity: { valid: boolean }[] = await runner.query(
      `SELECT ST_IsValid(g) AND NOT ST_IsEmpty(g) AND ST_Area(g::geography)>0 AS valid
      FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1),4326) AS g) c`,
      [JSON.stringify(manifest.coverage)],
    );
    if (!coverageValidity[0]?.valid) throw new Error('Coverage must be a valid non-empty polygon');
    if (rasterInfo) {
      const check: { covered: boolean }[] = await runner.query(
        `SELECT ST_CoveredBy(ST_SetSRID(ST_GeomFromGeoJSON($1),4326),ST_MakeEnvelope($2,$3,$4,$5,4326)) AS covered`,
        [JSON.stringify(manifest.coverage), ...rasterInfo.bounds],
      );
      if (!check[0]?.covered)
        throw new Error('Manifest coverage extends beyond actual raster extent');
    }
    const id = randomUUID();
    await runner.query(
      `INSERT INTO enrichment_imports(id,country_code,source_key,layer,data_class,version,reference_year,published_at,fetched_at,
      licence,licence_url,attribution,source_url,checksum,original_crs,coverage,unit,quality,warnings,raster_path,feature_count,active,operator)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($16),4326)),$17,$18,$19::jsonb,$20,0,false,$21)`,
      [
        id,
        manifest.countryCode,
        manifest.sourceKey,
        manifest.layer,
        manifest.dataClass,
        manifest.version,
        manifest.referenceYear,
        manifest.publishedAt,
        manifest.fetchedAt,
        manifest.licence,
        manifest.licenceUrl,
        manifest.attribution,
        manifest.sourceUrl,
        manifest.checksum,
        manifest.originalCrs,
        JSON.stringify(manifest.coverage),
        manifest.unit,
        manifest.quality,
        JSON.stringify(manifest.warnings),
        rasterPath,
        operator,
      ],
    );
    let featureCount = 0;
    if (!rasterPath) {
      const features = /\.pbf$/i.test(input)
        ? readOsmPbf(input, manifest)
        : readVectorFeatures(input, manifest);
      let batch: NormalizedFeature[] = [];
      for await (const feature of features) {
        if (++featureCount > 5_000_000) throw new Error('Dataset exceeds 5 million features');
        batch.push(feature);
        if (batch.length === 500) {
          await insertBatch(runner, id, batch, manifest);
          batch = [];
        }
      }
      if (batch.length) await insertBatch(runner, id, batch, manifest);
      if (!featureCount)
        throw new Error(
          'No usable features found; refusing to replace an active dataset with empty data',
        );
      if ((await sha256File(input)) !== manifest.checksum)
        throw new Error('Input changed during import; transaction rolled back');
    }
    await runner.query(
      `UPDATE enrichment_imports SET active=false WHERE country_code=$1 AND source_key=$2 AND layer=$3 AND data_class=$4 AND active=true`,
      [manifest.countryCode, manifest.sourceKey, manifest.layer, manifest.dataClass],
    );
    await runner.query(`UPDATE enrichment_imports SET active=true,feature_count=$2 WHERE id=$1`, [
      id,
      featureCount,
    ]);
    await runner.query(
      `INSERT INTO audit_logs(action,entity_type,entity_id,"after") VALUES($1,$2,$3,$4::json)`,
      [
        'enrichment.import',
        'enrichment_import',
        id,
        JSON.stringify({ ...manifest, rawPath, rasterPath, featureCount, operator }),
      ],
    );
    await runner.commitTransaction();
    return { id, featureCount, replayed: false };
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}

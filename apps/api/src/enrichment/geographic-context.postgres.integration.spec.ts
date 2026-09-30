import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { describe, it } from 'node:test';
import { DataSource } from 'typeorm';
import { GeographicContext1720000000009 } from '../migrations/1720000000009-GeographicContext';
import { GeographicContextService } from './geographic-context.service';
import { DatabaseService } from '../common/database.service';
import { InventoryService } from '../inventory/inventory.service';
import { preservePopulationRaster, sha256File } from './import/raster';
import { importDataset } from './import/importer';
import { bboxPolygon } from './import/geometry';

const databaseUrl = process.env.POSTGRES_INTEGRATION_URL;
const run = promisify(execFile);
const user = { userId: 'test-reader', email: 'reader@example.test', sessionVersion: 0 };

async function withSchema(test: (db: DataSource) => Promise<void>) {
  const schema = `context_${randomUUID().replaceAll('-', '')}`;
  const db = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    extra: { options: `-c search_path=${schema},public` },
  });
  await db.initialize();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    const runner = db.createQueryRunner();
    await new GeographicContext1720000000009().up(runner);
    await runner.release();
    await db.query(
      'CREATE TABLE billboard_sites (id uuid PRIMARY KEY, latitude double precision, longitude double precision, country text)',
    );
    await db.query(
      'CREATE TABLE audit_logs (id uuid DEFAULT gen_random_uuid(), action text, entity_type text, entity_id text, after json, at timestamptz DEFAULT now())',
    );
    await test(db);
  } finally {
    await db.query(`DROP SCHEMA "${schema}" CASCADE`);
    await db.destroy();
  }
}

async function source(
  db: DataSource,
  country: string,
  layer: string,
  options: { demo?: boolean; raster?: string; checksum?: string } = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO enrichment_imports
    (id,country_code,source_key,layer,data_class,version,reference_year,published_at,fetched_at,licence,licence_url,attribution,source_url,
     checksum,original_crs,coverage,unit,quality,warnings,raster_path,feature_count,active,operator)
    VALUES($1,$2,$3,$3,$4,'fixture-v1',2026,NULL,now(),'Test fixture','https://example.test/licence','Integration fixture only','https://example.test/data',
      $5,'EPSG:4326',ST_Multi(ST_MakeEnvelope(-4,4,16,14,4326)),$6,$7,'[]'::jsonb,$8,0,true,'integration-test')`,
    [
      id,
      country,
      layer,
      options.demo ? 'demo' : 'production',
      options.checksum ?? '1'.repeat(64),
      layer === 'population' ? 'persons_per_pixel' : 'features',
      layer === 'population' ? 'modelled' : 'mapped',
      options.raster ?? null,
    ],
  );
  return id;
}
async function featureAtDistance(
  db: DataSource,
  importId: string,
  id: string,
  metres: number,
  properties: object,
) {
  await db.query(
    `INSERT INTO enrichment_features(import_id,external_id,geom,properties)
    VALUES($1,$2,ST_Project(ST_SetSRID(ST_MakePoint(-.2,5.6),4326)::geography,$3::double precision,0::double precision)::geometry,$4::jsonb)`,
    [importId, id, metres, JSON.stringify(properties)],
  );
}
function service(db: DataSource): GeographicContextService {
  return new GeographicContextService(new DatabaseService(db), {
    assertCanReadSite: async () => 'owner',
  } as unknown as InventoryService);
}

describe('geographic context: actual PostGIS and local GDAL', { skip: !databaseUrl }, () => {
  it('uses metre radii, polygon containment, source provenance and country/demo isolation', async () =>
    withSchema(async (db) => {
      const ghSite = randomUUID(),
        ngSite = randomUUID();
      await db.query(
        "INSERT INTO billboard_sites VALUES($1,5.6,-.2,'Ghana'),($2,6.43,3.42,'NGA')",
        [ghSite, ngSite],
      );
      const poi = await source(db, 'GH', 'pois');
      await featureAtDistance(db, poi, 'node/1', 200, {
        name: 'Fixture school',
        category: 'education',
      });
      await featureAtDistance(db, poi, 'node/2', 510, {
        name: 'Fixture clinic',
        category: 'healthcare',
      });
      const road = await source(db, 'GH', 'roads');
      await featureAtDistance(db, road, 'way/1', 100, {
        name: 'Fixture road',
        roadClass: 'primary',
      });
      const admin = await source(db, 'GH', 'admin1');
      await db.query(
        `INSERT INTO enrichment_features VALUES($1,'fixture-admin',ST_MakeEnvelope(-.3,5.5,-.1,5.7,4326),'{"name":"Fixture region","level":1}'::jsonb)`,
        [admin],
      );
      const demo = await source(db, 'NG', 'pois', { demo: true });
      await featureAtDistance(db, demo, 'node/demo', 0, {
        name: 'Do not expose',
        category: 'shopping',
      });
      const context = await service(db).getSiteContext(user, 'own', ghSite);
      assert.ok(Math.abs(context.nearestRoad.value!.distanceMetres - 100) < 0.01);
      assert.deepEqual(
        context.catchments.map((item) => item.pois.value?.mappedCount),
        [1, 1, 2],
      );
      assert.equal(context.administrative[0].value?.[0].name, 'Fixture region');
      assert.equal(context.catchments[0].pois.provenance?.importId, poi);
      assert.equal(context.catchments[0].pois.value?.completeness, 'unknown');
      assert.equal(context.catchments[0].population.value, null);
      assert.equal(context.traffic.value, null);
      const nigeria = await service(db).getSiteContext(user, 'own', ngSite);
      assert.equal(nigeria.countryCode, 'NG');
      assert.equal(nigeria.catchments[0].pois.value, null);
      assert.equal(nigeria.nearestRoad.value, null);
      // An imported but empty map is different from no import.
      await source(db, 'NG', 'pois');
      const noMappedFeatures = await service(db).getSiteContext(user, 'own', ngSite);
      assert.equal(noMappedFeatures.catchments[0].pois.value?.mappedCount, 0);
      assert.match(
        noMappedFeatures.catchments[0].pois.warnings.join(' '),
        /not no real-world POIs/,
      );
    }));

  it('sums native population cells with fractional edges and distinguishes NoData, raster edge and valid zero', async () =>
    withSchema(async (db) => {
      const directory = await mkdtemp(join(tmpdir(), 'abonten-raster-test-'));
      const previous = process.env.ENRICHMENT_DATA_DIR;
      process.env.ENRICHMENT_DATA_DIR = join(directory, 'managed');
      try {
        const asc = join(directory, 'population.asc'),
          tif = join(directory, 'population.tif');
        // West half is NoData; east half is a valid uniform 10 people/pixel.
        const row = Array.from({ length: 40 }, (_, x) => (x < 20 ? '-99999' : '10')).join(' ');
        await writeFile(
          asc,
          `ncols 40\nnrows 40\nxllcorner -0.22\nyllcorner 5.58\ncellsize 0.001\nNODATA_value -99999\n${Array(40).fill(row).join('\n')}\n`,
        );
        await run('gdal_translate', ['-q', '-of', 'GTiff', '-a_srs', 'EPSG:4326', asc, tif]);
        const checksum = await sha256File(tif);
        const managed = await preservePopulationRaster(tif, checksum);
        await source(db, 'GH', 'population', { raster: managed, checksum });
        const id = randomUUID();
        await db.query("INSERT INTO billboard_sites VALUES($1,5.6,-.2,'Ghana')", [id]);
        const context = await service(db).getSiteContext(user, 'own', id);
        const p = context.catchments[0].population;
        assert.equal(p.status, 'partial');
        assert.ok(p.value!.validCoverageFraction > 0.49 && p.value!.validCoverageFraction < 0.51);
        assert.ok(p.value!.rasterCoverageFraction > 0.999);
        assert.ok(p.value!.people! > 70 && p.value!.people! < 90); // about half of 160, not area-scaled millions
        assert.ok(context.catchments[2].population.value!.people! > p.value!.people! * 15.8);
        await db.query('UPDATE billboard_sites SET longitude=-.215 WHERE id=$1', [id]);
        const allNoData = await service(db).getSiteContext(user, 'own', id);
        assert.equal(allNoData.catchments[0].population.status, 'unavailable');
        assert.equal(allNoData.catchments[0].population.value?.people, null);
        await db.query('UPDATE billboard_sites SET longitude=-.18 WHERE id=$1', [id]);
        const edge = await service(db).getSiteContext(user, 'own', id);
        assert.equal(edge.catchments[0].population.status, 'partial');
        assert.ok(edge.catchments[0].population.value!.rasterCoverageFraction < 0.51);
      } finally {
        if (previous === undefined) delete process.env.ENRICHMENT_DATA_DIR;
        else process.env.ENRICHMENT_DATA_DIR = previous;
        await rm(directory, { recursive: true, force: true });
      }
    }));

  it('imports atomically, replays idempotently, rejects provenance conflicts and rolls back audit failures', async () =>
    withSchema(async (db) => {
      const directory = await mkdtemp(join(tmpdir(), 'abonten-import-test-'));
      const previous = process.env.ENRICHMENT_DATA_DIR;
      process.env.ENRICHMENT_DATA_DIR = join(directory, 'managed');
      try {
        const input = join(directory, 'fixture.geojson');
        await writeFile(
          input,
          JSON.stringify({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                id: 'node/1',
                geometry: { type: 'Point', coordinates: [-0.2, 5.6] },
                properties: { amenity: 'school', name: 'Integration fixture' },
              },
            ],
          }),
        );
        const manifest = {
          countryCode: 'GH',
          sourceKey: 'osm-geofabrik',
          layer: 'pois',
          dataClass: 'production',
          version: 'integration-v1',
          referenceYear: 2026,
          publishedAt: null,
          fetchedAt: '2026-09-30T00:00:00Z',
          licence: 'ODbL-1.0',
          licenceUrl: 'https://www.openstreetmap.org/copyright',
          attribution: 'OpenStreetMap test fixture',
          sourceUrl: 'https://download.geofabrik.de/africa/ghana-latest.osm.pbf',
          checksum: await sha256File(input),
          originalCrs: 'EPSG:4326',
          coverage: bboxPolygon([-0.3, 5.5, -0.1, 5.7]),
          unit: 'features',
          quality: 'mapped',
          warnings: [],
        };
        const first = await importDataset(db, {
          inputPath: input,
          manifest,
          operator: 'test-operator',
        });
        assert.equal(first.featureCount, 1);
        assert.equal(first.replayed, false);
        assert.deepEqual(
          await importDataset(db, { inputPath: input, manifest, operator: 'test-operator' }),
          { ...first, replayed: true },
        );
        await assert.rejects(
          () =>
            importDataset(db, {
              inputPath: input,
              manifest: { ...manifest, attribution: 'Changed provenance' },
              operator: 'test-operator',
            }),
          /provenance|manifest|metadata/i,
        );
        assert.equal(
          Number((await db.query('SELECT count(*) AS count FROM audit_logs'))[0].count),
          1,
        );
        // Any failure in the append-only audit write must prevent activation too.
        await db.query(
          "ALTER TABLE audit_logs ADD CONSTRAINT test_audit_failure CHECK(action <> 'enrichment.import') NOT VALID",
        );
        await assert.rejects(
          () =>
            importDataset(db, {
              inputPath: input,
              manifest: { ...manifest, version: 'integration-v2' },
              operator: 'test-operator',
            }),
          /check constraint/,
        );
        const imports = await db.query('SELECT id,active FROM enrichment_imports');
        assert.deepEqual(imports, [{ id: first.id, active: true }]);
        await db.query('ALTER TABLE audit_logs DROP CONSTRAINT test_audit_failure');
        // Duplicate IDs after multiple batches must also leave the old snapshot intact.
        await writeFile(
          input,
          JSON.stringify({
            type: 'FeatureCollection',
            features: Array.from({ length: 501 }, (_, i) => ({
              type: 'Feature',
              id: `node/${i === 500 ? 0 : i}`,
              geometry: { type: 'Point', coordinates: [-0.2, 5.6] },
              properties: { amenity: 'school' },
            })),
          }),
        );
        const changedChecksum = await sha256File(input);
        await assert.rejects(
          () =>
            importDataset(db, {
              inputPath: input,
              manifest: { ...manifest, version: 'integration-v3', checksum: changedChecksum },
              operator: 'test-operator',
            }),
          /duplicate key/,
        );
        assert.equal(
          Number((await db.query('SELECT count(*) AS count FROM enrichment_imports'))[0].count),
          1,
        );
        assert.equal(
          Number((await db.query('SELECT count(*) AS count FROM enrichment_features'))[0].count),
          1,
        );
        assert.equal(
          Number((await db.query('SELECT count(*) AS count FROM audit_logs'))[0].count),
          1,
        );
      } finally {
        if (previous === undefined) delete process.env.ENRICHMENT_DATA_DIR;
        else process.env.ENRICHMENT_DATA_DIR = previous;
        await rm(directory, { recursive: true, force: true });
      }
    }));

  it('rejects invalid geometry and can revert only enrichment tables', async () =>
    withSchema(async (db) => {
      const id = await source(db, 'GH', 'pois');
      await assert.rejects(
        () =>
          db.query(
            `INSERT INTO enrichment_features VALUES($1,'bad',ST_GeomFromText('POLYGON((0 0,1 1,1 0,0 1,0 0))',4326),'{}')`,
            [id],
          ),
        /check constraint/,
      );
      const runner = db.createQueryRunner();
      await new GeographicContext1720000000009().down(runner);
      await runner.release();
      const rows = await db.query(
        "SELECT (SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='enrichment_imports') AS imports, (SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='audit_logs') AS audit",
      );
      assert.equal(rows[0].imports, null);
      assert.ok(rows[0].audit);
    }));
});

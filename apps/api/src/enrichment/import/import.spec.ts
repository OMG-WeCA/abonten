import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { countryFor, configuredSource } from '../registry';
import { bboxPolygon, validateGeometry } from './geometry';
import { validateManifest, type ImportManifest } from './manifest';
import { normalizeFeature, osmTags, readVectorFeatures } from './adapters';
import { isRegisteredUrl } from './download';
import { importDataset } from './importer';
import { readOsmPbf } from './osm';
import {
  inspectPopulationRaster,
  preservePopulationRaster,
  readPopulationCells,
  sha256File,
} from './raster';
import { runTool } from './process';
import type { DataSource } from 'typeorm';
function manifest(extra: Record<string, unknown> = {}): ImportManifest {
  return validateManifest({
    countryCode: 'Ghana',
    sourceKey: 'osm-geofabrik',
    layer: 'roads',
    dataClass: 'production',
    version: '2026-09-29',
    referenceYear: 2026,
    publishedAt: null,
    fetchedAt: '2026-09-30T09:00:00Z',
    licence: 'ODbL-1.0',
    licenceUrl: 'https://www.openstreetmap.org/copyright',
    attribution: '© OpenStreetMap contributors',
    sourceUrl: configuredSource('GH', 'osm-geofabrik')!.url,
    checksum: 'a'.repeat(64),
    originalCrs: 'EPSG:4326',
    coverage: bboxPolygon(countryFor('GH')!.bbox),
    unit: 'features',
    quality: 'mapped',
    warnings: [],
    ...extra,
  });
}
const road = {
  type: 'Feature',
  properties: {
    osm_id: '123',
    highway: 'primary',
    name: 'Test Road',
    other_tags: '"lanes"=>"2","oneway"=>"yes"',
  },
  geometry: {
    type: 'LineString',
    coordinates: [
      [-0.2, 5.5],
      [-0.19, 5.51],
    ],
  },
};
test('country aliases normalize NG/GH ISO2 ISO3/name without guessing unsupported countries', () => {
  assert.equal(countryFor(' NGA ')?.code, 'NG');
  assert.equal(countryFor('Republic of Ghana')?.code, 'GH');
  assert.equal(countryFor('CM'), undefined);
  assert.equal(configuredSource('GH', 'made-up'), undefined);
});
test('manifest requires explicit provenance, known licence, quality, units and digest', () => {
  assert.equal(manifest().countryCode, 'GH');
  for (const bad of [
    { checksum: 'foo' },
    { dataClass: undefined },
    { publishedAt: undefined },
    { licence: 'public domain' },
    { quality: 'observed' },
    { unit: 'vehicles' },
    { sourceUrl: 'https://example.com/forged' },
    { licenceUrl: 'https://example.com/licence' },
    { rasterPath: '/etc/passwd' },
    { fetchedAt: '2026-02-30T09:00:00Z' },
    { originalCrs: 'EPSG:3857' },
    { layer: 'population' },
  ]) {
    assert.throws(() => manifest(bad));
  }
});
test('geometry rejects invalid positions, wrong country, empty/unclosed rings', () => {
  assert.throws(() => validateGeometry({ type: 'Point', coordinates: [NaN, 5] }));
  assert.throws(() =>
    validateGeometry({ type: 'Point', coordinates: [180, 5] }, countryFor('GH')!.bbox),
  );
  assert.throws(() =>
    validateGeometry({
      type: 'Polygon',
      coordinates: [
        [
          [0, 5],
          [1, 5],
          [1, 6],
          [0, 6],
        ],
      ],
    }),
  );
  assert.throws(() => validateGeometry({ type: 'Polygon', coordinates: [] }));
});
test('OSM roads preserve observed tags without synthesizing counts or speeds', () => {
  const result = normalizeFeature(road, manifest())!;
  assert.equal(result.externalId, 'way/123');
  assert.equal(result.properties.lanes, '2');
  assert.equal(result.properties.maxspeed, null);
  assert.equal(result.properties.trafficCount, undefined);
  assert.equal(
    osmTags({ other_tags: '"name"=>"A \\"quoted\\" street"' }).name,
    'A "quoted" street',
  );
});
test('POIs retain category, handle polygon shapes, and discard non-POI OSM objects', () => {
  const m = manifest({ layer: 'pois' });
  const result = normalizeFeature(
    {
      ...road,
      properties: { osm_id: '8', amenity: 'school' },
      geometry: bboxPolygon([-0.2, 5.5, -0.19, 5.51]),
    },
    m,
  )!;
  assert.equal(result.properties.category, 'education');
  assert.equal(result.properties.subcategory, 'school');
  assert.equal(
    normalizeFeature(
      {
        ...road,
        properties: { osm_id: '8' },
        geometry: { type: 'Point', coordinates: [-0.2, 5.5] },
      },
      m,
    ),
    null,
  );
});
test('geoBoundaries checks country and ADM level and preserves shapeID', () => {
  const m = manifest({
    sourceKey: 'geoboundaries-adm1',
    layer: 'admin1',
    unit: 'administrative_areas',
    licence: 'CC-BY-SA-2.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    sourceUrl: configuredSource('GH', 'geoboundaries-adm1')!.url,
  });
  const feature = {
    type: 'Feature',
    properties: { shapeID: 'A', shapeName: 'Greater Accra', shapeGroup: 'GHA', shapeType: 'ADM1' },
    geometry: bboxPolygon([-0.2, 5.5, -0.19, 5.51]),
  };
  assert.equal(normalizeFeature(feature, m)!.properties.shapeId, 'A');
  assert.throws(() =>
    normalizeFeature({ ...feature, properties: { ...feature.properties, shapeGroup: 'NGA' } }, m),
  );
});
test('observed traffic requires a real interval and definitions, preserves unknown count', () => {
  const m = manifest({
    sourceKey: 'observed-traffic',
    layer: 'traffic',
    quality: 'observed',
    unit: 'observations',
    sourceUrl: 'https://agency.example/survey/42',
    licence: 'operator-authorized',
    licenceUrl: 'https://agency.example/licence',
  });
  const props = {
    startedAt: '2026-09-29T08:00:00Z',
    endedAt: '2026-09-29T09:00:00Z',
    durationMinutes: 60,
    unit: 'vehicles',
    direction: 'eastbound',
    vehicleClasses: ['cars', 'buses'],
    method: 'manual tally',
  };
  const f = { ...road, id: 'counter/42', properties: props };
  assert.equal(normalizeFeature(f, m)!.properties.count, null);
  for (const bad of [
    { durationMinutes: 30 },
    { count: -1 },
    { unit: 'AADT' },
    { direction: null },
    { vehicleClasses: [] },
    { endedAt: '2026-09-29T07:00:00Z' },
  ]) {
    assert.throws(() => normalizeFeature({ ...f, properties: { ...props, ...bad } }, m));
  }
  assert.equal(
    normalizeFeature(
      { ...f, properties: { ...props, unit: 'pedestrians', vehicleClasses: [], count: 3 } },
      m,
    )!.properties.count,
    3,
  );
});
test('download URLs reject private endpoints, path tricks, credentials and unofficial redirects', () => {
  const source = configuredSource('GH', 'osm-geofabrik')!;
  assert.equal(isRegisteredUrl(source.url!, source), true);
  for (const url of [
    'http://127.0.0.1',
    'https://download.geofabrik.de.evil.test/africa/ghana-latest.osm.pbf',
    `${source.url}?token=secret`,
    source.url!.replace('https://', 'https://user:password@'),
    `${source.url}/more`,
  ]) {
    assert.equal(isRegisteredUrl(url, source), false);
  }
});
test('GeoJSONSeq streams records and importer checksum fails before opening a transaction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'abonten-adapter-test-'));
  try {
    const path = join(dir, 'roads.geojsons');
    await writeFile(path, `\x1e${JSON.stringify(road)}\n`);
    const features = [];
    for await (const feature of readVectorFeatures(path, manifest())) features.push(feature);
    assert.equal(features.length, 1);
    const ds = {
      createQueryRunner() {
        throw new Error('Must not open transaction');
      },
    } as unknown as DataSource;
    await assert.rejects(
      importDataset(ds, { inputPath: path, manifest: manifest(), operator: 'test' }),
      /SHA-256/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('native raster extraction preserves pixel counts, NoData and bounded cell geometry', async (t) => {
  try {
    await runTool('gdalinfo', ['--version']);
  } catch {
    t.skip('GDAL is an optional system prerequisite for raster integration');
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'abonten-raster-test-'));
  const previous = process.env.ENRICHMENT_DATA_DIR;
  process.env.ENRICHMENT_DATA_DIR = join(dir, 'managed');
  try {
    const ascii = join(dir, 'tiny.asc'),
      tif = join(dir, 'tiny.tif');
    await writeFile(
      ascii,
      'ncols 2\nnrows 2\nxllcorner -0.20\nyllcorner 5.50\ncellsize 0.001\nNODATA_value -9999\n10 -9999\n0 25.5\n',
    );
    await runTool('gdal_translate', ['-q', '-of', 'GTiff', '-a_srs', 'EPSG:4326', ascii, tif]);
    const info = await inspectPopulationRaster(tif);
    assert.equal(info.width, 2);
    assert.equal(info.noData, -9999);
    const hash = await sha256File(tif);
    const copies = await Promise.all([
      preservePopulationRaster(tif, hash),
      preservePopulationRaster(tif, hash),
    ]);
    assert.equal(copies[0], copies[1]);
    const managed = copies[0];
    assert.ok((await readFile(managed)).length > 0);
    const result = await readPopulationCells(managed, [-0.2, 5.5, -0.198, 5.502], { maxCells: 4 });
    assert.deepEqual(
      result.cells.map((cell) => cell.value),
      [10, null, 0, 25.5],
    );
    assert.equal(result.cells[0].geometry.type, 'Polygon');
    assert.ok(result.warnings.some((w) => w.includes('NoData')));
    await assert.rejects(
      readPopulationCells(managed, [-0.2, 5.5, -0.198, 5.502], { maxCells: 1 }),
      /exceeds/,
    );
    await assert.rejects(readPopulationCells(tif, [-0.2, 5.5, -0.198, 5.502]), /managed/);
  } finally {
    if (previous === undefined) delete process.env.ENRICHMENT_DATA_DIR;
    else process.env.ENRICHMENT_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('OSM adapter restricts driver so a renamed VRT cannot resolve nested data sources', async (t) => {
  try {
    await runTool('gdalinfo', ['--version']);
  } catch {
    t.skip('GDAL system prerequisite unavailable');
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'abonten-osm-driver-test-'));
  try {
    const path = join(dir, 'pretend.pbf');
    await writeFile(
      path,
      '<OGRVRTDataSource><OGRVRTLayer name="roads"><SrcDataSource>/not-an-authorized-source.geojson</SrcDataSource></OGRVRTLayer></OGRVRTDataSource>',
    );
    await assert.rejects(async () => {
      for await (const _feature of readOsmPbf(path, manifest())) {
        /* must not yield */
      }
    }, /ogr2ogr failed/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

/** Minimal valid binary OSM-PBF fixture, avoiding a network dependency in CI. */
function osmPbfFixture(): Buffer {
  const uint = (value: number): Buffer => {
    let n = BigInt(value);
    const bytes: number[] = [];
    do {
      const low = Number(n & 127n);
      n >>= 7n;
      bytes.push(low | (n ? 128 : 0));
    } while (n);
    return Buffer.from(bytes);
  };
  const zig = (value: number) => uint(value < 0 ? -value * 2 - 1 : value * 2);
  const field = (number: number, bytes: Buffer, wire = 2) =>
    Buffer.concat([uint(number * 8 + wire), ...(wire === 2 ? [uint(bytes.length)] : []), bytes]);
  const text = (number: number, value: string) => field(number, Buffer.from(value));
  const node = (id: number, lon: number, lat: number, poi = false) =>
    field(
      1,
      Buffer.concat([
        field(1, zig(id), 0),
        ...(poi ? [field(2, uint(5)), field(3, uint(6))] : []),
        field(8, zig(Math.round(lat * 1e7)), 0),
        field(9, zig(Math.round(lon * 1e7)), 0),
      ]),
    );
  const stringTable = field(
    1,
    Buffer.concat(
      ['', 'highway', 'primary', 'name', 'Main Road', 'amenity', 'school'].map((s) => text(1, s)),
    ),
  );
  const way = field(
    3,
    Buffer.concat([
      field(1, uint(100), 0),
      field(2, Buffer.concat([uint(1), uint(3)])),
      field(3, Buffer.concat([uint(2), uint(4)])),
      field(8, Buffer.concat([zig(1), zig(1)])),
    ]),
  );
  const primitiveBlock = Buffer.concat([
    stringTable,
    field(
      2,
      Buffer.concat([node(1, -0.2, 5.5), node(2, -0.19, 5.51), node(3, -0.199, 5.501, true), way]),
    ),
  ]);
  const block = (type: string, raw: Buffer) => {
    const blob = field(1, raw);
    const header = Buffer.concat([text(1, type), field(3, uint(blob.length), 0)]);
    const size = Buffer.alloc(4);
    size.writeUInt32BE(header.length);
    return Buffer.concat([size, header, blob]);
  };
  return Buffer.concat([
    block('OSMHeader', text(4, 'OsmSchema-V0.6')),
    block('OSMData', primitiveBlock),
  ]);
}
test('binary OSM PBF preprocesses roads/POIs with stable IDs and clips border-crossing ways', async (t) => {
  try {
    await runTool('gdalinfo', ['--version']);
  } catch {
    t.skip('GDAL system prerequisite unavailable');
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'abonten-pbf-test-'));
  try {
    const path = join(dir, 'tiny.osm.pbf');
    await writeFile(path, osmPbfFixture());
    const coverage = bboxPolygon([-0.201, 5.499, -0.1945123456789012, 5.506]);
    const roads = [];
    for await (const feature of readOsmPbf(path, manifest({ coverage }))) roads.push(feature);
    assert.equal(roads.length, 1);
    assert.equal(roads[0].externalId, 'way/100');
    assert.equal(roads[0].properties.name, 'Main Road');
    validateGeometry(roads[0].geometry, [-0.201, 5.499, -0.1945123456789012, 5.506]);
    const pois = [];
    for await (const feature of readOsmPbf(path, manifest({ coverage, layer: 'pois' })))
      pois.push(feature);
    assert.equal(pois.length, 1);
    assert.equal(pois[0].externalId, 'node/3');
    assert.equal(pois[0].properties.category, 'education');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('WorldPop cannot omit mandatory alpha/model warnings or relabel the product vintage', () => {
  const source = configuredSource('GH', 'worldpop-r2025a-2026')!;
  const input = {
    sourceKey: source.key,
    layer: 'population',
    version: source.version,
    referenceYear: 2026,
    quality: 'modelled',
    unit: 'persons_per_pixel',
    licence: source.licence,
    licenceUrl: source.licenceUrl,
    sourceUrl: source.url,
  };
  const first = manifest(input);
  assert.ok(first.warnings.some((w) => w.includes('alpha')));
  assert.ok(first.warnings.some((w) => w.includes('modelled/projected')));
  assert.deepEqual(validateManifest(first).warnings, first.warnings);
  assert.equal(
    manifest({ ...input, version: 'R2025A-v1-2026@corrected-coverage-2' }).version,
    'R2025A-v1-2026@corrected-coverage-2',
  );
  assert.throws(() => manifest({ ...input, referenceYear: 2020 }));
  assert.throws(() => manifest({ ...input, version: 'unrelated-product' }));
});

test('unrelated OSM polygon collections are filtered before POI geometry validation', () => {
  const collection = {
    type: 'GeometryCollection',
    geometries: [
      bboxPolygon([-0.2, 5.5, -0.19, 5.51]),
      {
        type: 'LineString',
        coordinates: [
          [-0.2, 5.5],
          [-0.19, 5.51],
        ],
      },
    ],
  };
  const raw = {
    type: 'Feature',
    properties: { osm_id: '9814534', natural: 'scrub' },
    geometry: collection,
  };
  assert.equal(normalizeFeature(raw, manifest({ layer: 'pois' })), null);
  // A genuinely relevant unsupported geometry still fails clearly rather than silently disappearing.
  assert.throws(
    () =>
      normalizeFeature(
        { ...raw, properties: { ...raw.properties, amenity: 'school' } },
        manifest({ layer: 'pois' }),
      ),
    /9814534.*Unsupported geometry type/,
  );
});
test('original external raster mask/metadata sidecars are rejected before managed publication', async (t) => {
  try {
    await runTool('gdalinfo', ['--version']);
  } catch {
    t.skip('GDAL system prerequisite unavailable');
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'abonten-mask-test-'));
  const old = process.env.ENRICHMENT_DATA_DIR;
  process.env.ENRICHMENT_DATA_DIR = join(dir, 'managed');
  try {
    const source = join(dir, 'source.asc'),
      tif = join(dir, 'source.tif');
    await writeFile(
      source,
      'ncols 1\nnrows 1\nxllcorner -0.20\nyllcorner 5.50\ncellsize 0.001\nNODATA_value -9999\n100\n',
    );
    await runTool('gdal_translate', ['-q', '-of', 'GTiff', '-a_srs', 'EPSG:4326', source, tif]);
    const checksum = await sha256File(tif);
    for (const suffix of ['.msk', '.MSK', '.aUx.XmL']) {
      await writeFile(`${tif}${suffix}`, 'Sidecar bytes must never be ignored or passed to GDAL');
      await assert.rejects(inspectPopulationRaster(tif), /sidecar/);
      await assert.rejects(preservePopulationRaster(tif, checksum), /sidecar/);
      await rm(`${tif}${suffix}`);
    }
    assert.equal((await inspectPopulationRaster(tif)).width, 1);
  } finally {
    if (old === undefined) delete process.env.ENRICHMENT_DATA_DIR;
    else process.env.ENRICHMENT_DATA_DIR = old;
    await rm(dir, { recursive: true, force: true });
  }
});

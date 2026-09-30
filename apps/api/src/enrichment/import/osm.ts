import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runTool } from './process';
import { readVectorFeatures, POI_KEYS, type NormalizedFeature } from './adapters';
import type { ImportManifest } from './manifest';
/** GDAL's OSM driver reads real PBF, resolves ways/relations, and emits WGS84 GeoJSONSeq. */
export async function* readOsmPbf(
  path: string,
  manifest: ImportManifest,
): AsyncGenerator<NormalizedFeature> {
  if (manifest.sourceKey !== 'osm-geofabrik' || !['roads', 'pois'].includes(manifest.layer))
    throw new Error('PBF is only supported by the OSM roads/POI adapter');
  const dir = await mkdtemp(join(tmpdir(), 'abonten-osm-'));
  try {
    const footprint = join(dir, 'coverage.geojson');
    await writeFile(
      footprint,
      JSON.stringify({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: manifest.coverage }],
      }),
    );
    // Define fields explicitly rather than depending on a machine-specific osmconf.ini.
    const config = join(dir, 'osmconf.ini');
    const attributes = ['name', 'highway', 'ref', 'oneway', 'lanes', 'maxspeed', ...POI_KEYS].join(
      ',',
    );
    await writeFile(
      config,
      'closed_ways_are_polygons=aeroway,amenity,boundary,building,craft,geological,historic,landuse,leisure,military,natural,office,place,shop,sport,tourism,highway=platform,public_transport=platform\n' +
        ['points', 'lines', 'multipolygons', 'multilinestrings', 'other_relations']
          .map((name) => `[${name}]\nosm_id=yes\nattributes=${attributes}\nother_tags=yes\n`)
          .join('\n'),
    );
    const layers = manifest.layer === 'roads' ? ['lines'] : ['points', 'multipolygons'];
    for (const layer of layers) {
      const output = join(dir, `${layer}.geojsons`);
      const args = [
        '--config',
        'OSM_CONFIG_FILE',
        config,
        '-if',
        'OSM',
        '-f',
        'GeoJSONSeq',
        '-lco',
        'COORDINATE_PRECISION=17',
        output,
        resolve(path),
        layer,
        '-t_srs',
        'EPSG:4326',
        '-clipsrc',
        footprint,
      ];
      args.push(
        '-where',
        layer === 'lines'
          ? 'highway IS NOT NULL'
          : POI_KEYS.map((key) => `${key} IS NOT NULL`).join(' OR '),
      );
      // A national PBF is large; this operator-only process may take up to 30 minutes.
      await runTool('ogr2ogr', args, 2 * 1024 * 1024, 30 * 60_000);
      yield* readVectorFeatures(output, manifest);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

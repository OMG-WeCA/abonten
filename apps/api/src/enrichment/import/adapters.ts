import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { countryFor } from '../registry';
import { record, validateGeometry, type Geometry } from './geometry';
import { requiredString, timestamp, type ImportManifest } from './manifest';
export interface NormalizedFeature {
  externalId: string;
  geometry: Geometry;
  properties: Record<string, unknown>;
}
export const POI_KEYS = [
  'amenity',
  'shop',
  'tourism',
  'leisure',
  'office',
  'public_transport',
  'railway',
  'aeroway',
  'historic',
] as const;
function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 2000) : null;
}
/** GDAL OSM's documented other_tags representation is escaped PostgreSQL hstore. */
export function osmTags(properties: Record<string, unknown>): Record<string, string> {
  const tags: Record<string, string> = {};
  if (properties.tags && typeof properties.tags === 'object' && !Array.isArray(properties.tags)) {
    for (const [key, value] of Object.entries(properties.tags))
      if (typeof value === 'string') tags[key] = value;
  }
  if (typeof properties.other_tags === 'string') {
    for (const match of properties.other_tags.matchAll(
      /"((?:[^"\\]|\\.)*)"\s*=>\s*"((?:[^"\\]|\\.)*)"/g,
    )) {
      const unescape = (s: string) => s.replace(/\\(.)/g, '$1');
      tags[unescape(match[1])] = unescape(match[2]);
    }
  }
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === 'string' && !['other_tags', 'osm_id', 'osm_way_id'].includes(key))
      tags[key] = value;
  }
  return tags;
}
function poiCategory(key: string, value: string): string {
  if (key === 'amenity') {
    if (['school', 'college', 'university', 'kindergarten', 'library'].includes(value))
      return 'education';
    if (['hospital', 'clinic', 'doctors', 'dentist', 'pharmacy'].includes(value))
      return 'healthcare';
    if (value === 'marketplace') return 'shopping';
    if (value === 'place_of_worship') return 'religious';
    if (['bus_station', 'ferry_terminal', 'parking', 'fuel'].includes(value)) return 'transport';
    if (['restaurant', 'cafe', 'bar', 'fast_food', 'pub'].includes(value)) return 'food_and_drink';
    return value;
  }
  if (key === 'shop') return 'shopping';
  if (['public_transport', 'railway', 'aeroway'].includes(key)) return 'transport';
  if (key === 'office') return 'business';
  return key;
}
function featureId(
  raw: Record<string, unknown>,
  props: Record<string, unknown>,
  type: string,
): string {
  const id =
    props.externalId ?? props['@id'] ?? props.shapeID ?? props.osm_way_id ?? props.osm_id ?? raw.id;
  if ((typeof id !== 'string' && typeof id !== 'number') || !String(id).trim())
    throw new Error('Feature must have a stable external ID');
  const str = String(id);
  if (str.length > 200) throw new Error('Feature external ID is too long');
  if (/^(node|way|relation)\//.test(str)) return str;
  if (props.osm_way_id) return `way/${str}`;
  if (props.osm_id)
    return `${type === 'Point' ? 'node' : type === 'LineString' || type === 'MultiLineString' ? 'way' : 'relation'}/${str}`;
  return str;
}
export function normalizeFeature(
  value: unknown,
  manifest: ImportManifest,
): NormalizedFeature | null {
  const raw = record(value, 'feature');
  if (raw.type !== 'Feature') throw new Error('Expected a GeoJSON Feature');
  const props = record(raw.properties ?? {}, 'feature properties');
  const country = countryFor(manifest.countryCode)!;
  const tags = osmTags(props);
  const poiKey = manifest.layer === 'pois' ? POI_KEYS.find((key) => tags[key]) : undefined;
  // Source extracts include buildings, land cover and boundaries that are not POIs.
  // Filter by source semantics before applying a POI-only geometry contract.
  if (manifest.layer === 'pois' && !poiKey) return null;
  if (manifest.layer === 'roads' && !tags.highway) return null;
  let geometry: Geometry;
  try {
    geometry = validateGeometry(raw.geometry, country.bbox);
  } catch (error) {
    throw new Error(
      `Feature ${String(props.osm_way_id ?? props.osm_id ?? props.shapeID ?? raw.id ?? 'unknown')}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const externalId = featureId(raw, props, geometry.type);
  if (manifest.layer === 'roads') {
    if (!['LineString', 'MultiLineString'].includes(geometry.type))
      throw new Error('Roads require line geometry');
    // Do not derive counts, speed, lane count or traffic direction when OSM does not supply them.
    return {
      externalId,
      geometry,
      properties: {
        name: optionalText(tags.name),
        roadClass: tags.highway,
        ref: optionalText(tags.ref),
        oneway: optionalText(tags.oneway),
        lanes: optionalText(tags.lanes),
        maxspeed: optionalText(tags.maxspeed),
      },
    };
  }
  if (manifest.layer === 'pois') {
    if (!['Point', 'Polygon', 'MultiPolygon'].includes(geometry.type))
      throw new Error('POIs require point or polygon geometry');
    const key = poiKey!;
    const safeTags = Object.fromEntries(
      POI_KEYS.filter((key) => tags[key]).map((key) => [key, tags[key]]),
    );
    return {
      externalId,
      geometry,
      properties: {
        name: optionalText(tags.name),
        category: poiCategory(key, tags[key]),
        subcategory: tags[key],
        osmTags: safeTags,
      },
    };
  }
  if (manifest.layer === 'admin1' || manifest.layer === 'admin2') {
    if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')
      throw new Error('Administrative boundaries require polygons');
    const level = manifest.layer === 'admin1' ? 1 : 2;
    if (props.shapeType !== `ADM${level}` || props.shapeGroup !== country.iso3)
      throw new Error('Boundary country/level does not match manifest');
    return {
      externalId,
      geometry,
      properties: {
        name: requiredString(props.shapeName, 'shapeName'),
        level,
        shapeId: requiredString(props.shapeID, 'shapeID'),
        shapeGroup: country.iso3,
        shapeISO: optionalText(props.shapeISO),
      },
    };
  }
  if (manifest.layer === 'traffic') return normalizeTraffic(externalId, geometry, props);
  throw new Error('Population must be imported as a GeoTIFF');
}
function normalizeTraffic(
  externalId: string,
  geometry: Geometry,
  props: Record<string, unknown>,
): NormalizedFeature {
  if (!['Point', 'LineString', 'MultiLineString'].includes(geometry.type))
    throw new Error('Observed traffic requires point/line geometry');
  const startedAt = timestamp(props.startedAt, 'startedAt');
  const endedAt = timestamp(props.endedAt, 'endedAt');
  const durationMinutes = props.durationMinutes;
  if (
    typeof durationMinutes !== 'number' ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0
  )
    throw new Error('Traffic durationMinutes must be positive');
  const elapsed = (Date.parse(endedAt) - Date.parse(startedAt)) / 60000;
  if (elapsed <= 0 || Math.abs(elapsed - durationMinutes) > 1 / 60)
    throw new Error('Traffic duration must match observation timestamps');
  const count = props.count ?? null;
  if (count !== null && (!Number.isSafeInteger(count) || Number(count) < 0))
    throw new Error('Traffic count must be a non-negative integer or null');
  if (props.unit !== 'vehicles' && props.unit !== 'pedestrians')
    throw new Error(
      'Observed traffic unit must be vehicles or pedestrians; do not relabel AADT or estimates',
    );
  const direction = requiredString(props.direction, 'direction', 200);
  const vehicleClasses = props.vehicleClasses;
  if (
    !Array.isArray(vehicleClasses) ||
    (props.unit === 'vehicles' && vehicleClasses.length === 0) ||
    vehicleClasses.length > 50 ||
    vehicleClasses.some((x) => typeof x !== 'string' || !x.trim() || x.length > 100)
  ) {
    throw new Error('vehicleClasses must be a string array, non-empty for vehicle counts');
  }
  const method = requiredString(props.method, 'traffic method', 500);
  return {
    externalId,
    geometry,
    properties: {
      count,
      unit: props.unit,
      startedAt,
      endedAt,
      durationMinutes,
      direction,
      vehicleClasses,
      method,
    },
  };
}
/** GeoJSONSeq is streamed for national extracts. GeoJSON FeatureCollections are capped at 256 MiB. */
export async function* readVectorFeatures(
  path: string,
  manifest: ImportManifest,
): AsyncGenerator<NormalizedFeature> {
  if (/\.(geojsons|geojsonl|ndjson)$/i.test(path)) {
    const input = createReadStream(path, { encoding: 'utf8' });
    const lines = createInterface({ input, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        const cleaned = (line.startsWith(String.fromCharCode(30)) ? line.slice(1) : line).trim();
        if (!cleaned) continue;
        if (cleaned.length > 32 * 1024 * 1024) throw new Error('GeoJSONSeq feature exceeds 32 MiB');
        const normalized = normalizeFeature(JSON.parse(cleaned), manifest);
        if (normalized) yield normalized;
      }
    } finally {
      lines.close();
      input.destroy();
    }
    return;
  }
  if ((await stat(path)).size > 256 * 1024 * 1024)
    throw new Error('GeoJSON exceeds 256 MiB; use GeoJSONSeq for large extracts');
  const parsed = record(JSON.parse(await readFile(path, 'utf8')), 'GeoJSON');
  if (parsed.crs) {
    const crs = JSON.stringify(parsed.crs);
    if (!crs.includes('CRS84') && !crs.includes('EPSG::4326') && !crs.includes('EPSG:4326'))
      throw new Error('GeoJSON CRS must be WGS84');
  }
  if (parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features))
    throw new Error('Expected GeoJSON FeatureCollection');
  for (const raw of parsed.features) {
    const feature = normalizeFeature(raw, manifest);
    if (feature) yield feature;
  }
}

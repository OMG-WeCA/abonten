import { configuredSource, countryFor, type EnrichmentLayer } from '../registry';
import { record, validateGeometry, type Coverage } from './geometry';
export interface ImportManifest {
  countryCode: string;
  sourceKey: string;
  layer: EnrichmentLayer;
  dataClass: 'demo' | 'production';
  version: string;
  referenceYear: number;
  publishedAt: string | null;
  fetchedAt: string;
  licence: string;
  licenceUrl: string;
  attribution: string;
  sourceUrl: string;
  checksum: string;
  originalCrs: string;
  coverage: Coverage;
  unit: string;
  quality: 'mapped' | 'modelled' | 'observed';
  warnings: string[];
  rasterPath?: string;
}
export function requiredString(value: unknown, label: string, max = 1000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`${label} must be a non-empty string (max ${max})`);
  return value.trim();
}
export function timestamp(value: unknown, label: string): string {
  const s = requiredString(value, label, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(s) ||
    !Number.isFinite(Date.parse(s))
  ) {
    throw new Error(`${label} must be an ISO-8601 UTC timestamp`);
  }
  if (new Date(s).toISOString().slice(0, 10) !== s.slice(0, 10))
    throw new Error(`${label} is not a real date`);
  return s;
}
function httpsUrl(value: unknown, label: string): string {
  const s = requiredString(value, label, 2048);
  const url = new URL(s);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash)
    throw new Error(`${label} must be an HTTPS URL without credentials or fragment`);
  return s;
}
/** Runtime validation is mandatory; TypeScript types alone cannot validate operator files. */
export function validateManifest(value: unknown): ImportManifest {
  const raw = record(value, 'manifest');
  const country = countryFor(requiredString(raw.countryCode, 'countryCode'));
  if (!country) throw new Error('Unsupported country; register it before importing');
  const sourceKey = requiredString(raw.sourceKey, 'sourceKey', 100);
  const source = configuredSource(country.code, sourceKey);
  if (!source) throw new Error('Source is not registered for this country');
  const layer = requiredString(raw.layer, 'layer') as EnrichmentLayer;
  if (!source.layers.includes(layer)) throw new Error('Source does not supply this layer');
  if (raw.dataClass !== 'demo' && raw.dataClass !== 'production')
    throw new Error('dataClass must be explicit: demo or production');
  if (
    !Number.isInteger(raw.referenceYear) ||
    Number(raw.referenceYear) < 1900 ||
    Number(raw.referenceYear) > 2100
  )
    throw new Error('Invalid referenceYear');
  const coverage = validateGeometry(raw.coverage, country.bbox);
  if (coverage.type !== 'Polygon' && coverage.type !== 'MultiPolygon')
    throw new Error('coverage must be a Polygon or MultiPolygon');
  const checksum = requiredString(raw.checksum, 'checksum', 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error('checksum must be a hexadecimal SHA-256');
  if (
    !Array.isArray(raw.warnings) ||
    raw.warnings.length > 100 ||
    raw.warnings.some((w) => typeof w !== 'string' || w.length > 2000)
  )
    throw new Error('warnings must be a bounded string array');
  const licence = requiredString(raw.licence, 'licence');
  if (source.licence && licence !== source.licence)
    throw new Error(`Registered source requires licence ${source.licence}`);
  const unit = requiredString(raw.unit, 'unit', 100);
  if (unit !== source.unit) throw new Error(`Registered source requires unit ${source.unit}`);
  const version = requiredString(raw.version, 'version', 200);
  if (
    source.version &&
    version !== source.version &&
    !new RegExp(`^${source.version}@[a-zA-Z0-9._:-]{1,80}$`).test(version)
  )
    throw new Error(`Version must be ${source.version} or ${source.version}@<operator-revision>`);
  if (source.referenceYear && raw.referenceYear !== source.referenceYear)
    throw new Error('referenceYear does not match registered product');
  const quality = layer === 'population' ? 'modelled' : layer === 'traffic' ? 'observed' : 'mapped';
  if (raw.quality !== quality) throw new Error(`Layer requires quality ${quality}`);
  const sourceUrl = httpsUrl(raw.sourceUrl, 'sourceUrl');
  const licenceUrl = httpsUrl(raw.licenceUrl, 'licenceUrl');
  const normalizedUrl = new URL(sourceUrl);
  if (
    source.url &&
    !source.allowedUrlPrefixes.some((p) =>
      p.endsWith('/') ? normalizedUrl.href.startsWith(p) : normalizedUrl.href === p,
    )
  )
    throw new Error('sourceUrl is not a registered official URL');
  if (normalizedUrl.search || (normalizedUrl.port && normalizedUrl.port !== '443'))
    throw new Error('sourceUrl must not contain query credentials or a custom port');
  if (source.licenceUrl && licenceUrl !== source.licenceUrl)
    throw new Error('licenceUrl does not match the registered licence');
  const originalCrs = requiredString(raw.originalCrs, 'originalCrs', 100);
  if (!['EPSG:4326', 'OGC:CRS84'].includes(originalCrs))
    throw new Error(
      'Reproject vector input to EPSG:4326/OGC:CRS84 first; this importer does not guess CRS',
    );
  if (raw.rasterPath !== undefined)
    throw new Error('rasterPath is assigned by the importer, not accepted from a manifest');
  return {
    countryCode: country.code,
    sourceKey,
    layer,
    dataClass: raw.dataClass,
    version,
    referenceYear: Number(raw.referenceYear),
    publishedAt: raw.publishedAt === null ? null : timestamp(raw.publishedAt, 'publishedAt'),
    fetchedAt: timestamp(raw.fetchedAt, 'fetchedAt'),
    licence,
    licenceUrl,
    attribution: requiredString(raw.attribution, 'attribution', 4000),
    sourceUrl,
    checksum,
    originalCrs,
    coverage,
    unit,
    quality,
    warnings: [...new Set([...(raw.warnings as string[]), ...source.warnings])],
  };
}

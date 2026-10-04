import type {
  AdministrativeContext,
  ContextMetric,
  ContextProvenance,
  PoiSummary,
  PopulationContext,
  RoadContext,
  SiteGeographicContext,
  TrafficObservation,
} from '@abonten/contracts/enrichment';

/** Canonical descriptive projection for UI and server grounding. No measurements,
 * source vintages or audience models are inferred from inventory or seed fixtures. */
export interface PlanningEnrichmentMetadata {
  id: string;
  siteId?: string;
  dimension: string;
  payload: Record<string, unknown>;
  source?: string | null;
  method?: string | null;
  collectedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  confidence?: number | null;
  verification?: string | null;
  dataClass?: string | null;
}
export interface PlanningEnrichmentSite {
  id: string;
  orientationDeg?: number | null;
  viewingDistance?: number | null;
  elevation?: number | null;
  illuminationType?: string | null;
  illuminationHours?: string | null;
  dataClass?: string;
  synthetic?: boolean;
  metadata?: readonly PlanningEnrichmentMetadata[];
}
export interface EnrichmentFreshness {
  status: 'current' | 'stale' | 'future' | 'unknown';
  evaluatedAt: string;
  collectedAt: string | null;
  expiresAt: string | null;
  referenceYear: number | null;
}
export interface MetadataProvenance {
  recordId: string;
  source: string | null;
  method: string | null;
  verification: string | null;
  confidence: number | null;
  dataClass: string | null;
}
export interface PlanningEnrichmentMetric<T> {
  status: 'available' | 'partial' | 'unavailable';
  value: T | null;
  unit: string;
  provenance: ContextProvenance | MetadataProvenance | null;
  freshness: EnrichmentFreshness;
  method: string;
  warnings: string[];
  reason: string | null;
  audienceInferenceUsable: false;
}
export interface PlanningEnrichmentProjection {
  siteId: string;
  projectedAt: string;
  syntheticInputsExcluded: boolean;
  structure: {
    orientation: PlanningEnrichmentMetric<number>;
    viewingAngle: PlanningEnrichmentMetric<number>;
    viewingDistance: PlanningEnrichmentMetric<number>;
    elevation: PlanningEnrichmentMetric<number>;
    illumination: PlanningEnrichmentMetric<{ type: string; hours: string | null }>;
  };
  visibility: PlanningEnrichmentMetric<number>;
  declaredTraffic: PlanningEnrichmentMetric<number>;
  geographic: {
    nearestRoad: PlanningEnrichmentMetric<RoadContext>;
    nearestNamedRoad: PlanningEnrichmentMetric<RoadContext> & {
      searchRadiusMetres: number | null;
      searchCoverage: string | null;
    };
    administrative: PlanningEnrichmentMetric<AdministrativeContext[]>[];
    catchments: {
      radiusMetres: number;
      pois: PlanningEnrichmentMetric<PoiSummary>;
      population: PlanningEnrichmentMetric<PopulationContext>;
    }[];
    traffic: PlanningEnrichmentMetric<TrafficObservation[]>;
  };
  audience: { ots: null; reach: null; reason: string };
}

const text = (value: string | null | undefined) => value?.trim().slice(0, 512) || null;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => finite(value) && value >= 0;
function iso(value: string | Date | null | undefined): string | null {
  const time = value instanceof Date ? value.getTime() : Date.parse(value ?? '');
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
function freshness(now: number, record?: PlanningEnrichmentMetadata): EnrichmentFreshness {
  const collectedAt = iso(record?.collectedAt);
  const expiresAt = iso(record?.expiresAt);
  return {
    evaluatedAt: new Date(now).toISOString(),
    collectedAt,
    expiresAt,
    referenceYear: null,
    status:
      collectedAt && Date.parse(collectedAt) > now
        ? 'future'
        : expiresAt && Date.parse(expiresAt) <= now
          ? 'stale'
          : collectedAt && expiresAt
            ? 'current'
            : 'unknown',
  };
}
function missing<T>(unit: string, now: number, reason: string): PlanningEnrichmentMetric<T> {
  return {
    status: 'unavailable',
    value: null,
    unit,
    provenance: null,
    freshness: freshness(now),
    method: '',
    warnings: [],
    reason,
    audienceInferenceUsable: false,
  };
}
function synthetic(record: PlanningEnrichmentMetadata): boolean {
  return (
    record.dataClass === 'demo' ||
    record.payload.synthetic === true ||
    /^(?:seed|demo)(?:[:\s-]|$)/i.test(record.source ?? '')
  );
}
function metadataMetric(
  record: PlanningEnrichmentMetadata | undefined,
  value: number | null,
  unit: string,
  now: number,
): PlanningEnrichmentMetric<number> {
  if (!record) return missing(unit, now, 'No source-backed metadata is available.');
  const result = missing<number>(unit, now, 'Metadata has no valid value.');
  result.freshness = freshness(now, record);
  result.provenance = {
    recordId: record.id.slice(0, 128),
    source: text(record.source),
    method: text(record.method),
    verification: text(record.verification),
    confidence:
      finite(record.confidence) && record.confidence >= 0 && record.confidence <= 1
        ? record.confidence
        : null,
    dataClass: text(record.dataClass),
  };
  result.method = text(record.method) ?? '';
  if (synthetic(record))
    result.reason = 'Synthetic/demo metadata is excluded from production context.';
  else if (record.dataClass !== 'production')
    result.reason = 'Production data classification is missing.';
  else if (!text(record.source) || !text(record.method) || !result.freshness.collectedAt)
    result.reason = 'Source, method or collection date is missing.';
  else if (
    !['partner_declared', 'field_verified', 'third_party'].includes(record.verification ?? '')
  )
    result.reason = 'Metadata is unverified.';
  else if (result.freshness.status === 'stale' || result.freshness.status === 'future')
    result.reason = 'Metadata is expired or has a future collection date.';
  else if (value !== null) {
    result.value = value;
    result.status =
      result.freshness.status === 'current' && record.verification !== 'partner_declared'
        ? 'available'
        : 'partial';
    result.reason = null;
    if (result.freshness.status === 'unknown')
      result.warnings.push('No expiry/update policy is available; current validity is unknown.');
    if (record.verification === 'partner_declared')
      result.warnings.push('Partner declaration; independent verification is unavailable.');
  }
  return result;
}
function validProvenance(value: ContextProvenance | null, now: number): value is ContextProvenance {
  return Boolean(
    value &&
    text(value.importId) &&
    text(value.sourceKey) &&
    text(value.version) &&
    Number.isInteger(value.referenceYear) &&
    value.referenceYear > 0 &&
    value.referenceYear <= new Date(now).getUTCFullYear() &&
    iso(value.fetchedAt) &&
    Date.parse(value.fetchedAt) <= now &&
    (!value.publishedAt || (iso(value.publishedAt) && Date.parse(value.publishedAt) <= now)) &&
    text(value.licence) &&
    text(value.licenceUrl) &&
    text(value.attribution) &&
    text(value.sourceUrl) &&
    /^[a-f0-9]{64}$/i.test(value.checksum) &&
    ['mapped', 'modelled', 'observed'].includes(value.quality) &&
    !/^(?:demo|seed)(?:[:\s-]|$)/i.test(value.sourceKey),
  );
}
function contextMetric<T>(
  metric: ContextMetric<T> | undefined,
  unit: string,
  now: number,
  map: (value: T) => T | null,
): PlanningEnrichmentMetric<T> {
  const result = missing<T>(unit, now, 'Production geographic context is unavailable.');
  if (!metric) return result;
  result.method = text(metric.method) ?? '';
  result.warnings = metric.warnings.slice(0, 12).map((warning) => warning.slice(0, 512));
  if (!validProvenance(metric.provenance, now)) {
    result.reason = 'Geographic source provenance is missing, synthetic or invalid.';
    return result;
  }
  result.provenance = {
    importId: text(metric.provenance.importId)!,
    sourceKey: text(metric.provenance.sourceKey)!,
    version: text(metric.provenance.version)!,
    licence: text(metric.provenance.licence)!,
    licenceUrl: text(metric.provenance.licenceUrl)!,
    attribution: text(metric.provenance.attribution)!,
    sourceUrl: text(metric.provenance.sourceUrl)!,
    referenceYear: metric.provenance.referenceYear,
    publishedAt: iso(metric.provenance.publishedAt),
    fetchedAt: iso(metric.provenance.fetchedAt)!,
    checksum: metric.provenance.checksum,
    quality: metric.provenance.quality,
    warnings: metric.provenance.warnings.slice(0, 12).map((warning) => warning.slice(0, 512)),
  };
  result.freshness.referenceYear = metric.provenance.referenceYear;
  result.warnings.push(
    'Source vintage is retained; no expiry/update policy establishes present-day validity.',
  );
  if (metric.status === 'unavailable' || metric.value === null) return result;
  result.value = map(metric.value);
  if (result.value === null) {
    result.reason = 'Metric has invalid or missing measurements.';
    return result;
  }
  result.status = metric.status;
  result.reason = null;
  return result;
}
function road(value: RoadContext): RoadContext | null {
  return nonnegative(value.distanceMetres) && text(value.sourceId)
    ? {
        sourceId: text(value.sourceId)!,
        name: text(value.name),
        roadClass: text(value.roadClass) ?? '',
        ref: text(value.ref),
        distanceMetres: value.distanceMetres,
      }
    : null;
}

/** Inputs must already have passed the caller's marketplace/owner authorization.
 * Matching site IDs are still enforced here to prevent accidental cross-site joins. */
export function projectPlanningEnrichment(
  site: PlanningEnrichmentSite,
  context?: (Omit<SiteGeographicContext, 'dataClass'> & { dataClass: string }) | null,
  now = Date.now(),
): PlanningEnrichmentProjection {
  if (!Number.isFinite(now)) throw new Error('A finite projection timestamp is required.');
  const siteSynthetic = site.synthetic === true || site.dataClass === 'demo';
  const records = (site.metadata ?? []).filter(
    (record) => !record.siteId || record.siteId === site.id,
  );
  const latest = (dimension: string, field: string) =>
    records
      .filter(
        (record) =>
          record.dimension === dimension &&
          Object.hasOwn(record.payload, field) &&
          !synthetic(record),
      )
      .sort(
        (a, b) =>
          (Date.parse(iso(b.collectedAt) ?? '') || 0) -
            (Date.parse(iso(a.collectedAt) ?? '') || 0) || a.id.localeCompare(b.id),
      )[0];
  const structure = (field: 'orientationDeg' | 'viewingDistance' | 'elevation', unit: string) => {
    const value = site[field];
    if (siteSynthetic)
      return missing<number>(unit, now, 'Synthetic inventory is not production enrichment.');
    if (!nonnegative(value) || (field === 'orientationDeg' && value > 360))
      return missing<number>(unit, now, 'Inventory measurement is missing or invalid.');
    const record = latest('structure', field);
    if (record && record.payload[field] === value) return metadataMetric(record, value, unit, now);
    return {
      ...missing<number>(unit, now, 'Measurement provenance is unavailable.'),
      status: 'partial' as const,
      value,
      method: 'Registered inventory declaration',
      warnings: ['Registered value has no matching source-backed measurement record.'],
    };
  };
  const numericMetadata = (dimension: string, field: string, unit: string, max = Infinity) => {
    if (siteSynthetic)
      return missing<number>(unit, now, 'Synthetic inventory is not production enrichment.');
    const record = latest(dimension, field);
    const value = record?.payload[field];
    return metadataMetric(record, nonnegative(value) && value <= max ? value : null, unit, now);
  };
  const geographic =
    !siteSynthetic && context?.siteId === site.id && context.dataClass === 'production'
      ? context
      : undefined;
  const nearestNamedRoad = contextMetric(
    geographic?.nearestNamedRoad,
    'metres from site coordinate',
    now,
    road,
  );
  const illumination =
    siteSynthetic || !text(site.illuminationType)
      ? missing<{ type: string; hours: string | null }>(
          'registered illumination configuration',
          now,
          'Illumination configuration is unavailable.',
        )
      : {
          ...missing<{ type: string; hours: string | null }>(
            'registered illumination configuration',
            now,
            '',
          ),
          status: 'partial' as const,
          value: { type: text(site.illuminationType)!, hours: text(site.illuminationHours) },
          reason: null,
          method: 'Registered inventory declaration',
          warnings: ['Configuration does not confirm measured night-time visibility.'],
        };
  return {
    siteId: site.id,
    projectedAt: new Date(now).toISOString(),
    syntheticInputsExcluded:
      siteSynthetic ||
      records.some(synthetic) ||
      Boolean(context && context.dataClass !== 'production'),
    structure: {
      orientation: structure('orientationDeg', 'degrees clockwise from north'),
      viewingAngle: missing<number>(
        'degrees',
        now,
        'Viewing angle is not recorded in the current inventory contract; facing orientation is a separate measurement.',
      ),
      viewingDistance: structure('viewingDistance', 'metres'),
      elevation: structure('elevation', 'metres above ground'),
      illumination,
    },
    visibility: numericMetadata('visibility', 'score', 'score out of 100', 100),
    declaredTraffic: numericMetadata('traffic', 'aadt', 'declared AADT vehicles/day'),
    geographic: {
      nearestRoad: contextMetric(geographic?.nearestRoad, 'metres from site coordinate', now, road),
      nearestNamedRoad: {
        ...nearestNamedRoad,
        searchRadiusMetres: geographic?.nearestNamedRoad?.searchRadiusMetres ?? null,
        searchCoverage: geographic?.nearestNamedRoad?.searchCoverage ?? null,
      },
      administrative: [0, 1].map((index) =>
        contextMetric(
          geographic?.administrative[index],
          'administrative containment',
          now,
          (value) =>
            value
              .slice(0, 10)
              .filter((row) => [1, 2].includes(row.level) && text(row.sourceId) && text(row.name))
              .map((row) => ({
                sourceId: text(row.sourceId)!,
                name: text(row.name)!,
                level: row.level,
              })),
        ),
      ),
      catchments: [250, 500, 1000].map((radiusMetres) => {
        const catchment = geographic?.catchments.find((row) => row.radiusMetres === radiusMetres);
        return {
          radiusMetres,
          pois: contextMetric(
            catchment?.pois,
            'mapped features within geodesic catchment',
            now,
            (value) => {
              if (
                !Number.isInteger(value.mappedCount) ||
                value.mappedCount < 0 ||
                value.completeness !== 'unknown'
              )
                return null;
              return {
                mappedCount: value.mappedCount,
                completeness: 'unknown',
                byCategory: Object.fromEntries(
                  Object.entries(value.byCategory)
                    .slice(0, 30)
                    .filter(([, count]) => Number.isInteger(count) && count >= 0)
                    .map(([key, count]) => [key.slice(0, 128), count]),
                ),
                nearest: value.nearest
                  .slice(0, 20)
                  .filter((row) => nonnegative(row.distanceMetres))
                  .map((row) => ({
                    sourceId: text(row.sourceId) ?? '',
                    name: text(row.name),
                    category: text(row.category) ?? '',
                    distanceMetres: row.distanceMetres,
                  })),
              };
            },
          ),
          population: contextMetric(
            catchment?.population,
            'modelled residents (people), not audience',
            now,
            (value) =>
              nonnegative(value.people) &&
              value.unit === 'people' &&
              finite(value.validCoverageFraction) &&
              value.validCoverageFraction >= 0 &&
              value.validCoverageFraction <= 1 &&
              finite(value.rasterCoverageFraction) &&
              value.rasterCoverageFraction >= value.validCoverageFraction &&
              value.rasterCoverageFraction <= 1
                ? {
                    people: value.people,
                    validCoverageFraction: value.validCoverageFraction,
                    rasterCoverageFraction: value.rasterCoverageFraction,
                    unit: value.unit,
                  }
                : null,
          ),
        };
      }),
      traffic: contextMetric(
        geographic?.traffic,
        'observed interval counts; not daily traffic or exposure',
        now,
        (value) => {
          const rows = value.slice(0, 50);
          if (
            !rows.length ||
            rows.some(
              (row) =>
                !['vehicles', 'pedestrians'].includes(row.unit) ||
                !nonnegative(row.distanceMetres) ||
                !finite(row.durationMinutes) ||
                row.durationMinutes <= 0 ||
                !iso(row.observedFrom) ||
                !iso(row.observedTo) ||
                Date.parse(row.observedTo) <= Date.parse(row.observedFrom) ||
                Date.parse(row.observedTo) > now ||
                Math.abs(
                  (Date.parse(row.observedTo) - Date.parse(row.observedFrom)) / 60000 -
                    row.durationMinutes,
                ) > 0.000001 ||
                (row.count !== null && (!Number.isInteger(row.count) || row.count < 0)),
            )
          )
            return null;
          return rows.map((row) => ({
            sourceId: text(row.sourceId) ?? '',
            observedFrom: iso(row.observedFrom)!,
            observedTo: iso(row.observedTo)!,
            durationMinutes: row.durationMinutes,
            count: row.count,
            unit: row.unit,
            direction: text(row.direction) ?? '',
            vehicleClasses: row.vehicleClasses.slice(0, 20).map((item) => item.slice(0, 128)),
            method: text(row.method) ?? '',
            distanceMetres: row.distanceMetres,
          }));
        },
      ),
    },
    audience: {
      ots: null,
      reach: null,
      reason:
        'Descriptive context and declared visibility have no validated flight exposure or deduplicated audience model. Population is not added to traffic.',
    },
  };
}

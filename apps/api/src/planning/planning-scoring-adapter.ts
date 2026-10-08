import type { ResearchProvenance } from '../common/research-inventory';
import type {
  PlanningEnrichmentMetadata,
  PlanningEnrichmentProjection,
  PlanningEnrichmentMetric,
} from './planning-enrichment';
import type { FaceCostEstimate, PlanningFace, PlanningWindow } from './planning-math';
import { planningCoordinate, planningDays } from './planning-math';
import type {
  PlanningScoringCandidate,
  ScoringEvidence,
  ScoringProvenance,
} from './planning-scoring';

export interface ScoringAdapterSite {
  siteId: string;
  city: string;
  country: string;
  format: string;
  latitude: number | null;
  longitude: number | null;
  isDemo?: boolean;
  isResearchReference?: boolean;
  researchProvenance?: ResearchProvenance | null;
  enrichment: PlanningEnrichmentProjection;
  faces: {
    faceId: string;
    flightEligible: boolean | null;
    availability: PlanningScoringCandidate['availability'];
    estimate: FaceCostEstimate;
  }[];
}
export interface ScoringAdapterDetail {
  id: string;
  region?: string;
  metadata?: PlanningEnrichmentMetadata[];
  faces: PlanningFace[];
}
const clean = (value: unknown, maximum = 512) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, maximum) : null;
function recordProvenance(record: PlanningEnrichmentMetadata): ScoringProvenance {
  if (
    record.payload.evidenceKind === 'modeled' &&
    ['field_verified', 'third_party'].includes(record.verification ?? '')
  )
    return 'modeled';
  return record.verification === 'partner_declared'
    ? 'owner_reported'
    : ['field_verified', 'third_party'].includes(record.verification ?? '')
      ? 'verified'
      : 'unknown';
}
function evidence<T>(value: T, provenance: ScoringProvenance, source: string): ScoringEvidence<T> {
  return { value, provenance, source };
}
function metricEvidence<T>(metric: PlanningEnrichmentMetric<T>): ScoringEvidence<T> | undefined {
  if (
    metric.value === null ||
    metric.status === 'unavailable' ||
    !metric.provenance ||
    ['stale', 'future'].includes(metric.freshness.status)
  )
    return undefined;
  const p = metric.provenance;
  if ('recordId' in p) {
    if (!p.source || !p.method || p.dataClass !== 'production') return undefined;
    return evidence(
      metric.value,
      p.verification === 'partner_declared'
        ? 'owner_reported'
        : metric.freshness.status === 'current' &&
            ['field_verified', 'third_party'].includes(p.verification ?? '')
          ? 'verified'
          : 'unknown',
      `${p.source} · ${p.recordId}`,
    );
  }
  return evidence(metric.value, 'modeled', `${p.sourceKey} · ${p.version} · ${p.sourceUrl}`);
}
/** Only authorized server detail enters this adapter. No client or model values,
 * site-level facing, residential counts or descriptive visibility index are promoted
 * into measured face geometry or a traveler audience. See docs/brief-fit-data.md. */
export function planningScoringCandidates(
  site: ScoringAdapterSite,
  detail: ScoringAdapterDetail,
  window: PlanningWindow | null,
  checkedAt: string,
): PlanningScoringCandidate[] {
  const now = Date.parse(checkedAt);
  const expiryMinimum = window ? Date.parse(`${window.endDate}T00:00:00Z`) : now;
  const records = (detail.metadata ?? [])
    .filter(
      (record) =>
        (!record.siteId || record.siteId === detail.id) &&
        record.dataClass === 'production' &&
        record.payload.synthetic !== true &&
        !/^(?:seed|demo)(?:[:\s-]|$)/i.test(record.source ?? '') &&
        clean(record.source) &&
        clean(record.method) &&
        recordProvenance(record) !== 'unknown' &&
        Number.isFinite(Date.parse(String(record.collectedAt))) &&
        Date.parse(String(record.collectedAt)) <= now &&
        Number.isFinite(Date.parse(String(record.expiresAt))) &&
        Date.parse(String(record.expiresAt)) > now &&
        Date.parse(String(record.expiresAt)) >= expiryMinimum,
    )
    .sort(
      (a, b) =>
        Date.parse(String(b.collectedAt)) - Date.parse(String(a.collectedAt)) ||
        a.id.localeCompare(b.id),
    );
  const declaredSource = site.isResearchReference
    ? `${site.researchProvenance?.publisher ?? 'Public operator reference'} · ${site.researchProvenance?.siteSourceUrl ?? ''}`
    : 'Registered inventory declaration; independent location verification unavailable';
  const geography: NonNullable<PlanningScoringCandidate['geography']> = {
    ...(clean(site.country)
      ? { country: evidence(site.country, 'owner_reported', declaredSource) }
      : {}),
    ...(clean(site.city) ? { city: evidence(site.city, 'owner_reported', declaredSource) } : {}),
  };
  // Existing administrative enrichment is country/region level, not a complete
  // neighborhood classification. Nearest mapped road is proximity, not surveyed
  // corridor/traffic membership. Keep both descriptive facts in enrichment only.
  const coordinateRecord =
    site.latitude !== null && site.longitude !== null
      ? records.find(
          (record) =>
            record.dimension === 'structure' &&
            record.verification === 'field_verified' &&
            recordProvenance(record) === 'verified' &&
            record.payload.coordinateAccuracyMetres !== undefined &&
            typeof record.payload.coordinateAccuracyMetres === 'number' &&
            record.payload.coordinateAccuracyMetres > 0 &&
            record.payload.coordinateAccuracyMetres <= 25 &&
            planningCoordinate(record.payload.latitude, 'latitude') === site.latitude &&
            planningCoordinate(record.payload.longitude, 'longitude') === site.longitude,
        )
      : undefined;
  const coordinateStatus: ScoringProvenance = site.isResearchReference
    ? 'owner_reported'
    : coordinateRecord
      ? 'verified'
      : site.latitude !== null && site.longitude !== null
        ? 'owner_reported'
        : 'unknown';
  return site.faces.map((face) => {
    const candidate: PlanningScoringCandidate = {
      siteId: site.siteId,
      faceId: face.faceId,
      format: site.format,
      physicalEligible:
        site.isDemo !== true &&
        (site.isResearchReference === true || face.flightEligible !== false),
      availability: face.availability,
      coordinateStatus,
      geography,
      ...(site.latitude !== null && site.longitude !== null
        ? { coordinates: { latitude: site.latitude, longitude: site.longitude } }
        : {}),
    };
    if (window && face.estimate.status === 'ready')
      candidate.cost = {
        amount: face.estimate.amount,
        currency: face.estimate.currency,
        window,
        basis: 'flight',
        provenance: 'owner_reported',
        source: face.estimate.provenance,
      };
    const asking = site.researchProvenance?.askingPrice;
    if (window && site.isResearchReference && asking)
      candidate.cost = {
        amount: asking.amount,
        currency: asking.currency,
        window,
        basis: 'research_month',
        provenance: 'owner_reported',
        source: `${asking.sourceUrl} · ${asking.accessedAt} · published indicative monthly asking price`,
      };
    // Research locations cannot establish exact exposure geometry, even if a
    // public source advertises a facing label or a model supplies an angle.
    if (site.isDemo || site.isResearchReference) return candidate;
    const field = <T>(
      key: string,
      valid: (value: unknown) => value is T,
      dimensions: string[] = ['structure', 'visibility', 'environment'],
    ): ScoringEvidence<T> | undefined => {
      const record = records.find(
        (record) =>
          dimensions.includes(record.dimension) &&
          record.payload.faceId === face.faceId &&
          valid(record.payload[key]),
      );
      return record
        ? evidence(
            record.payload[key] as T,
            recordProvenance(record),
            `${record.source} · ${record.method} · ${record.id}`,
          )
        : undefined;
    };
    const number =
      (minimum: number, maximum: number) =>
      (value: unknown): value is number =>
        typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
    const geometry: NonNullable<PlanningScoringCandidate['geometry']> = {};
    for (const key of ['faceBearingDeg', 'approachHeadingDeg'] as const) {
      const value = field(key, number(0, 359.999999));
      if (value) geometry[key] = value;
    }
    for (const key of [
      'viewingDistanceM',
      'legibilityDistanceM',
      'dwellSeconds',
      'speedKph',
      'viewablePathM',
    ] as const) {
      const value = field(key, number(0.000001, 1e6));
      if (value) geometry[key] = value;
    }
    const obstruction = field('unobstructedFraction', number(0, 1));
    if (obstruction) geometry.unobstructedFraction = obstruction;
    const lighting = field(
      'nightLighting',
      (value): value is boolean => typeof value === 'boolean',
      ['illumination'],
    );
    if (lighting) geometry.nightLighting = lighting;
    const scheduleValid = (value: unknown): value is { day: number; night: number } =>
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      number(0, 1)((value as Record<string, unknown>).day) &&
      number(0, 1)((value as Record<string, unknown>).night);
    const daypart = field('daypartCoverage', scheduleValid, ['illumination', 'environment']);
    if (daypart) geometry.daypartCoverage = daypart;
    candidate.geometry = geometry;
    const audience = field(
      'segments',
      (value): value is Record<string, number> =>
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value).length > 0 &&
        Object.keys(value).length <= 30 &&
        Object.entries(value).every(
          ([key, fraction]) =>
            Boolean(clean(key, 80)) && key.length <= 80 && number(0, 1)(fraction),
        ),
      ['audience'],
    );
    if (audience) candidate.audience = audience;
    if (site.format === 'digital_led') {
      const storedFace = detail.faces.find((item) => item.id === face.faceId);
      candidate.digital = {};
      for (const key of ['spotLengthSeconds', 'loopLengthSeconds'] as const) {
        const value = storedFace?.[key];
        if (typeof value === 'number' && value > 0 && Number.isFinite(value))
          candidate.digital[key] = evidence(
            value,
            'owner_reported',
            'Registered digital face specification; schedule and usable exposure remain independently required',
          );
      }
      const scheduled = records.find(
        (record) =>
          record.dimension === 'environment' &&
          record.payload.faceId === face.faceId &&
          scheduleValid(record.payload.scheduleDaypartCoverage) &&
          typeof record.payload.scheduleWindow === 'object' &&
          record.payload.scheduleWindow !== null &&
          !Array.isArray(record.payload.scheduleWindow) &&
          typeof (record.payload.scheduleWindow as Record<string, unknown>).startDate ===
            'string' &&
          typeof (record.payload.scheduleWindow as Record<string, unknown>).endDate === 'string' &&
          planningDays(record.payload.scheduleWindow as unknown as PlanningWindow) !== null,
      );
      if (scheduled) {
        const source = `${scheduled.source} · ${scheduled.method} · ${scheduled.id}`;
        candidate.digital.scheduleDaypartCoverage = evidence(
          scheduled.payload.scheduleDaypartCoverage as { day: number; night: number },
          recordProvenance(scheduled),
          source,
        );
        const scheduleWindow = scheduled.payload.scheduleWindow as unknown as PlanningWindow;
        candidate.digital.scheduleWindow = {
          startDate: scheduleWindow.startDate,
          endDate: scheduleWindow.endDate,
        };
        const placements = scheduled.payload.advertiserSpotsPerLoop;
        if (
          typeof placements === 'number' &&
          Number.isInteger(placements) &&
          placements > 0 &&
          placements <= 1000
        )
          candidate.digital.advertiserSpotsPerLoop = evidence(
            placements,
            recordProvenance(scheduled),
            source,
          );
      }
    }
    // Descriptive observations may explain evidence gaps; no count is multiplied
    // or used to fabricate a segment, exposure probability, OTS or reach.
    const traffic = metricEvidence(site.enrichment.geographic.traffic);
    if (traffic) candidate.traffic = traffic;
    return candidate;
  });
}

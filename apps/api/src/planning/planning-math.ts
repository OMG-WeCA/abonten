/** Canonical deterministic planning rules for API grounding and the web planner.
 * This module has no transport, framework, provider or secret dependencies. The
 * web re-exports this source so displayed numbers and grounded facts cannot drift.
 * Structural inputs accept existing API DTOs and web contracts without importing
 * either application runtime. Dates are serialized UTC ISO strings. */
export const PLANNING_CURRENCIES = ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'] as const;

export interface PlanningRateCard {
  id: string;
  siteId: string;
  faceId?: string | null;
  minBookingDays?: number | null;
  currency: string;
  rates: { perDay?: number; perWeek?: number; perMonth?: number };
  seasonalRules?: Record<string, unknown> | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}
export interface PlanningSite {
  id: string;
  format: string;
  rateCards: PlanningRateCard[];
  permitExpiresAt?: string | null;
}
export interface PlanningFace {
  id: string;
  siteId: string;
  bookable: boolean;
  pixelWidth?: number | null;
  pixelHeight?: number | null;
  spotLengthSeconds?: number | null;
  loopLengthSeconds?: number | null;
  spotsPerLoop?: number | null;
}
export interface PlanningGeoPoint {
  latitude: number | null;
  longitude: number | null;
}

/** Database numeric strings are accepted; absent or malformed coordinates stay
 * unknown rather than being coerced to the Gulf of Guinea at zero. */
export function planningCoordinate(
  value: unknown,
  axis: 'latitude' | 'longitude',
): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (
    typeof value === 'string' &&
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
  )
    return null;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= (axis === 'latitude' ? 90 : 180)
    ? coordinate
    : null;
}
export interface PlanningMetadata {
  id: string;
  dimension: string;
  source?: string | null;
  method?: string | null;
  collectedAt?: string | null;
  expiresAt?: string | null;
  verification?: string | null;
  dataClass?: string | null;
}
/** Only descriptive traffic status is read; observations are never multiplied. */
export interface PlanningTrafficContext {
  dataClass: string;
  traffic: {
    status: 'available' | 'partial' | 'unavailable';
    provenance: object | null;
    value: readonly unknown[] | null;
  };
}

/** Dates are UTC calendar dates. endDate is the first day outside the flight. */
export interface PlanningWindow {
  startDate: string;
  endDate: string;
}
export interface PlanningAvailability {
  status: 'available' | 'unavailable' | 'unknown';
  window?: PlanningWindow;
  checkedAt?: string;
}
export type FaceCostEstimate =
  | {
      status: 'ready';
      faceId: string;
      siteId: string;
      amount: number;
      currency: string;
      days: number;
      window: PlanningWindow;
      rateCardId: string;
      basis: 'perDay' | 'perWeek';
      unitRate: number;
      quantity: number;
      availability: PlanningAvailability['status'];
      availabilityCheckedAt: string | null;
      provenance: string;
      assumptions: string[];
    }
  | { status: 'unavailable'; faceId: string; siteId: string; reason: string };

const DAY_MS = 86_400_000;
function dateDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
    ? time / DAY_MS
    : null;
}
function rateDay(value: string | null | undefined, fallback: number): number | null {
  if (value == null) return fallback;
  if (!Number.isFinite(Date.parse(value))) return null;
  return dateDay(value.slice(0, 10));
}
export function planningDays(window: PlanningWindow): number | null {
  const start = dateDay(window.startDate);
  const end = dateDay(window.endDate);
  return start !== null && end !== null && end > start ? end - start : null;
}
function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function overlaps(card: PlanningRateCard, start: number, last: number): boolean {
  const from = rateDay(card.effectiveFrom, -Infinity);
  const to = rateDay(card.effectiveTo, Infinity);
  return from !== null && to !== null && from <= last && to >= start;
}

export type FaceFlightEligibility =
  { eligible: true; reason: null } | { eligible: false; reason: string };

/** Physical and permit eligibility is independent of price policy. A face may
 * need a partner quote while still meeting the flight's booking requirements.
 * This check does not establish calendar availability or reserve inventory. */
export function faceFlightEligibility(
  site: Pick<PlanningSite, 'id' | 'format' | 'permitExpiresAt'>,
  face: PlanningFace,
  window: PlanningWindow,
): FaceFlightEligibility {
  if (planningDays(window) === null) {
    return { eligible: false, reason: 'Choose valid start and exclusive end dates.' };
  }
  if (face.siteId !== site.id || !face.bookable) {
    return { eligible: false, reason: 'This face is not bookable.' };
  }
  const last = dateDay(window.endDate)! - 1;
  if (site.permitExpiresAt) {
    const permitEnd = rateDay(site.permitExpiresAt, Infinity);
    if (permitEnd === null || permitEnd < last) {
      return { eligible: false, reason: 'The recorded permit does not cover this flight.' };
    }
  }
  if (
    site.format === 'digital_led' &&
    ![
      face.pixelWidth,
      face.pixelHeight,
      face.spotLengthSeconds,
      face.loopLengthSeconds,
      face.spotsPerLoop,
    ].every(positive)
  ) {
    return { eligible: false, reason: 'Digital screen and loop specifications are incomplete.' };
  }
  return { eligible: true, reason: null };
}

/** Indicative published media price, never a quote or booking guarantee.
 * Face overrides suppress the default even when they cover only part of a flight.
 * Rate effectiveTo is inclusive, matching marketplace SQL's ::date comparison. */
export function estimateFaceCost(
  site: PlanningSite,
  face: PlanningFace,
  window: PlanningWindow,
  requestedCurrency?: string,
  availability?: PlanningAvailability,
): FaceCostEstimate {
  const missing = (reason: string): FaceCostEstimate => ({
    status: 'unavailable',
    siteId: site.id,
    faceId: face.id,
    reason,
  });
  const eligibility = faceFlightEligibility(site, face, window);
  if (!eligibility.eligible) return missing(eligibility.reason);
  const days = planningDays(window)!;
  const start = dateDay(window.startDate)!;
  const last = dateDay(window.endDate)! - 1;
  const matchingWindow =
    availability?.window?.startDate === window.startDate &&
    availability.window.endDate === window.endDate;
  const availabilityStatus = matchingWindow ? availability!.status : 'unknown';
  if (availabilityStatus === 'unavailable')
    return missing('This face is unavailable for the selected flight.');
  if (
    requestedCurrency &&
    !PLANNING_CURRENCIES.some((currency) => currency === requestedCurrency)
  ) {
    return missing('Choose a supported currency.');
  }
  const scoped = site.rateCards.filter(
    (card) => card.siteId === site.id && (!card.faceId || card.faceId === face.id),
  );
  // Invalid override boundaries cannot safely establish the absence of an override.
  if (
    scoped.some(
      (card) =>
        card.faceId === face.id &&
        (rateDay(card.effectiveFrom, -Infinity) === null ||
          rateDay(card.effectiveTo, Infinity) === null),
    )
  )
    return missing('Face-specific rate dates are invalid; request a partner quote.');
  const overrides = scoped.filter((card) => card.faceId === face.id && overlaps(card, start, last));
  const candidates = (overrides.length ? overrides : scoped.filter((card) => !card.faceId)).filter(
    (card) => overlaps(card, start, last),
  );
  const currencies = [...new Set(candidates.map((card) => card.currency))];
  const currency = requestedCurrency ?? (currencies.length === 1 ? currencies[0] : undefined);
  if (!currency)
    return missing(
      currencies.length
        ? 'Choose a currency for this face.'
        : 'No published rate covers this flight.',
    );
  if (!PLANNING_CURRENCIES.some((supported) => supported === currency))
    return missing('The published currency is unsupported.');
  const cards = candidates
    .filter((card) => card.currency === currency)
    .sort(
      (a, b) =>
        rateDay(b.effectiveFrom, -Infinity)! - rateDay(a.effectiveFrom, -Infinity)! ||
        b.id.localeCompare(a.id),
    );
  const card = cards.find((candidate) => rateDay(candidate.effectiveFrom, -Infinity)! <= start);
  if (!card) return missing('No published rate covers the start of this flight.');
  if (
    rateDay(card.effectiveTo, Infinity)! < last ||
    cards.some((candidate) => rateDay(candidate.effectiveFrom, -Infinity)! > start)
  ) {
    return missing('This flight spans a rate change; request a partner quote.');
  }
  if (
    card.minBookingDays != null &&
    (!Number.isInteger(card.minBookingDays) || card.minBookingDays < 1)
  ) {
    return missing('The recorded minimum booking duration is invalid.');
  }
  if (card.minBookingDays != null && days < card.minBookingDays)
    return missing(`Minimum booking duration is ${card.minBookingDays} days.`);
  if (
    card.seasonalRules &&
    Object.keys(card.seasonalRules).length &&
    (!Array.isArray(card.seasonalRules.rules) || card.seasonalRules.rules.length > 0)
  )
    return missing('Seasonal pricing requires a partner quote.');
  // A corrupted non-positive rate must not silently become an alternative price.
  if (Object.values(card.rates).some((value) => value != null && !positive(value)))
    return missing('The published rate is invalid.');
  const basis = positive(card.rates.perDay)
    ? 'perDay'
    : positive(card.rates.perWeek) && days % 7 === 0
      ? 'perWeek'
      : null;
  if (!basis)
    return missing(
      positive(card.rates.perMonth)
        ? 'Monthly billing and proration policy is not recorded; request a partner quote.'
        : positive(card.rates.perWeek)
          ? 'Weekly-only pricing requires a whole number of 7-day weeks.'
          : 'No usable published price is recorded.',
    );
  const unitRate = card.rates[basis]!;
  const quantity = basis === 'perDay' ? days : days / 7;
  const amount = unitRate * quantity;
  if (!Number.isFinite(amount) || amount <= 0 || amount > Number.MAX_SAFE_INTEGER)
    return missing('The calculated media cost is outside the supported range.');
  return {
    status: 'ready',
    siteId: site.id,
    faceId: face.id,
    amount: Math.round(amount * 100) / 100,
    currency,
    days,
    window: { ...window },
    rateCardId: card.id,
    basis,
    unitRate,
    quantity,
    availability: availabilityStatus,
    availabilityCheckedAt: matchingWindow ? (availability?.checkedAt ?? null) : null,
    provenance: `Published ${card.faceId ? 'face' : 'site-default'} rate card ${card.id}; effective dates use UTC calendar days.`,
    assumptions: [
      basis === 'perDay'
        ? 'Daily rate × flight days; no monthly or weekly discount assumed.'
        : 'Weekly rate × complete 7-day weeks; no proration assumed.',
      'Media only; tax, production, installation and negotiated discounts are not recorded.',
      availabilityStatus === 'unknown'
        ? 'Face availability has not been checked for this flight.'
        : 'Availability is indicative; no reservation is created.',
    ],
  };
}

/** Currency choices must be usable for this face and flight, rather than merely
 * present somewhere in the site's rate history. Reuse the complete pricing
 * validation so face overrides, rate changes and minimum terms stay consistent. */
export function applicableFaceCurrencies(
  site: PlanningSite,
  face: PlanningFace,
  window: PlanningWindow,
): string[] {
  const currencies = [
    ...new Set(
      site.rateCards
        .filter((card) => card.siteId === site.id && (!card.faceId || card.faceId === face.id))
        .map((card) => card.currency),
    ),
  ];
  return currencies.filter(
    (currency) => estimateFaceCost(site, face, window, currency).status === 'ready',
  );
}

export interface PlanningBudget {
  amount: number;
  currency: string;
}
/** Currency totals stay separate. Partial priced selections never become a total quote. */
export function summarizeBudget(estimates: FaceCostEstimate[], budget?: PlanningBudget) {
  const totals: Record<string, number> = {};
  const seen = new Set<string>();
  const unique = estimates.filter((estimate) => {
    if (seen.has(estimate.faceId)) return false;
    seen.add(estimate.faceId);
    return true;
  });
  let pricedCount = 0;
  let uncheckedCount = 0;
  for (const estimate of unique) {
    if (estimate.status !== 'ready') continue;
    totals[estimate.currency] =
      Math.round(((totals[estimate.currency] ?? 0) + estimate.amount) * 100) / 100;
    pricedCount += 1;
    if (estimate.availability !== 'available') uncheckedCount += 1;
  }
  const unpricedCount = unique.length - pricedCount;
  const validBudget =
    budget &&
    Number.isFinite(budget.amount) &&
    budget.amount >= 0 &&
    PLANNING_CURRENCIES.some((currency) => currency === budget.currency);
  const allSameCurrency =
    validBudget && Object.keys(totals).every((currency) => currency === budget.currency);
  const knownSubtotal = validBudget ? (totals[budget.currency] ?? 0) : null;
  const complete = unique.length > 0 && unpricedCount === 0 && uncheckedCount === 0;
  const fit: 'within' | 'over' | 'unknown' =
    validBudget && allSameCurrency && complete
      ? knownSubtotal! <= budget.amount
        ? 'within'
        : 'over'
      : 'unknown';
  return {
    totals,
    selectedCount: unique.length,
    pricedCount,
    unpricedCount,
    uncheckedCount,
    fit,
    remaining: fit === 'unknown' ? null : budget!.amount - knownSubtotal!,
    assumptions: [
      'Published media estimates only.',
      'Currencies are not converted without an approved FX snapshot.',
      'Availability checks do not reserve inventory.',
    ],
  };
}

export function straightLineDistanceKm(
  from: PlanningGeoPoint,
  to: PlanningGeoPoint,
): number | null {
  const { latitude: fromLatitude, longitude: fromLongitude } = from;
  const { latitude: toLatitude, longitude: toLongitude } = to;
  if (
    typeof fromLatitude !== 'number' ||
    typeof fromLongitude !== 'number' ||
    typeof toLatitude !== 'number' ||
    typeof toLongitude !== 'number' ||
    ![fromLatitude, fromLongitude, toLatitude, toLongitude].every(Number.isFinite) ||
    Math.abs(fromLatitude) > 90 ||
    Math.abs(toLatitude) > 90 ||
    Math.abs(fromLongitude) > 180 ||
    Math.abs(toLongitude) > 180
  )
    return null;
  const rad = (degrees: number) => (degrees * Math.PI) / 180;
  const a =
    Math.sin(rad(toLatitude - fromLatitude) / 2) ** 2 +
    Math.cos(rad(fromLatitude)) *
      Math.cos(rad(toLatitude)) *
      Math.sin(rad(toLongitude - fromLongitude) / 2) ** 2;
  return (
    6371.0088 *
    2 *
    Math.atan2(Math.sqrt(Math.max(0, Math.min(1, a))), Math.sqrt(Math.max(0, 1 - a)))
  );
}
export function selectionDistances(sites: Array<PlanningGeoPoint & { id: string }>) {
  const unique = [...new Map(sites.map((site) => [site.id, site])).values()];
  return unique.flatMap((from, index) =>
    unique.slice(index + 1).map((to) => ({
      fromSiteId: from.id,
      toSiteId: to.id,
      value: straightLineDistanceKm(from, to),
      unit: 'km' as const,
      method: 'Haversine great-circle distance; mean Earth radius 6,371.0088 km.',
      provenance: 'Registered site coordinates (WGS84).',
      assumptions: ['Straight-line distance; road routes and travel time are not calculated.'],
    })),
  );
}

export interface GrossOtsEstimate {
  status: 'unavailable';
  value: null;
  unit: 'gross estimated impressions';
  window: PlanningWindow;
  reach: null;
  reason: string;
  provenance: string[];
  assumptions: string[];
}
/** Current production contracts contain finite traffic observations and residential
 * population, but no validated audience conversion/visibility model. Do not turn a
 * short count or a partner's 0–100 visibility score into daily audience impressions. */
export function estimateGrossOts(
  window: PlanningWindow,
  metadata: PlanningMetadata[] = [],
  context?: PlanningTrafficContext | null,
  now = Date.now(),
): GrossOtsEstimate {
  const eligible = metadata.filter(
    (record) =>
      record.dataClass === 'production' &&
      ['field_verified', 'third_party'].includes(record.verification ?? '') &&
      Boolean(record.source?.trim() && record.method?.trim()) &&
      Number.isFinite(Date.parse(record.collectedAt ?? '')) &&
      Date.parse(record.collectedAt!) <= now &&
      Number.isFinite(Date.parse(record.expiresAt ?? '')) &&
      Date.parse(record.expiresAt!) > now,
  );
  const observedTraffic =
    context?.dataClass === 'production' &&
    context.traffic.status === 'available' &&
    context.traffic.provenance &&
    context.traffic.value?.length;
  const reason =
    planningDays(window) === null
      ? 'Choose valid start and exclusive end dates.'
      : observedTraffic
        ? 'Observed traffic counts have no validated audience conversion and visibility model for this flight.'
        : eligible.some((record) => record.dimension === 'traffic')
          ? 'Production traffic metadata has no validated audience conversion and visibility model.'
          : 'Validated, current production traffic and an approved OTS model are unavailable.';
  return {
    status: 'unavailable',
    value: null,
    unit: 'gross estimated impressions',
    window: { ...window },
    reach: null,
    reason,
    provenance: eligible
      .filter((record) => record.dimension === 'traffic' || record.dimension === 'visibility')
      .map((record) => `${record.source}; ${record.method}; record ${record.id}`),
    assumptions: [
      'Residential population is context; it is not added to traffic or impressions.',
      'Traffic observations are not extrapolated into AADT or campaign exposure.',
      'Gross impressions count repeat opportunities. Deduplicated reach requires a separate audience model.',
      'Demo, stale, unverified and incomplete-provenance metadata are excluded from model inputs.',
    ],
  };
}
export function summarizeGrossOts(estimates: GrossOtsEstimate[]) {
  return {
    status: 'unavailable' as const,
    value: null,
    unit: 'gross estimated impressions' as const,
    reach: null,
    excludedCount: estimates.length,
    reason:
      'A plan OTS total requires validated flight estimates for every selected face; deduplicated reach is unavailable.',
  };
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SiteGeographicContext } from '@abonten/contracts/enrichment';
import type { RateCard, SiteFace, SiteMetadata } from './sites-api';
import {
  applicableFaceCurrencies,
  estimateFaceCost,
  estimateGrossOts,
  planningDays,
  selectionDistances,
  straightLineDistanceKm,
  summarizeBudget,
  summarizeGrossOts,
  type PlanningAvailability,
  type PlanningWindow,
} from './agency-planning';

const window: PlanningWindow = { startDate: '2026-10-01', endDate: '2026-10-08' };
const checked: PlanningAvailability = {
  status: 'available',
  window,
  checkedAt: '2026-09-30T12:00:00Z',
};
const face = (patch: Partial<SiteFace> = {}): SiteFace => ({
  id: 'face-1',
  siteId: 'site-1',
  faceLabel: 'A',
  width: 10,
  height: 4,
  area: 40,
  units: 'm',
  bookable: true,
  ...patch,
});
const card = (patch: Partial<RateCard> = {}): RateCard => ({
  id: 'rate-1',
  siteId: 'site-1',
  currency: 'GHS',
  rates: { perDay: 100 },
  effectiveFrom: '2026-01-01T00:00:00Z',
  ...patch,
});
const site = (cards = [card()], format = 'static') => ({ id: 'site-1', format, rateCards: cards });
const quote = (cards = [card()], currency = 'GHS', availability: PlanningAvailability = checked) =>
  estimateFaceCost(site(cards), face(), window, currency, availability);

test('flight days use valid UTC dates and exclusive end across leap days and DST', () => {
  assert.equal(planningDays(window), 7);
  assert.equal(planningDays({ startDate: '2028-02-28', endDate: '2028-03-01' }), 2);
  assert.equal(planningDays({ startDate: '2026-03-07', endDate: '2026-03-10' }), 3);
  for (const invalid of [
    { startDate: '2026-02-30', endDate: '2026-03-03' },
    { startDate: '2026-10-01', endDate: '2026-10-01' },
    { startDate: '2026-10-01T12:00:00Z', endDate: '2026-10-08' },
    { startDate: '2026-10-08', endDate: '2026-10-01' },
  ])
    assert.equal(planningDays(invalid), null);
});
test('daily media estimates include currency, duration, source and exclusions', () => {
  const estimate = quote();
  assert.equal(estimate.status, 'ready');
  if (estimate.status !== 'ready') return;
  assert.equal(estimate.amount, 700);
  assert.equal(estimate.currency, 'GHS');
  assert.equal(estimate.days, 7);
  assert.equal(estimate.basis, 'perDay');
  assert.equal(estimate.rateCardId, 'rate-1');
  assert.equal(estimate.availabilityCheckedAt, checked.checkedAt);
  assert.match(estimate.provenance, /site-default/);
  assert.ok(estimate.assumptions.some((item) => item.includes('tax')));
  assert.ok(estimate.assumptions.some((item) => item.includes('no reservation')));
});
test('face prices override defaults and foreign face prices are excluded', () => {
  const estimate = quote([
    card(),
    card({ id: 'face-rate', faceId: 'face-1', rates: { perDay: 200 } }),
    card({ id: 'foreign-rate', faceId: 'face-2', rates: { perDay: 1000 } }),
  ]);
  assert.equal(estimate.status, 'ready');
  if (estimate.status === 'ready') {
    assert.equal(estimate.amount, 1400);
    assert.equal(estimate.rateCardId, 'face-rate');
  }
});
test('partial face overrides never fall back to the site price or cross-currency default', () => {
  for (const override of [
    card({ faceId: 'face-1', effectiveFrom: '2026-10-04' }),
    card({ faceId: 'face-1', effectiveTo: '2026-10-04' }),
    card({ faceId: 'face-1', currency: 'USD' }),
    card({ faceId: 'face-1', effectiveFrom: 'bad' }),
  ])
    assert.equal(quote([card(), override]).status, 'unavailable');
});
test('rate changes require a quote and effective end includes its last calendar date', () => {
  assert.equal(quote([card({ effectiveTo: '2026-10-07T00:00:00Z' })]).status, 'ready');
  assert.equal(quote([card({ effectiveTo: '2026-10-06' })]).status, 'unavailable');
  assert.equal(
    quote([card(), card({ id: 'new', effectiveFrom: '2026-10-04' })]).status,
    'unavailable',
  );
  const latest = quote([
    card(),
    card({ id: 'new', effectiveFrom: '2026-09-01', rates: { perDay: 150 } }),
  ]);
  assert.equal(latest.status, 'ready');
  if (latest.status === 'ready') assert.equal(latest.amount, 1050);
});
test('minimum duration, permits, bookability and digital specs constrain pricing', () => {
  assert.equal(quote([card({ minBookingDays: 8 })]).status, 'unavailable');
  assert.equal(quote([card({ minBookingDays: 7 })]).status, 'ready');
  assert.equal(quote([card({ minBookingDays: -1 })]).status, 'unavailable');
  assert.equal(
    estimateFaceCost({ ...site(), permitExpiresAt: '2026-10-06' }, face(), window).status,
    'unavailable',
  );
  assert.equal(estimateFaceCost(site(), face({ bookable: false }), window).status, 'unavailable');
  assert.equal(estimateFaceCost(site(), face({ siteId: 'other' }), window).status, 'unavailable');
  assert.equal(
    estimateFaceCost(site([card()], 'digital_led'), face(), window).status,
    'unavailable',
  );
  assert.equal(
    estimateFaceCost(
      site([card()], 'digital_led'),
      face({
        pixelWidth: 1920,
        pixelHeight: 1080,
        spotLengthSeconds: 10,
        loopLengthSeconds: 60,
        spotsPerLoop: 6,
      }),
      window,
    ).status,
    'ready',
  );
});
test('weekly-only prices require whole weeks; monthly semantics are never invented', () => {
  const weekly = quote([card({ rates: { perWeek: 500 } })]);
  assert.equal(weekly.status, 'ready');
  if (weekly.status === 'ready') assert.equal(weekly.amount, 500);
  assert.equal(
    estimateFaceCost(
      site([card({ rates: { perWeek: 500 } })]),
      face(),
      { startDate: '2026-10-01', endDate: '2026-10-09' },
      'GHS',
    ).status,
    'unavailable',
  );
  for (const endDate of ['2026-10-31', '2026-11-01', '2026-11-02']) {
    const monthly = estimateFaceCost(
      site([card({ rates: { perMonth: 2000 } })]),
      face(),
      { startDate: '2026-10-01', endDate },
      'GHS',
    );
    assert.equal(monthly.status, 'unavailable');
    if (monthly.status === 'unavailable')
      assert.match(monthly.reason, /Monthly billing and proration policy/);
  }
  const daily = quote([card({ rates: { perDay: 100, perWeek: 500, perMonth: 2000 } })]);
  assert.equal(daily.status, 'ready');
  if (daily.status === 'ready') assert.equal(daily.amount, 700);
});
test('missing, invalid or seasonal rates never become zero or a guessed fallback', () => {
  for (const value of [0, -1, NaN, Infinity]) {
    assert.equal(quote([card({ rates: { perDay: value } })]).status, 'unavailable');
    assert.equal(quote([card({ rates: { perDay: value, perWeek: 500 } })]).status, 'unavailable');
  }
  assert.equal(quote([]).status, 'unavailable');
  assert.equal(quote([card({ rates: {} })]).status, 'unavailable');
  assert.equal(quote([card({ effectiveTo: 'bad' })]).status, 'unavailable');
  assert.equal(quote([card({ rates: { perDay: Number.MAX_VALUE } })]).status, 'unavailable');
  assert.equal(
    quote([card({ seasonalRules: { rules: [{ multiplier: 1.5 }] } })]).status,
    'unavailable',
  );
  assert.equal(quote([card({ seasonalRules: { rules: [] } })]).status, 'ready');
});
test('alternative currency prices require explicit selection without FX conversion', () => {
  const cards = [card(), card({ id: 'usd', currency: 'USD', rates: { perDay: 10 } })];
  assert.equal(estimateFaceCost(site(cards), face(), window).status, 'unavailable');
  const usd = quote(cards, 'USD');
  assert.equal(usd.status, 'ready');
  if (usd.status === 'ready') {
    assert.equal(usd.amount, 70);
    assert.equal(usd.currency, 'USD');
  }
  assert.equal(quote(cards, 'EUR').status, 'unavailable');
  assert.equal(quote(cards, 'INVALID').status, 'unavailable');
});
test('applicable currencies respect effective face overrides and expired alternatives', () => {
  assert.deepEqual(
    applicableFaceCurrencies(
      site([
        card(),
        card({ id: 'usd-override', faceId: 'face-1', currency: 'USD', rates: { perDay: 10 } }),
      ]),
      face(),
      window,
    ),
    ['USD'],
  );
  assert.deepEqual(
    applicableFaceCurrencies(
      site([
        card(),
        card({ id: 'usd-expired', currency: 'USD', effectiveTo: '2026-09-30' }),
        card({ id: 'eur-future', currency: 'EUR', effectiveFrom: '2026-11-01' }),
        card({ id: 'eur-other-face', currency: 'EUR', faceId: 'face-2' }),
      ]),
      face(),
      window,
    ),
    ['GHS'],
  );
  assert.deepEqual(
    applicableFaceCurrencies(
      site([card(), card({ id: 'usd', currency: 'USD', rates: { perDay: 10 } })]),
      face(),
      window,
    ),
    ['GHS', 'USD'],
  );
});
test('applicable currencies require full flight coverage, minimum terms and usable pricing', () => {
  assert.deepEqual(
    applicableFaceCurrencies(
      site([
        card(),
        card({ id: 'usd-short', currency: 'USD', effectiveFrom: '2026-10-04' }),
        card({ id: 'eur-minimum', currency: 'EUR', minBookingDays: 8 }),
        card({ id: 'xaf-monthly', currency: 'XAF', rates: { perMonth: 1000 } }),
        card({ id: 'xof-invalid', currency: 'XOF', rates: { perDay: -1 } }),
      ]),
      face(),
      window,
    ),
    ['GHS'],
  );
  assert.deepEqual(
    applicableFaceCurrencies(
      site([
        card(),
        card({
          id: 'partial-override',
          faceId: 'face-1',
          currency: 'USD',
          effectiveFrom: '2026-10-04',
        }),
      ]),
      face(),
      window,
    ),
    [],
  );
  assert.deepEqual(applicableFaceCurrencies(site(), face({ bookable: false }), window), []);
});
test('availability is face and flight specific; unknown never claims a budget fit', () => {
  const unknown = estimateFaceCost(site(), face(), window, 'GHS');
  assert.equal(unknown.status, 'ready');
  if (unknown.status === 'ready') {
    assert.equal(unknown.availability, 'unknown');
    assert.equal(unknown.availabilityCheckedAt, null);
  }
  assert.equal(summarizeBudget([unknown], { currency: 'GHS', amount: 1000 }).fit, 'unknown');
  assert.equal(quote([card()], 'GHS', { status: 'unavailable', window }).status, 'unavailable');
  const stale = quote([card()], 'GHS', {
    status: 'available',
    checkedAt: '2026-09-01T12:00:00Z',
    window: { startDate: '2026-09-01', endDate: '2026-09-08' },
  });
  if (stale.status === 'ready') {
    assert.equal(stale.availability, 'unknown');
    assert.equal(stale.availabilityCheckedAt, null);
  }
});
test('budget totals preserve currencies, incomplete selections and repeated selections', () => {
  const ghs = quote();
  const usd = estimateFaceCost(
    site([card({ currency: 'USD', rates: { perDay: 10 } })]),
    face({ id: 'face-2' }),
    window,
    'USD',
    checked,
  );
  const mixed = summarizeBudget([ghs, usd], { currency: 'GHS', amount: 1000 });
  assert.deepEqual(mixed.totals, { GHS: 700, USD: 70 });
  assert.equal(mixed.fit, 'unknown');
  assert.equal(mixed.remaining, null);
  const repeated = summarizeBudget([ghs, ghs], { currency: 'GHS', amount: 1000 });
  assert.equal(repeated.selectedCount, 1);
  assert.equal(repeated.fit, 'within');
  assert.equal(repeated.remaining, 300);
  assert.equal(summarizeBudget([ghs], { currency: 'GHS', amount: 600 }).fit, 'over');
  const unavailable = estimateFaceCost(site([]), face({ id: 'face-2' }), window, 'GHS', checked);
  const partial = summarizeBudget([ghs, unavailable], { currency: 'GHS', amount: 1000 });
  assert.deepEqual(partial.totals, { GHS: 700 });
  assert.equal(partial.unpricedCount, 1);
  assert.equal(partial.fit, 'unknown');
  assert.equal(summarizeBudget([], { currency: 'GHS', amount: 1000 }).fit, 'unknown');
  assert.equal(summarizeBudget([ghs], { currency: 'GHS', amount: -1 }).fit, 'unknown');
});
test('Haversine distance handles identical points, dateline, antipodes and invalid geometry', () => {
  const origin = { latitude: 0, longitude: 0 };
  assert.equal(straightLineDistanceKm(origin, origin), 0);
  assert.ok(
    Math.abs(straightLineDistanceKm(origin, { latitude: 0, longitude: 1 })! - 111.19508) < 0.001,
  );
  assert.ok(
    Math.abs(
      straightLineDistanceKm({ latitude: 0, longitude: 179 }, { latitude: 0, longitude: -179 })! -
        222.39016,
    ) < 0.001,
  );
  assert.ok(
    Math.abs(straightLineDistanceKm(origin, { latitude: 0, longitude: 180 })! - 20015.1144) < 0.01,
  );
  for (const invalid of [
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: 181 },
    { latitude: NaN, longitude: 0 },
  ])
    assert.equal(straightLineDistanceKm(origin, invalid), null);
});
test('selection distance pairs have units and provenance and do not repeat site structures', () => {
  const pairs = selectionDistances([
    { id: 'a', latitude: 0, longitude: 0 },
    { id: 'a', latitude: 0, longitude: 0 },
    { id: 'b', latitude: 0, longitude: 1 },
    { id: 'c', latitude: 0, longitude: 2 },
  ]);
  assert.equal(pairs.length, 3);
  assert.equal(pairs[0].unit, 'km');
  assert.match(pairs[0].provenance, /WGS84/);
  assert.match(pairs[0].assumptions[0], /Straight-line/);
});

const now = Date.parse('2026-10-04T00:00:00Z');
const metadata = (patch: Partial<SiteMetadata> = {}): SiteMetadata => ({
  id: 'traffic-1',
  siteId: 'site-1',
  dimension: 'traffic',
  payload: { aadt: 85000 },
  source: 'synthetic test fixture',
  method: 'count',
  collectedAt: '2026-09-01',
  expiresAt: '2027-09-01',
  verification: 'third_party',
  dataClass: 'production',
  ...patch,
});
test('demo, stale, unverified and incomplete-provenance metadata cannot create OTS', () => {
  for (const record of [
    metadata({ dataClass: 'demo' }),
    metadata({ expiresAt: '2026-09-01' }),
    metadata({ verification: 'unverified' }),
    metadata({ source: null }),
    metadata({ collectedAt: null }),
    metadata({ expiresAt: null }),
    metadata({ collectedAt: '2027-09-01' }),
  ]) {
    const ots = estimateGrossOts(window, [record], null, now);
    assert.equal(ots.value, null);
    assert.equal(ots.reach, null);
    assert.deepEqual(ots.provenance, []);
  }
});
test('even a production AADT and visibility score require a validated audience model', () => {
  const ots = estimateGrossOts(
    window,
    [
      metadata(),
      metadata({ id: 'visibility', dimension: 'visibility', payload: { score: 88 } }),
      metadata({ dimension: 'audience', payload: { population: 30000 } }),
    ],
    null,
    now,
  );
  assert.equal(ots.status, 'unavailable');
  assert.equal(ots.value, null);
  assert.equal(ots.unit, 'gross estimated impressions');
  assert.equal(ots.reach, null);
  assert.match(ots.reason, /no validated audience/);
  assert.equal(ots.provenance.length, 2);
  assert.ok(ots.assumptions.some((item) => item.includes('not added to traffic')));
});
test('finite observed traffic and partial population are not extrapolated into audience exposure', () => {
  // A deliberately narrow fixture captures exactly the context fields read by
  // the helper; omitted unrelated road/POI fields cannot affect audience maths.
  const context = {
    dataClass: 'production',
    traffic: {
      status: 'available',
      provenance: { importId: 'fixture' },
      value: [
        {
          count: 500,
          durationMinutes: 15,
          unit: 'vehicles',
          observedFrom: '2026-09-01T12:00:00Z',
          observedTo: '2026-09-01T12:15:00Z',
        },
      ],
    },
    catchments: [
      { population: { status: 'partial', value: { people: 30000, validCoverageFraction: 0.5 } } },
    ],
  } as unknown as SiteGeographicContext;
  const ots = estimateGrossOts(window, [], context, now);
  assert.equal(ots.value, null);
  assert.match(ots.reason, /Observed traffic counts/);
  assert.ok(ots.assumptions.some((item) => item.includes('not extrapolated')));
  const total = summarizeGrossOts([ots, ots]);
  assert.equal(total.status, 'unavailable');
  assert.equal(total.value, null);
  assert.equal(total.reach, null);
  assert.equal(total.excludedCount, 2);
  assert.match(total.reason, /deduplicated reach/);
});

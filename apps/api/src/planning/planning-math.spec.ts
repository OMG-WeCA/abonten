import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applicableFaceCurrencies,
  estimateFaceCost,
  estimateGrossOts,
  faceFlightEligibility,
  planningDays,
  selectionDistances,
  summarizeBudget,
  summarizeGrossOts,
  PLANNING_CURRENCIES,
  type PlanningSite,
  type PlanningFace,
  type PlanningRateCard,
  type PlanningWindow,
  type PlanningAvailability,
  type PlanningMetadata,
} from './planning-math';

const window: PlanningWindow = { startDate: '2026-10-01', endDate: '2026-10-08' };
const available: PlanningAvailability = {
  status: 'available',
  window,
  checkedAt: '2026-09-30T12:00:00Z',
};
const face: PlanningFace = { id: 'face', siteId: 'site', bookable: true };
const rate = (patch: Partial<PlanningRateCard> = {}): PlanningRateCard => ({
  id: 'rate',
  siteId: 'site',
  currency: 'GHS',
  rates: { perDay: 100 },
  effectiveFrom: '2026-01-01',
  ...patch,
});
const site = (rateCards = [rate()]): PlanningSite => ({ id: 'site', format: 'static', rateCards });

test('flight eligibility independently enforces valid dates, face association and bookability', () => {
  assert.deepEqual(faceFlightEligibility(site(), face, window), { eligible: true, reason: null });
  for (const invalid of [
    { startDate: '2026-10-01', endDate: '2026-10-01' },
    { startDate: '2026-10-08', endDate: '2026-10-01' },
    { startDate: '2026-02-30', endDate: '2026-03-03' },
  ]) {
    const eligibility = faceFlightEligibility(site(), face, invalid);
    assert.equal(eligibility.eligible, false);
    assert.match(eligibility.reason!, /valid start/);
  }
  for (const invalidFace of [
    { ...face, bookable: false },
    { ...face, siteId: 'other' },
  ]) {
    const eligibility = faceFlightEligibility(site(), invalidFace, window);
    assert.equal(eligibility.eligible, false);
    assert.match(eligibility.reason!, /not bookable/);
  }
});
test('permit eligibility includes the last flight date and rejects mid-flight expiry independently of price', () => {
  for (const expiry of ['2026-10-07', '2026-10-07T00:00:00Z', '2026-10-08']) {
    assert.equal(
      faceFlightEligibility({ ...site(), permitExpiresAt: expiry }, face, window).eligible,
      true,
    );
  }
  for (const expiry of ['2026-10-06', '2026-09-30', 'invalid']) {
    const inventory = { ...site(), permitExpiresAt: expiry };
    const eligibility = faceFlightEligibility(inventory, face, window);
    assert.equal(eligibility.eligible, false);
    assert.match(eligibility.reason!, /permit/);
    const quote = estimateFaceCost(inventory, face, window, 'GHS', available);
    assert.equal(quote.status, 'unavailable');
    if (quote.status === 'unavailable') assert.equal(quote.reason, eligibility.reason);
  }
});
test('digital flight eligibility needs complete positive screen and loop specifications', () => {
  const digital = { ...site(), format: 'digital_led' };
  const complete: PlanningFace = {
    ...face,
    pixelWidth: 1920,
    pixelHeight: 1080,
    spotLengthSeconds: 10,
    loopLengthSeconds: 60,
    spotsPerLoop: 6,
  };
  assert.equal(faceFlightEligibility(digital, complete, window).eligible, true);
  for (const field of [
    'pixelWidth',
    'pixelHeight',
    'spotLengthSeconds',
    'loopLengthSeconds',
    'spotsPerLoop',
  ] as const) {
    for (const value of [undefined, null, 0, -1, NaN, Infinity]) {
      const eligibility = faceFlightEligibility(digital, { ...complete, [field]: value }, window);
      assert.equal(eligibility.eligible, false, field);
      assert.match(eligibility.reason!, /Digital/);
    }
  }
});
test('quote-only pricing gaps do not become physical flight ineligibility', () => {
  for (const inventory of [
    site([]),
    site([rate({ rates: { perMonth: 1000 } })]),
    site([rate({ minBookingDays: 30 })]),
  ]) {
    assert.deepEqual(faceFlightEligibility(inventory, face, window), {
      eligible: true,
      reason: null,
    });
    assert.equal(estimateFaceCost(inventory, face, window, 'GHS', available).status, 'unavailable');
  }
});

test('canonical math explicitly supports the six product currencies', () => {
  assert.deepEqual(PLANNING_CURRENCIES, ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR']);
  assert.equal(
    estimateFaceCost(site([rate({ currency: 'AUD' })]), face, window, 'AUD').status,
    'unavailable',
  );
});
test('server-grounded face cost and currency choices honor the same override and window', () => {
  const inventory = site([
    rate(),
    rate({ id: 'face-rate', faceId: face.id, currency: 'USD', rates: { perDay: 10 } }),
  ]);
  assert.deepEqual(applicableFaceCurrencies(inventory, face, window), ['USD']);
  const estimate = estimateFaceCost(inventory, face, window, 'USD', available);
  assert.equal(estimate.status, 'ready');
  if (estimate.status !== 'ready') return;
  assert.equal(estimate.amount, 70);
  assert.equal(estimate.days, 7);
  assert.equal(estimate.availabilityCheckedAt, available.checkedAt);
  assert.equal(estimate.rateCardId, 'face-rate');
  assert.match(estimate.provenance, /face rate card/);
  assert.equal(estimateFaceCost(inventory, face, window, 'GHS', available).status, 'unavailable');
});
test('partial changes, minimum terms and missing monthly policy never yield grounded fake prices', () => {
  const scenarios = [
    site([rate(), rate({ id: 'partial', faceId: face.id, effectiveFrom: '2026-10-04' })]),
    site([rate({ minBookingDays: 8 })]),
    site([rate({ rates: { perMonth: 1000 } })]),
    site([rate({ rates: { perDay: -10 } })]),
    site([rate({ effectiveTo: '2026-09-30' })]),
    site([]),
  ];
  for (const scenario of scenarios) {
    assert.equal(estimateFaceCost(scenario, face, window, 'GHS', available).status, 'unavailable');
    assert.deepEqual(applicableFaceCurrencies(scenario, face, window), []);
  }
  assert.equal(planningDays({ startDate: '2028-02-28', endDate: '2028-03-01' }), 2);
  assert.equal(planningDays({ startDate: '2026-02-30', endDate: '2026-03-03' }), null);
});
test('grounded budget facts retain currency partitions and never claim fit from unknown availability', () => {
  const ghs = estimateFaceCost(site(), face, window, 'GHS', available);
  const usd = estimateFaceCost(
    site([rate({ currency: 'USD', rates: { perDay: 10 } })]),
    { ...face, id: 'second-face' },
    window,
    'USD',
    available,
  );
  const mixed = summarizeBudget([ghs, usd], { amount: 1000, currency: 'GHS' });
  assert.deepEqual(mixed.totals, { GHS: 700, USD: 70 });
  assert.equal(mixed.fit, 'unknown');
  assert.equal(mixed.remaining, null);
  assert.equal(summarizeBudget([ghs, ghs], { amount: 1000, currency: 'GHS' }).remaining, 300);
  const unknown = estimateFaceCost(site(), face, window, 'GHS', {
    status: 'available',
    window: { startDate: '2026-09-01', endDate: '2026-09-08' },
    checkedAt: '2026-09-01T12:00:00Z',
  });
  assert.equal(summarizeBudget([unknown], { amount: 1000, currency: 'GHS' }).fit, 'unknown');
  if (unknown.status === 'ready') assert.equal(unknown.availabilityCheckedAt, null);
});
test('canonical great-circle distances provide registered-coordinate provenance and exclude route claims', () => {
  const pairs = selectionDistances([
    { id: 'a', latitude: 0, longitude: 179 },
    { id: 'b', latitude: 0, longitude: -179 },
    { id: 'bad', latitude: 91, longitude: 0 },
  ]);
  assert.ok(Math.abs(pairs[0].value! - 222.39016) < 0.001);
  assert.equal(pairs[0].unit, 'km');
  assert.match(pairs[0].provenance, /WGS84/);
  assert.match(pairs[0].assumptions[0], /road routes.*not calculated/);
  assert.equal(pairs[1].value, null);
});
test('server OTS grounding excludes demo and stale records and never extrapolates observed counts', () => {
  const now = Date.parse('2026-10-04');
  const metadata: PlanningMetadata = {
    id: 'fixture',
    dimension: 'traffic',
    source: 'Synthetic fixture',
    method: 'observed count',
    collectedAt: '2026-09-01',
    expiresAt: '2027-09-01',
    verification: 'third_party',
    dataClass: 'production',
  };
  for (const record of [
    { ...metadata, dataClass: 'demo' },
    { ...metadata, expiresAt: '2026-09-30' },
  ]) {
    const estimate = estimateGrossOts(window, [record], null, now);
    assert.deepEqual(estimate.provenance, []);
    assert.equal(estimate.value, null);
  }
  const observed = estimateGrossOts(
    window,
    [metadata],
    {
      dataClass: 'production',
      traffic: {
        status: 'available',
        provenance: { importId: 'fixture' },
        value: [{ count: 100, durationMinutes: 15, unit: 'vehicles' }],
      },
    },
    now,
  );
  assert.match(observed.reason, /Observed traffic counts/);
  assert.equal(observed.value, null);
  assert.equal(observed.reach, null);
  assert.ok(observed.assumptions.some((assumption) => assumption.includes('not added to traffic')));
  assert.equal(summarizeGrossOts([observed]).reach, null);
});
test('pricing does not mutate inventory or availability and repeats with identical evidence', () => {
  const inventory = site([
    rate(),
    rate({ id: 'new', effectiveFrom: '2026-09-01', rates: { perDay: 150 } }),
  ]);
  const before = JSON.stringify({ inventory, face, window, available });
  const first = estimateFaceCost(inventory, face, window, 'GHS', available);
  const second = estimateFaceCost(inventory, face, window, 'GHS', available);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify({ inventory, face, window, available }), before);
});

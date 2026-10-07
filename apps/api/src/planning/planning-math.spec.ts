import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applicableFaceCurrencies,
  estimateFaceCost,
  estimateGrossOts,
  faceFlightEligibility,
  planningDays,
  planningCoordinate,
  selectionDistances,
  summarizeBudget,
  summarizeResearchPrices,
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
test('missing coordinates never become zero and only complete locations produce distances', () => {
  for (const missing of [
    null,
    undefined,
    '',
    '  ',
    false,
    true,
    [],
    {},
    'not recorded',
    NaN,
    Infinity,
  ]) {
    assert.equal(planningCoordinate(missing, 'latitude'), null);
    assert.equal(planningCoordinate(missing, 'longitude'), null);
  }
  assert.equal(planningCoordinate(0, 'latitude'), 0);
  assert.equal(planningCoordinate(' -0.20 ', 'longitude'), -0.2);
  assert.equal(planningCoordinate(91, 'latitude'), null);
  assert.equal(planningCoordinate(181, 'longitude'), null);
  const pairs = selectionDistances([
    { id: 'known', latitude: 6.5, longitude: 3.4 },
    { id: 'unknown', latitude: null, longitude: null },
    { id: 'partial', latitude: 6.5, longitude: null },
  ]);
  assert.ok(pairs.every((pair) => pair.value === null));
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

test('research prices retain the monthly source baseline without creating a confirmed quote', () => {
  const sites = [4.5e6, 4.5e6, 5.5e6, 4e6].map((amount, index) => ({
    id: `source-${index}`,
    isResearchReference: true,
    researchProvenance: {
      askingPrice: {
        amount,
        currency: 'NGN',
        period: 'month' as const,
        qualification: 'published_indicative' as const,
        sourceUrl: 'https://elev8mediabookings.com/',
        accessedAt: '2026-10-07T00:09:00Z',
      },
    },
  }));
  const month = { startDate: '2026-11-01', endDate: '2026-12-01' };
  const summary = summarizeResearchPrices([...sites, sites[0]!], month, {
    amount: 22000000,
    currency: 'NGN',
  });
  assert.deepEqual(summary.totals, { NGN: 18500000 });
  assert.equal(summary.referenceCount, 4);
  assert.equal(summary.pricedCount, 4);
  assert.equal(summary.period, 'month');
  assert.equal(summary.windowComparable, true);
  assert.equal(summary.unquotedReserve, 3500000);
  assert.equal(summary.confirmedBudgetFit, false);
  assert.equal(summary.sources.length, 4);
  for (const flight of [
    { startDate: '2026-11-01', endDate: '2026-11-29' },
    { startDate: '2026-11-01', endDate: '2026-12-02' },
    { startDate: '2026-11-15', endDate: '2026-12-15' },
  ]) {
    const partial = summarizeResearchPrices(sites, flight, { amount: 22000000, currency: 'NGN' });
    assert.equal(partial.windowComparable, false);
    assert.equal(partial.unquotedReserve, null);
    assert.deepEqual(partial.totals, { NGN: 18500000 });
  }
  assert.equal(
    summarizeResearchPrices(sites, month, { amount: 22000000, currency: 'USD' }).unquotedReserve,
    null,
  );
  assert.equal(
    summarizeResearchPrices(sites, month, { amount: 1000000, currency: 'NGN' }).unquotedReserve,
    null,
  );
  const missing = summarizeResearchPrices(
    [...sites, { id: 'missing', isResearchReference: true }],
    month,
    { amount: 22000000, currency: 'NGN' },
  );
  assert.equal(missing.unpricedCount, 1);
  assert.equal(missing.unquotedReserve, null);
  const mixed = summarizeResearchPrices(
    [...sites, { id: 'ordinary-priced-board', isResearchReference: false }],
    month,
    { amount: 22000000, currency: 'NGN' },
  );
  assert.deepEqual(mixed.totals, { NGN: 18500000 });
  assert.equal(
    mixed.unquotedReserve,
    null,
    'A research-only subtotal cannot yield a whole-plan reserve for a mixed selection',
  );
  const normal = summarizeResearchPrices(
    sites.map((site) => ({ ...site, isResearchReference: false })),
    month,
    { amount: 22000000, currency: 'NGN' },
  );
  assert.deepEqual(normal.totals, {});
  assert.equal(normal.unquotedReserve, null);
});

test('research references can be shortlisted as interest while quotes and bookability remain unavailable', () => {
  const reference = {
    id: 'reported-site',
    format: 'digital_led',
    isResearchReference: true,
    rateCards: [],
  };
  const face = { id: 'reported-face', siteId: reference.id, bookable: false };
  const flight = { startDate: '2026-11-01', endDate: '2026-12-01' };
  assert.deepEqual(faceFlightEligibility(reference, face, flight), {
    eligible: true,
    reason: null,
    interestOnly: true,
  });
  const estimate = estimateFaceCost(reference, face, flight);
  assert.equal(estimate.status, 'unavailable');
  assert.match(estimate.reason!, /Research interest only/);
  assert.equal(face.bookable, false);
  assert.equal(
    faceFlightEligibility(reference, { ...face, siteId: 'foreign' }, flight).eligible,
    false,
  );
  assert.equal(
    faceFlightEligibility(reference, face, { ...flight, endDate: flight.startDate }).eligible,
    false,
  );
  assert.equal(
    faceFlightEligibility({ ...reference, isResearchReference: false }, face, flight).eligible,
    false,
  );
  // Even a mistakenly attached rate may not turn a reference into a commercial quote.
  assert.equal(
    estimateFaceCost(
      {
        ...reference,
        rateCards: [
          {
            id: 'improper-rate',
            siteId: reference.id,
            currency: 'NGN',
            rates: { perDay: 1 },
            effectiveFrom: '2020-01-01',
          },
        ],
      },
      { ...face, bookable: true },
      flight,
    ).status,
    'unavailable',
  );
});

test('canonical distances distinguish operator-published research points from registered inventory', () => {
  const source = 'https://elev8.com.ng/king-of-marina/';
  const from = {
    id: 'marina',
    latitude: 6.450732,
    longitude: 3.389668,
    isResearchReference: true,
    researchProvenance: { siteSourceUrl: source },
  };
  const to = { id: 'lekki', latitude: 6.437117, longitude: 3.456371 };
  const distance = selectionDistances([from, to])[0]!;
  assert.equal(distance.value, 7.5);
  assert.equal(distance.researchReference, true);
  assert.equal(distance.eligibleExactScoring, false);
  assert.deepEqual(distance.sourceUrls, [source]);
  assert.match(distance.provenance, /Operator-published/);
  assert.doesNotMatch(distance.provenance, /Registered site/);
  assert.ok(distance.assumptions.some((assumption) => assumption.includes('geofence')));
  const normal = selectionDistances([{ ...from, isResearchReference: false }, to])[0]!;
  assert.equal(normal.researchReference, undefined);
  assert.equal(normal.eligibleExactScoring, undefined);
  assert.equal(normal.provenance, 'Registered site coordinates (WGS84).');
  assert.equal(selectionDistances([{ ...from, latitude: null }, to])[0]!.value, null);
});

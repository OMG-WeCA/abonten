import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  canonicalRecommendationOutput,
  canonicalPlanningControls,
  type CanonicalFacts,
  type CanonicalSite,
} from './planning-output';
import { PlanningService } from './planning.service';
import type { DatabaseService } from '../common/database.service';
import type { MarketplaceService } from '../marketplace/marketplace.service';
import type { OpenAiPlannerProvider } from './openai-planner.provider';

const ids = [
  'abcdefab-0000-4000-8000-000000000001',
  'abcdefab-0000-4000-8000-000000000002',
  'abcdefab-0000-4000-8000-000000000003',
  'abcdefab-0000-4000-8000-000000000004',
];
const faces = ids.map((id) => id.replace('abcdefab', 'bcdefabc'));
const names = ['KING OF MARINA 2.0', 'LEKKI GATEWAY', 'OSBORNE HEIGHTS', 'TOWER OF OWORO'];
const amounts = [4500000, 4500000, 5500000, 4000000];
const sites = ids.map((siteId, index): CanonicalSite => ({
  siteId,
  name: names[index]!,
  city: 'Lagos',
  country: 'Nigeria',
  latitude: 6.450732 + index * 0.01,
  longitude: 3.389668 + index * 0.01,
  isResearchReference: true,
  researchProvenance: {
    publisher: 'ELEV8 Media',
    operatorName: 'ELEV8 Media',
    siteSourceUrl: `https://elev8.com.ng/site-${index}/`,
    accessedAt: '2026-10-07T00:09:00Z',
    coordinateVerification: 'operator_published_not_field_verified',
    dimensionsUnit: 'm',
    askingPrice: {
      amount: amounts[index]!,
      currency: 'NGN',
      period: 'month',
      sourceUrl: 'https://elev8mediabookings.com/',
      accessedAt: '2026-10-07T00:09:00Z',
      qualification: 'published_indicative',
    },
    unknowns: ['availability', 'slots', 'traffic'],
  },
  faces: [
    {
      faceId: faces[index]!,
      availability: 'unknown',
      estimate: {
        status: 'unavailable',
        siteId,
        faceId: faces[index]!,
        reason: 'Research reference; full-flight quote unavailable.',
      },
    },
  ],
}));
const facts = (chosen: CanonicalSite[] = sites, budget = 10000000): CanonicalFacts => ({
  sites: chosen,
  window: { startDate: '2026-11-01', endDate: '2026-12-01' },
  requestedBudget: { amount: budget, currency: 'NGN' },
});
const choose = (indices: number[]) => ({
  recommendations: indices.map((index) => ({
    siteId: ids[index]!,
    faceId: faces[index]!,
    reason: 'BAD_MODEL_REASON: guaranteed mainland traffic',
    reasonCode: 'source_monthly_price',
  })),
  message:
    'BAD_MODEL_MESSAGE: NGN14.5m trio now covers Mainland; fifty million impressions guaranteed',
  questions: ['BAD_MODEL_QUESTION: is guaranteed reach adequate?'],
  adviceCodes: ['confirm_quotes'],
  questionCodes: ['request_operator_quote'],
});

test('canonical proposal replaces observed bad trio prose with the actual nine-million pair', () => {
  const output = canonicalRecommendationOutput(choose([0, 1]), facts());
  assert.deepEqual(output.recommendationSummary.siteIds, ids.slice(0, 2));
  assert.deepEqual(output.recommendationSummary.faceIds, faces.slice(0, 2));
  assert.deepEqual(output.recommendationSummary.researchPrices.totals, { NGN: 9000000 });
  assert.equal(output.recommendationSummary.researchPrices.unquotedReserve, 1000000);
  assert.match(output.message, /NGN 9,000,000\/month/);
  assert.match(output.message, /NGN 1,000,000/);
  assert.doesNotMatch(JSON.stringify(output), /BAD_MODEL|14\.5|Mainland|OSBORNE|fifty million/);
  assert.equal(output.recommendationSummary.coverage.subareas, 'unknown');
  assert.deepEqual(output.recommendationSummary.coverage.cities, ['Lagos']);
  assert.equal(output.recommendationSummary.budget.fit, 'unknown');
  assert.equal(output.recommendationSummary.ots, null);
  assert.match(output.message, /No reservation/);
  assert.doesNotMatch(output.message, /\.(?:Flight|Subarea|Combined|Some)/);
});
test('a known budget-currency lower bound exceeding the ceiling withholds mixed-currency proposals without FX', () => {
  const euro = {
    ...sites[3]!,
    researchProvenance: {
      ...sites[3]!.researchProvenance!,
      askingPrice: { ...sites[3]!.researchProvenance!.askingPrice!, currency: 'EUR' },
    },
  };
  const output = canonicalRecommendationOutput(
    choose([0, 1, 2, 3]),
    facts([...sites.slice(0, 3), euro]),
  );
  assert.equal(output.recommendationSummary.status, 'budget_exceeded');
  assert.deepEqual(output.recommendations, []);
  assert.deepEqual(output.recommendationSummary.researchPrices.totals, {});
  assert.equal(output.recommendationSummary.researchPrices.unquotedReserve, null);
  const noBudgetCurrency = canonicalRecommendationOutput(choose([3]), facts([euro]));
  assert.equal(noBudgetCurrency.recommendationSummary.status, 'planning_interest');
  assert.equal(noBudgetCurrency.recommendationSummary.budget.fit, 'unknown');
  assert.equal(noBudgetCurrency.recommendationSummary.researchPrices.unquotedReserve, null);
});
test('complete and known-partial monthly over-ceiling proposals become coherent empty clarifications', () => {
  for (const input of [
    facts(),
    facts(
      sites.map((site, index) =>
        index === 3
          ? { ...site, researchProvenance: { ...site.researchProvenance!, askingPrice: undefined } }
          : site,
      ),
    ),
  ]) {
    const output = canonicalRecommendationOutput(choose([0, 1, 2, 3]), input);
    assert.deepEqual(output.recommendations, []);
    assert.equal(output.recommendationSummary.status, 'budget_exceeded');
    assert.deepEqual(output.recommendationSummary.siteIds, []);
    assert.deepEqual(output.recommendationSummary.faceIds, []);
    assert.deepEqual(output.recommendationSummary.researchPrices.totals, {});
    assert.equal(output.recommendationSummary.researchPrices.unquotedReserve, null);
    assert.equal(output.recommendationSummary.budget.selectedCount, 0);
    assert.deepEqual(output.recommendationSummary.distances, []);
    assert.ok(output.questions.some((question) => question.includes('areas')));
  }
});
test('missing asking prices stay absent and cannot support a price reason or reserve', () => {
  const missing = {
    ...sites[1]!,
    researchProvenance: { ...sites[1]!.researchProvenance!, askingPrice: undefined },
  };
  const output = canonicalRecommendationOutput(choose([0, 1]), facts([sites[0]!, missing]));
  assert.equal(output.recommendations.length, 2);
  assert.deepEqual(output.recommendationSummary.researchPrices.totals, { NGN: 4500000 });
  assert.equal(output.recommendationSummary.researchPrices.unpricedCount, 1);
  assert.equal(output.recommendationSummary.researchPrices.unquotedReserve, null);
  assert.equal(
    output.recommendations[1]!.reason,
    'Planning interest; operator confirmation required.',
  );
  assert.match(output.message, /partial subtotal/);
  assert.doesNotMatch(output.message, /reserve:/);
});
test('partial months, mixed currencies and truncated selections never establish a proposal reserve or fit', () => {
  const euro = {
    ...sites[1]!,
    researchProvenance: {
      ...sites[1]!.researchProvenance!,
      askingPrice: { ...sites[1]!.researchProvenance!.askingPrice!, currency: 'EUR' },
    },
  };
  for (const input of [
    { ...facts(), window: { startDate: '2026-11-01', endDate: '2026-11-29' } },
    facts([sites[0]!, euro]),
    { ...facts(), selectionTruncated: true },
  ]) {
    const output = canonicalRecommendationOutput(choose([0, 1]), input);
    assert.equal(output.recommendationSummary.researchPrices.unquotedReserve, null);
    assert.equal(output.recommendationSummary.budget.fit, 'unknown');
    assert.doesNotMatch(output.message, /Unquoted reserve:/);
  }
});
test('mixed ordinary and research supply has separate source subtotals and no combined reserve', () => {
  const ordinary: CanonicalSite = {
    ...sites[1]!,
    isResearchReference: false,
    researchProvenance: undefined,
    faces: [
      {
        faceId: faces[1]!,
        availability: 'unknown',
        estimate: {
          status: 'unavailable',
          siteId: ids[1]!,
          faceId: faces[1]!,
          reason: 'Unknown quote',
        },
      },
    ],
  };
  const output = canonicalRecommendationOutput(choose([0, 1]), facts([sites[0]!, ordinary]));
  assert.deepEqual(output.recommendationSummary.researchPrices.totals, { NGN: 4500000 });
  assert.equal(output.recommendationSummary.researchPrices.unquotedReserve, null);
  assert.match(output.message, /Combined cost and remaining balance are unconfirmed/);
  assert.equal(output.recommendationSummary.budget.fit, 'unknown');
});
test('empty and French outputs remain concise, source-limited and free from raw model text', () => {
  const empty = canonicalRecommendationOutput({ ...choose([]), questionCodes: [] }, facts());
  assert.equal(empty.recommendationSummary.status, 'no_recommendations');
  assert.deepEqual(empty.recommendationSummary.sites, []);
  assert.ok(empty.questions.some((question) => question.includes('areas')));
  const output = canonicalRecommendationOutput(choose([0, 1]), facts(), 'fr');
  assert.match(output.message, /Intérêt de planification/);
  assert.match(output.message, /9\s000\s000/);
  assert.match(output.message, /sous-zones inconnue/);
  assert.match(output.message, /Aucune réservation/);
  assert.doesNotMatch(JSON.stringify(output), /BAD_MODEL|Mainland/);
  const unknown = canonicalRecommendationOutput(
    choose([0]),
    facts([{ ...sites[0]!, city: '', country: '' }]),
  );
  assert.deepEqual(unknown.recommendationSummary.coverage.cities, []);
  assert.deepEqual(unknown.recommendationSummary.coverage.countries, []);
});
test('actual service response removes all raw model prose and follows canonical controls independently from current selection', async () => {
  const publicSites = sites.map((site, index) => ({
    ...site,
    id: site.siteId,
    format: 'digital_led',
    faces: [
      {
        id: faces[index],
        siteId: site.siteId,
        faceLabel: 'Reported display',
        bookable: false,
        width: 15.36,
        height: 6.72,
        area: 103.2192,
        units: 'm',
      },
    ],
    rateCards: [],
    metadata: [],
    units: 'm',
    width: 15.36,
    height: 6.72,
  }));
  const db = {
    repo: async () => ({
      query: async (sql: string, params: unknown[]) =>
        sql.includes('ANY')
          ? (params[0] as string[]).map((id) => ({ id, siteId: ids[faces.indexOf(id)] }))
          : [],
    }),
  } as unknown as DatabaseService;
  const market = {
    search: async () => ({ items: publicSites, total: 4 }),
    getMarketplaceSite: async (id: string) => publicSites.find((site) => site.id === id),
  } as unknown as MarketplaceService;
  const provider = {
    configured: true,
    admit: () => ({ release: () => {} }),
    complete: async () => choose([0, 1]),
  } as unknown as OpenAiPlannerProvider;
  const service = new PlanningService(db, market, provider);
  const output = await service.plan(
    {
      message: 'Help',
      context: {
        selectedFaceIds: [faces[2]!],
        filters: { city: 'Lagos', country: 'Nigeria' },
        window: { startDate: '2026-11-01', endDate: '2026-12-01' },
        budget: { amount: 10000000, currency: 'NGN' },
      },
    },
    { userId: 'qa', orgId: 'org' },
  );
  if (output.mode !== 'openai') assert.fail('Expected external planner response');
  assert.deepEqual(
    output.recommendationSummary!.siteIds,
    output.assessment.portfolio.selectedSiteIds,
  );
  assert.ok(output.recommendationSummary!.siteIds.includes(ids[2]!));
  assert.notDeepEqual(output.recommendationSummary!.siteIds, ids.slice(0, 2));
  assert.deepEqual(output.facts.researchPrices.totals, { NGN: 5500000 });
  assert.deepEqual(output.recommendationSummary!.researchPrices.totals, { NGN: 9500000 });
  assert.equal(output.recommendationSummary!.researchPrices.unquotedReserve, 500000);
  assert.equal(output.constraints.budget, 10000000);
  assert.equal(output.constraints.startDate, '2026-11-01');
  assert.deepEqual(output.missing, []);
  assert.doesNotMatch(
    JSON.stringify(output),
    /BAD_MODEL|14\.5m trio|guaranteed mainland traffic|fifty million/,
  );
});

test('canonical presentation rejects DEMO interest and redundant confirmed-control questions', () => {
  const demo = { ...sites[0]!, isDemo: true };
  const output = canonicalRecommendationOutput(
    { ...choose([0]), questionCodes: ['confirm_budget', 'confirm_dates', 'confirm_market'] },
    { ...facts([demo]), retrieval: { queries: [{ city: 'Lagos', country: 'Nigeria' }] } },
  );
  assert.deepEqual(output.recommendations, []);
  assert.deepEqual(output.recommendationSummary.sites, []);
  assert.deepEqual(output.recommendationSummary.researchPrices.totals, {});
  assert.doesNotMatch(output.message, /4500000|4,500,000|KING/);
  assert.ok(
    !output.questions.some(
      (question) =>
        question.includes('budget') || question.includes('start') || question.includes('city'),
    ),
  );
});

test('local planning controls report confirmed dates and budget from the same grounded facts', () => {
  const output = canonicalPlanningControls({
    ...facts(),
    retrieval: { queries: [{ city: 'Lagos', country: 'Nigeria' }] },
  });
  assert.deepEqual(output.missing, []);
  assert.equal(output.constraints.budget, 10000000);
  assert.equal(output.constraints.startDate, '2026-11-01');
  assert.deepEqual(output.constraints.cities, ['Lagos']);
});

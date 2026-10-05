import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpException, NotFoundException } from '@nestjs/common';
import type { SiteGeographicContext } from '@abonten/contracts/enrichment';
import { rasterSlot } from '../enrichment/import/raster';
import { compactPlanningSnapshot } from './planning-snapshot';
import { PlanningService } from './planning.service';
import type { ProviderInput } from './openai-planner.provider';
import { OpenAiPlannerProvider } from './openai-planner.provider';
import { DatabaseService } from '../common/database.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { GeographicContextService } from '../enrichment/geographic-context.service';
import type { MarketplaceQueryDto } from '../marketplace/dto/marketplace.dto';

const id = (index: number) => `a0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const faceId = (index: number) => `b0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const scope = {
  userId: 'agency-user',
  orgId: 'agency-org',
  user: { userId: 'agency-user', email: 'qa@example.test', sessionVersion: 0 },
};
const window = { startDate: '2026-11-10', endDate: '2026-11-24' };
const metadata = (index: number) => [
  {
    id: `survey-${index}`,
    siteId: id(index),
    dimension: 'visibility',
    payload: { score: 82 },
    source: 'Licensed field survey QA fixture',
    method: 'Structured sightline survey',
    verification: 'field_verified',
    dataClass: 'production',
    collectedAt: '2026-09-01T00:00:00Z',
    expiresAt: '2027-09-01T00:00:00Z',
  },
];
function fixture(options: {
  failGeo?: boolean;
  deniedGeo?: boolean;
  removed?: number;
  missingCoordinates?: boolean;
} = {}) {
  const calls = {
    queries: [] as MarketplaceQueryDto[],
    details: [] as string[],
    geographic: [] as string[],
    input: null as ProviderInput | null,
  };
  const market = {
    async search(query: MarketplaceQueryDto) {
      calls.queries.push(query);
      const start = ((query.page ?? 1) - 1) * (query.limit ?? 8);
      return {
        items: Array.from({ length: 8 }, (_, offset) => ({ id: id(start + offset + 1) })),
        total: 40,
      };
    },
    async getMarketplaceSite(siteId: string) {
      calls.details.push(siteId);
      const index = Number(siteId.slice(-12));
      if (index === options.removed) throw new NotFoundException('Site no longer listed');
      return {
        id: siteId,
        name: `Accra QA board ${index}`,
        city: 'Accra',
        country: 'Ghana',
        latitude: options.missingCoordinates && index === 1 ? null : 5.55,
        longitude: options.missingCoordinates && index === 1 ? '' : -0.2 + index / 1000,
        format: 'static',
        width: 8,
        height: 3,
        units: 'm',
        faces: [{ id: faceId(index), siteId, bookable: true }],
        rateCards: [
          {
            id: `rate-${index}`,
            siteId,
            currency: index === 21 ? 'NGN' : 'GHS',
            rates: { perDay: index <= 16 ? 10000 : 100 },
            effectiveFrom: '2020-01-01',
          },
        ],
        metadata:
          index === 17
            ? metadata(index)
            : [
                {
                  ...metadata(index)[0],
                  dataClass: 'demo',
                  payload: { score: 99, aadt: 999999999 },
                },
              ],
      };
    },
  } as unknown as MarketplaceService;
  const db = {
    async repo() {
      return {
        async query(_sql: string, args: unknown[]) {
          if (Array.isArray(args[0])) {
            return args[0].map((selected) => ({
              id: selected,
              siteId: id(Number(String(selected).slice(-12))),
            }));
          }
          const index = Number(String(args[0]).slice(-12));
          return [{ faceId: faceId(index), available: true }];
        },
      };
    },
  } as unknown as DatabaseService;
  const provider = {
    configured: true,
    admit() {
      return { release() {} };
    },
    async complete(input: ProviderInput) {
      calls.input = input;
      const facts = input.snapshot as Awaited<ReturnType<PlanningService['plan']>>['facts'];
      // Synthetic transport chooses only evidence actually projected by the service.
      const candidate = facts.sites.find(
        (site) => site.enrichment.visibility?.status === 'available',
      );
      return {
        message: 'Synthetic reply: compare the current field survey; audience remains unknown.',
        recommendations: candidate
          ? [
              {
                siteId: candidate.siteId,
                faceId: candidate.faces[0].faceId,
                reason:
                  '82/100 field survey with source and current expiry; no measured audience claim.',
              },
            ]
          : [],
        questions: [],
      };
    },
  } as unknown as OpenAiPlannerProvider;
  const geographic = {
    async getSiteContext(user: typeof scope.user, org: string, site: string, signal: AbortSignal) {
      assert.equal(user, scope.user);
      assert.equal(org, scope.orgId);
      assert.equal(signal.aborted, false);
      calls.geographic.push(site);
      if (options.deniedGeo) throw new HttpException('Not authorized', 403);
      if (options.failGeo) throw new Error('RAW PRIVATE ERROR');
      return undefined as unknown as SiteGeographicContext;
    },
  } as unknown as GeographicContextService;
  return { service: new PlanningService(db, market, provider, () => {}, geographic), calls };
}

test('malformed location facts remain unknown in the response and provider snapshot while budget planning still works', async () => {
  const { service, calls } = fixture({ missingCoordinates: true });
  const reply = await service.plan(
    {
      message: 'Compare the selected Accra boards by cost and distance.',
      context: {
        window,
        budget: { amount: 1000000, currency: 'GHS' },
        selectedSiteIds: [id(1), id(2)],
        selectedFaceIds: [faceId(1), faceId(2)],
      },
    },
    scope,
  );
  const site = reply.facts.sites.find((item) => item.siteId === id(1));
  assert.equal(site?.latitude, null);
  assert.equal(site?.longitude, null);
  assert.equal(reply.facts.distances[0].value, null);
  assert.equal(reply.facts.budget.fit, 'within');
  assert.deepEqual(reply.facts.budget.totals, { GHS: 280000 });
  assert.ok(calls.input);
  const transferred = calls.input.snapshot as typeof reply.facts;
  assert.equal(transferred.sites.find((item) => item.siteId === id(1))?.latitude, null);
  assert.equal(transferred.distances[0].value, null);
});

test('discovers an affordable source-backed board on page three outside the initial eight-board snapshot', async () => {
  const { service, calls } = fixture();
  const reply = await service.plan(
    {
      message: 'Find static boards for my brief.',
      briefText: 'Accra campaign. Budget: GHS 5000. Start: 2026-11-10. End: 2026-11-24.',
      shareBriefWithProvider: true,
    },
    scope,
  );
  assert.deepEqual(
    calls.queries.map((query) => [
      query.city,
      query.country,
      query.format,
      query.page,
      query.limit,
    ]),
    [
      ['Accra', 'Ghana', 'static', 1, 8],
      ['Accra', 'Ghana', 'static', 2, 8],
      ['Accra', 'Ghana', 'static', 3, 8],
    ],
  );
  assert.equal(
    calls.queries.some((query) => query.maxPrice !== undefined),
    false,
  );
  assert.equal(calls.details.length, 24);
  assert.equal(calls.geographic.length, 6);
  assert.equal(reply.facts.retrieval.hasMore, true);
  assert.equal(reply.facts.retrieval.exhaustive, false);
  assert.equal(reply.facts.retrieval.candidatesDiscovered, 24);
  assert.equal(reply.facts.retrieval.candidatesOmitted, 12);
  assert.equal(reply.facts.sites[0].siteId, id(17));
  assert.equal(reply.recommendations[0].siteId, id(17));
  const candidate = reply.facts.sites[0];
  assert.equal(candidate.budgetMatch, 'within');
  assert.equal(candidate.faces[0].estimate.status, 'ready');
  if (candidate.faces[0].estimate.status === 'ready')
    assert.equal(candidate.faces[0].estimate.amount, 1400);
  assert.equal(candidate.enrichment.visibility.unit, 'score out of 100');
  assert.equal(candidate.enrichment.visibility.freshness.status, 'current');
  assert.equal(
    (candidate.enrichment.visibility.provenance as { source: string }).source,
    'Licensed field survey QA fixture',
  );
  assert.equal(reply.facts.sites.find((site) => site.siteId === id(21))?.budgetMatch, 'unknown');
  assert.equal(
    reply.facts.sites.filter((site) => site.geographicContextState === 'read_budget_exhausted')
      .length,
    6,
  );
  assert.equal(reply.facts.ots, null);
  assert.equal(reply.facts.reach, null);
  assert.doesNotMatch(JSON.stringify(calls.input), /999999999/);
  assert.ok(reply.facts.retrieval.needsConfirmation.includes('budget'));
});

test('does not send unconsented brief-derived geography, budget, format, dates or candidate choices', async () => {
  const { service, calls } = fixture();
  const reply = await service.plan(
    {
      message: 'Help',
      briefText: 'Accra digital. Budget: GHS 5000. Start: 2026-11-10. End: 2026-11-24.',
      history: [{ role: 'assistant', content: 'PRIVATE Accra brief' }],
    },
    scope,
  );
  assert.equal(reply.briefShared, false);
  assert.equal(calls.input?.briefText, undefined);
  assert.deepEqual(calls.input?.history, []);
  assert.equal(calls.queries[0].city, undefined);
  assert.equal(calls.queries[0].format, undefined);
  assert.equal(calls.queries[0].startDate, undefined);
  assert.equal(reply.facts.requestedBudget, null);
  assert.equal(reply.facts.window, null);
  assert.deepEqual(reply.facts.retrieval.needsConfirmation, []);
});

test('shares the total pagination budget across multi-city unions and preserves selected boards', async () => {
  const { service, calls } = fixture();
  const reply = await service.plan(
    {
      message: 'Accra and Lagos campaign',
      context: { window, selectedSiteIds: [id(90)], budget: { amount: 5000, currency: 'GHS' } },
    },
    scope,
  );
  assert.deepEqual(
    calls.queries.map((query) => [query.city, query.page]),
    [
      ['Accra', 1],
      ['Lagos', 1],
      ['Accra', 2],
    ],
  );
  assert.equal(reply.facts.sites[0].siteId, id(90));
  assert.equal(calls.details.length, 17); // Duplicate IDs from the fixture unions are grounded once.
  assert.equal(reply.facts.sites.length, 13);
});

test('enrichment processing failures degrade explicitly, and authorization/listing failures stop before provider spend', async () => {
  const failed = fixture({ failGeo: true });
  const reply = await failed.service.plan({ message: 'Accra static', context: { window } }, scope);
  assert.equal(reply.facts.retrieval.enrichmentFailures, 6);
  assert.equal(reply.facts.sites[0].geographicContextState, 'temporarily_unavailable');
  assert.doesNotMatch(JSON.stringify(reply), /RAW PRIVATE ERROR/);
  for (const options of [{ deniedGeo: true }, { removed: 1 }]) {
    const blocked = fixture(options);
    await assert.rejects(
      blocked.service.plan({ message: 'Accra', context: { window } }, scope),
      HttpException,
    );
    assert.equal(blocked.calls.input, null);
  }
});

test('a cancelled population queue waiter releases immediately and cannot consume a future worker slot', async () => {
  let releaseFirst: () => void = () => {};
  let releaseSecond: () => void = () => {};
  const first = rasterSlot(
    () =>
      new Promise<void>((resolve) => {
        releaseFirst = resolve;
      }),
  );
  const second = rasterSlot(
    () =>
      new Promise<void>((resolve) => {
        releaseSecond = resolve;
      }),
  );
  const abort = new AbortController();
  let entered = false;
  const queued = rasterSlot(async () => {
    entered = true;
  }, abort.signal);
  abort.abort();
  await assert.rejects(queued, /cancelled/);
  assert.equal(entered, false);
  let recovered = false;
  const retry = rasterSlot(async () => {
    recovered = true;
  });
  releaseFirst();
  await first;
  await retry;
  assert.equal(recovered, true);
  releaseSecond();
  await second;
  await assert.rejects(
    rasterSlot(async () => {}, abort.signal),
    /cancelled/,
  );
});

test('affordable ninth faces are evaluated before the bounded face output and become recommendable', async () => {
  const { service, calls } = fixture();
  const market = (service as unknown as { marketplace: MarketplaceService }).marketplace;
  const original = market.getMarketplaceSite.bind(market);
  market.getMarketplaceSite = async (
    ...args: Parameters<MarketplaceService['getMarketplaceSite']>
  ) => {
    const detail = await original(...args);
    const site = detail as unknown as { id: string; faces: object[]; rateCards: object[] };
    site.faces = Array.from({ length: 9 }, (_, index) => ({
      id: faceId(100 + index),
      siteId: site.id,
      bookable: true,
    }));
    site.rateCards = Array.from({ length: 9 }, (_, index) => ({
      id: `face-rate-${index}`,
      siteId: site.id,
      faceId: faceId(100 + index),
      currency: 'GHS',
      rates: { perDay: index === 8 ? 100 : 10000 },
      effectiveFrom: '2020-01-01',
    }));
    return detail;
  };
  const database = (service as unknown as { db: DatabaseService }).db;
  database.repo = async () =>
    ({
      query: async () =>
        Array.from({ length: 9 }, (_, index) => ({ faceId: faceId(100 + index), available: true })),
    }) as never;
  const reply = await service.plan(
    { message: 'Accra static', context: { window, budget: { amount: 5000, currency: 'GHS' } } },
    scope,
  );
  assert.equal(reply.facts.sites[0].faces[0].faceId, faceId(108));
  assert.equal(reply.facts.sites[0].budgetMatch, 'within');
  assert.equal(reply.facts.sites[0].facesEvaluated, 9);
  assert.equal(reply.facts.sites[0].facesOmitted, 1);
  assert.ok(calls.input);
});

test('rich production-shaped context and maximal canonical face facts fit a bounded external snapshot without altering full facts', async () => {
  const { service } = fixture();
  const reply = await service.plan(
    { message: 'Accra static', context: { window, budget: { amount: 5000, currency: 'GHS' } } },
    scope,
  );
  const base = reply.facts.sites[0];
  const rich = {
    ...base.enrichment,
    geographic: {
      ...base.enrichment.geographic,
      traffic: {
        ...base.enrichment.geographic.traffic,
        status: 'available',
        value: Array.from({ length: 50 }, (_, index) => ({
          sourceId: `count-${index}`,
          observedFrom: '2026-09-01T08:00:00Z',
          observedTo: '2026-09-01T08:30:00Z',
          durationMinutes: 30,
          count: 250,
          unit: 'vehicles',
          direction: 'north',
          method: 'x'.repeat(512),
          vehicleClasses: Array(20).fill('passenger'),
          distanceMetres: index,
        })),
      },
      catchments: [250, 500, 1000].map((radiusMetres) => ({
        radiusMetres,
        population: base.enrichment.geographic.catchments[0]?.population,
        pois: {
          status: 'available',
          value: {
            mappedCount: 20,
            nearest: Array.from({ length: 20 }, (_, index) => ({
              name: 'é'.repeat(512),
              sourceId: `poi-${index}`,
              category: 'retail',
              distanceMetres: index,
            })),
          },
        },
      })),
    },
  };
  const facts = {
    ...reply.facts,
    sites: Array.from({ length: 24 }, (_, index) => ({
      ...base,
      siteId: id(index + 1),
      enrichment: rich,
      faces: Array.from({ length: index < 12 ? 10 : 8 }, (_, face) => ({
        ...base.faces[0],
        selected: index < 12 && face < 2,
        faceId: faceId(index * 10 + face),
        estimate: {
          ...base.faces[0].estimate,
          faceId: faceId(index * 10 + face),
          siteId: id(index + 1),
        },
      })),
    })),
  };
  const original = JSON.stringify(facts);
  const snapshot = compactPlanningSnapshot(facts);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= 96 * 1024);
  assert.equal(JSON.stringify(facts), original, 'Full canonical facts are preserved');
  assert.equal(
    snapshot.sites.flatMap((site) => site.faces).filter((face) => face.selected).length,
    24,
  );
  for (const site of snapshot.sites)
    for (const face of site.faces) {
      assert.deepEqual(
        face.estimate,
        facts.sites
          .find((full) => full.siteId === site.siteId)!
          .faces.find((full) => full.faceId === face.faceId)!.estimate,
      );
    }
  const model = (service as unknown as { provider: OpenAiPlannerProvider }).provider;
  assert.ok(model.configured); // Synthetic provider; no real transport in this test.
});

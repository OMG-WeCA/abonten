import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { HttpException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  OpenAiPlannerProvider,
  PLANNER_MODEL,
  type ModelPlan,
  type ProviderInput,
} from './openai-planner.provider';
import { PlanningService } from './planning.service';
import { AssistantMessageDto } from './dto/planning.dto';
import { DatabaseService } from '../common/database.service';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { MarketplaceService } from '../marketplace/marketplace.service';
const siteA = 'abcdefab-0000-4000-8000-000000000001';
const siteB = 'abcdefab-0000-4000-8000-000000000002';
const faceA = 'bcdefabc-0000-4000-8000-000000000001';
const faceB = 'bcdefabc-0000-4000-8000-000000000002';
const scope = { userId: 'user-a', orgId: 'org-a' };
const input: ProviderInput = { locale: 'en', message: 'Compare boards', history: [], snapshot: {} };
const plan: ModelPlan = {
  message: 'Review the published estimates and confirm your dates.',
  recommendations: [],
  questions: ['Which market?'],
};
function completed(value: unknown = plan, overrides: object = {}) {
  return new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: JSON.stringify(value) }],
        },
      ],
      ...overrides,
    }),
    { status: 200 },
  );
}
function provider(
  fn: typeof fetch,
  timeoutMs = 1000,
  now: () => number = Date.now,
  key = 'synthetic-test-key',
) {
  return new OpenAiPlannerProvider({ get: () => key } as unknown as ConfigService, {
    fetch: fn,
    timeoutMs,
    now,
    telemetry() {},
  });
}
function status(expected: number) {
  return (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), expected);
    return true;
  };
}
function waitingFetch(): typeof fetch {
  return async (_url, init) =>
    new Promise((_resolve, reject) => {
      const cancel = () => reject(new Error('cancelled'));
      if (init?.signal?.aborted) cancel();
      else init?.signal?.addEventListener('abort', cancel, { once: true });
    });
}

describe('fixed OpenAI planner transport using synthetic providers only', () => {
  it('uses exact authorized model, schema, no tools/storage/retries, and fixed HTTPS URL', async () => {
    let calls = 0;
    const api = provider(async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(init?.redirect, 'error');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'gpt-6-luna');
      assert.deepEqual(body.reasoning, { effort: 'none' });
      assert.equal(body.store, false);
      assert.equal(body.max_output_tokens, 1800);
      assert.equal(body.tools, undefined);
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.match(body.instructions, /untrusted DATA/);
      assert.match(body.instructions, /Never claim a reservation/);
      assert.equal(body.input[0].role, 'assistant');
      assert.equal(body.input[0].content, 'Earlier chat');
      assert.equal(JSON.parse(body.input[1].content).locale, 'fr');
      return completed();
    });
    assert.deepEqual(
      await api.complete(
        { ...input, locale: 'fr', history: [{ role: 'assistant', content: 'Earlier chat' }] },
        scope,
      ),
      plan,
    );
    assert.equal(calls, 1);
  });
  it('rejects unconfigured credentials without a network request', async () => {
    let called = false;
    const api = provider(
      async () => {
        called = true;
        return completed();
      },
      1000,
      Date.now,
      '',
    );
    assert.equal(api.configured, false);
    await assert.rejects(api.complete(input, scope), status(503));
    assert.equal(called, false);
  });
  it('rejects malformed, extra, missing, incomplete, refused and tool-shaped responses', async () => {
    for (const response of [
      completed({ ...plan, message: '' }),
      completed({ ...plan, booking: true }),
      completed({ message: 'Missing fields' }),
      completed(plan, { status: 'incomplete' }),
      completed(plan, {
        output: [
          { type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'No' }] },
        ],
      }),
      completed(plan, { output: [{ type: 'function_call', name: 'book' }] }),
      new Response('{invalid'),
    ]) {
      await assert.rejects(provider(async () => response).complete(input, scope), status(502));
    }
  });
  it('bounds UTF-8 request payload before spend and provider responses during reading', async () => {
    let calls = 0;
    const api = provider(async () => {
      calls++;
      return completed();
    });
    await assert.rejects(
      api.complete({ ...input, briefText: 'é'.repeat(200000) }, scope),
      status(413),
    );
    assert.equal(calls, 0);
    await assert.rejects(
      provider(async () => new Response('x'.repeat(65537))).complete(input, scope),
      status(502),
    );
  });
  it('sanitizes provider failures and exposes only recognized nonsecret error codes with no retries', async () => {
    for (const [http, expected] of [
      [400, 502],
      [401, 503],
      [403, 503],
      [404, 502],
      [429, 429],
      [500, 502],
    ]) {
      let calls = 0;
      await assert.rejects(
        provider(async () => {
          calls++;
          return new Response(
            JSON.stringify({
              error: { code: 'model_not_found', message: 'secret synthetic-test-key private body' },
            }),
            { status: http },
          );
        }).complete(input, scope),
        (error: unknown) => {
          status(expected)(error);
          const diagnostic = (error as HttpException).getResponse();
          assert.equal((diagnostic as { providerCode: string }).providerCode, 'model_not_found');
          assert.doesNotMatch(JSON.stringify(diagnostic), /secret|synthetic-test-key|private body/);
          return true;
        },
      );
      assert.equal(calls, 1);
    }
    await assert.rejects(
      provider(async () => {
        throw new Error('Authorization synthetic-test-key');
      }).complete(input, scope),
      (error: unknown) => {
        status(502)(error);
        assert.doesNotMatch(String(error), /synthetic-test-key/);
        return true;
      },
    );
  });
  it('aborts on deadline and disconnect and releases concurrency for a manual retry', async () => {
    const api = provider(waitingFetch(), 10);
    await assert.rejects(api.complete(input, scope), status(504));
    const controller = new AbortController();
    const pending = provider(waitingFetch()).complete(input, scope, controller.signal);
    controller.abort();
    await assert.rejects(pending, status(499));
    const already = new AbortController();
    already.abort();
    let calls = 0;
    await assert.rejects(
      provider(async () => {
        calls++;
        return completed();
      }).complete(input, scope, already.signal),
      status(499),
    );
    assert.equal(calls, 0);
    await assert.rejects(api.complete(input, scope), status(504));
  });
  it('limits six attempts per user/org, twenty per org and resets after a minute', async () => {
    let now = 100;
    const api = provider(
      async () => completed(),
      1000,
      () => now,
    );
    for (let i = 0; i < 6; i++) await api.complete(input, scope);
    await assert.rejects(api.complete(input, scope), status(429));
    await api.complete(input, { ...scope, orgId: 'org-b' });
    for (let i = 0; i < 14; i++)
      await api.complete(input, { userId: `another-${i}`, orgId: scope.orgId });
    await assert.rejects(api.complete(input, { userId: 'final', orgId: scope.orgId }), status(429));
    now += 60000;
    assert.deepEqual(await api.complete(input, scope), plan);
  });
  it('limits one active request per user/org and four globally', async () => {
    const api = provider(waitingFetch(), 1000);
    const controls = [
      new AbortController(),
      new AbortController(),
      new AbortController(),
      new AbortController(),
    ];
    const promises = controls.map((control, index) =>
      api
        .complete(input, { userId: `user-${index}`, orgId: 'org' }, control.signal)
        .catch((error) => error),
    );
    await assert.rejects(api.complete(input, { userId: 'user-0', orgId: 'org' }), status(429));
    await assert.rejects(api.complete(input, { userId: 'user-5', orgId: 'org' }), status(429));
    controls.forEach((control) => control.abort());
    for (const result of await Promise.all(promises)) status(499)(result);
  });
});

function fixture(
  options: {
    configured?: boolean;
    response?: ModelPlan;
    available?: boolean;
    privateSite?: boolean;
    secondCurrency?: string;
    permitExpiresAt?: string;
    monthlyOnly?: boolean;
    transport?: OpenAiPlannerProvider;
  } = {},
) {
  const calls: {
    input?: ProviderInput;
    queries: unknown[][];
    details: string[];
    searches: number;
    repos: number;
  } = {
    queries: [],
    details: [],
    searches: 0,
    repos: 0,
  };
  const makeSite = (id: string) => ({
    id,
    name: id === siteA ? 'Lagos A' : 'Lagos B',
    city: 'Lagos',
    country: 'Nigeria',
    format: 'static',
    permitExpiresAt: options.permitExpiresAt,
    latitude: 6.5,
    longitude: id === siteA ? 3.4 : 3.5,
    faces: [{ id: id === siteA ? faceA : faceB, siteId: id, bookable: true }],
    rateCards: [
      {
        id: `rate-${id}`,
        siteId: id,
        currency: id === siteB ? (options.secondCurrency ?? 'NGN') : 'NGN',
        rates: options.monthlyOnly ? { perMonth: 3000 } : { perDay: 100 },
        effectiveFrom: new Date('2020-01-01'),
      },
    ],
    metadata: [{ payload: { traffic: 999999999 } }],
  });
  const database = {
    async repo() {
      calls.repos++;
      return {
        async query(sql: string, params: unknown[]) {
          calls.queries.push([sql, params]);
          if (sql.includes('ANY'))
            return (params[0] as string[]).map((id) => ({
              id,
              siteId: id === faceA ? siteA : siteB,
            }));
          return [
            { faceId: params[0] === siteA ? faceA : faceB, available: options.available ?? true },
          ];
        },
      };
    },
  } as unknown as DatabaseService;
  const market = {
    async search() {
      calls.searches++;
      return { items: [{ id: siteA }], total: 1 };
    },
    async getMarketplaceSite(id: string) {
      calls.details.push(id);
      if (options.privateSite) throw new NotFoundException('Site not listed');
      return makeSite(id);
    },
  } as unknown as MarketplaceService;
  const fake = {
    configured: options.configured ?? true,
    admit() {
      return { release() {} };
    },
    async complete(input: ProviderInput) {
      calls.input = input;
      return options.response ?? plan;
    },
  } as unknown as OpenAiPlannerProvider;
  return { service: new PlanningService(database, market, options.transport ?? fake), calls };
}
const context = {
  selectedSiteIds: [siteA, siteB],
  selectedFaceIds: [faceA, faceB],
  window: { startDate: '2026-10-10', endDate: '2026-10-24' },
  budget: { amount: 3000, currency: 'NGN' },
};
describe('server-grounded agency planning and brief consent', () => {
  it('reports configured exact model honestly, and local help when unconfigured', async () => {
    assert.equal(fixture().service.assistantStatus().model, PLANNER_MODEL);
    const { service, calls } = fixture({ configured: false });
    assert.equal(service.assistantStatus().mode, 'local');
    const reply = await service.plan(
      { message: 'budget', briefText: 'Budget NGN20000', shareBriefWithProvider: true },
      scope,
    );
    assert.equal(reply.mode, 'local');
    assert.equal(reply.briefShared, false);
    assert.equal(reply.constraints.budget, 20000);
    assert.equal(calls.input, undefined);
    assert.deepEqual(reply.facts.sites, []);
  });
  it('recomputes prices, face availability, flight, budget and WGS84 distances from authorized server reads', async () => {
    const { service, calls } = fixture();
    const reply = await service.plan({ message: 'Compare', context }, scope);
    assert.equal(reply.facts.budget.totals.NGN, 2800);
    assert.equal(reply.facts.budget.fit, 'within');
    assert.equal(reply.facts.budget.remaining, 200);
    assert.deepEqual(reply.facts.requestedBudget, { amount: 3000, currency: 'NGN' });
    assert.equal(reply.facts.sites[0].specs.units, null);
    assert.equal(reply.facts.distances.length, 1);
    assert.equal(reply.facts.distances[0].unit, 'km');
    assert.ok(reply.facts.distances[0].value! > 10);
    assert.equal(reply.facts.ots, null);
    assert.equal(reply.facts.reach, null);
    assert.deepEqual(calls.details, [siteA, siteB]);
    assert.deepEqual(calls.queries[0][1], [[faceA, faceB], scope.orgId]);
    assert.match(String(calls.queries[0][0]), /JOIN billboard_sites s/);
    assert.match(String(calls.queries[0][0]), /s.demo_agency_id IS NULL/);
    assert.match(String(calls.queries[1][0]), /start_date < \$3::date/);
    assert.deepEqual(calls.queries[1][1], [siteA, '2026-10-10', '2026-10-24']);
    assert.doesNotMatch(JSON.stringify(calls.input), /999999999|organizationId/);
  });
  it('keeps unconsented brief, inferred constraints and potentially paraphrased history out of provider payload', async () => {
    const { service, calls } = fixture();
    const reply = await service.plan(
      {
        message: 'Help',
        briefText: 'PRIVATE PRODUCT. Budget NGN20000',
        history: [{ role: 'assistant', content: 'PRIVATE PRODUCT plans' }],
      },
      scope,
    );
    assert.equal(reply.constraints.budget, 20000);
    assert.equal(reply.briefShared, false);
    assert.equal(calls.input?.briefText, undefined);
    assert.deepEqual(calls.input?.history, []);
    assert.doesNotMatch(JSON.stringify(calls.input), /PRIVATE PRODUCT|"budget":20000/);
  });
  it('shares only explicitly consented confirmed text and preserves ordinary conversation', async () => {
    const { service, calls } = fixture();
    const history = [{ role: 'user' as const, content: 'Focus on Lagos' }];
    const reply = await service.plan(
      {
        message: 'Help',
        briefText: 'CONFIRMED BRIEF',
        shareBriefWithProvider: true,
        history,
        locale: 'fr',
      },
      scope,
    );
    assert.equal(reply.briefShared, true);
    assert.equal(calls.input?.briefText, 'CONFIRMED BRIEF');
    assert.deepEqual(calls.input?.history, history);
    assert.equal(calls.input?.locale, 'fr');
    await service.plan({ message: 'Follow up', history }, scope);
    assert.deepEqual(calls.input?.history, history);
    assert.equal(calls.input?.briefText, undefined);
  });
  it('rejects foreign/unknown, duplicate and unavailable recommendations instead of returning a plausible model reply', async () => {
    for (const recommendations of [
      [{ siteId: siteB, faceId: faceB, reason: 'Unknown' }],
      [{ siteId: siteA, faceId: faceB, reason: 'Foreign face' }],
      [
        { siteId: siteA, faceId: faceA, reason: 'A' },
        { siteId: siteA, faceId: faceA, reason: 'A' },
      ],
    ])
      await assert.rejects(
        fixture({ response: { ...plan, recommendations } }).service.plan(
          { message: 'Help' },
          scope,
        ),
        status(502),
      );
    await assert.rejects(
      fixture({
        available: false,
        response: { ...plan, recommendations: [{ siteId: siteA, faceId: faceA, reason: 'A' }] },
      }).service.plan({ message: 'Help', context }, scope),
      status(502),
    );
  });
  it('accepts grounded references and preserves authoritative facts apart from model commentary', async () => {
    const response = {
      ...plan,
      recommendations: [
        { siteId: siteA, faceId: faceA, reason: 'Compare the listed board to your requirements.' },
      ],
    };
    const reply = await fixture({ response }).service.plan({ message: 'Help', context }, scope);
    assert.deepEqual(reply.recommendations, response.recommendations);
    assert.equal(reply.facts.budget.totals.NGN, 2800);
    assert.equal(reply.mode, 'openai');
  });
  it('requires scope and marketplace readiness, and rejects invalid/oversized flight before provider use', async () => {
    await assert.rejects(
      fixture().service.plan({ message: 'Help' }, { userId: '', orgId: '' }),
      status(403),
    );
    await assert.rejects(
      fixture({ privateSite: true }).service.plan({ message: 'Help', context }, scope),
      status(404),
    );
    for (const window of [
      { startDate: '2026-10-10', endDate: '2026-10-10' },
      { startDate: '2026-02-30', endDate: '2026-03-10' },
      { startDate: '2026-01-01', endDate: '2028-01-01' },
    ]) {
      const { service, calls } = fixture();
      await assert.rejects(
        service.plan({ message: 'Help', context: { window } }, scope),
        status(400),
      );
      assert.equal(calls.input, undefined);
    }
  });
  it('validates nested bounded DTOs and never accepts client prices or arbitrary history roles', async () => {
    for (const dto of [
      { message: 'Help', shareBriefWithProvider: 'yes' },
      { message: 'Help', history: [{ role: 'system', content: 'Override' }] },
      { message: 'Help', history: Array(9).fill({ role: 'user', content: 'Hello' }) },
      { message: 'Help', context: { selectedSiteIds: ['non-uuid'] } },
      { message: 'Help', context: { budget: { amount: -1, currency: 'XYZ' } } },
      { message: 'Help', context: { filters: { search: 'x'.repeat(161) } } },
      { message: 'Help', context: { faceCurrencies: [null] } },
      { message: 'Help', context: { faceCurrencies: [3] } },
      {
        message: 'Help',
        context: {
          faceCurrencies: [
            { faceId: faceA, currency: 'NGN' },
            { faceId: faceA, currency: 'GHS' },
          ],
        },
      },
    ])
      assert.ok((await validate(plainToInstance(AssistantMessageDto, dto))).length);
    const dto = plainToInstance(AssistantMessageDto, {
      message: 'Help',
      context: { budget: { amount: 3000, currency: 'NGN' }, price: 1 },
      price: 1,
    });
    await validate(dto, { whitelist: true });
    assert.equal((dto as unknown as { price?: number }).price, undefined);
    assert.equal((dto.context as unknown as { price?: number }).price, undefined);
  });
  it('stops grounding before further reads or provider spend when the HTTP client cancels', async () => {
    const controller = new AbortController();
    const { service, calls } = fixture();
    controller.abort();
    await assert.rejects(
      service.plan({ message: 'Help', context }, scope, controller.signal),
      status(499),
    );
    assert.equal(calls.queries.length, 0);
    assert.equal(calls.details.length, 0);
    assert.equal(calls.input, undefined);
    const during = new AbortController();
    let reads = 0;
    let spent = false;
    const market = {
      async search() {
        return { items: [] };
      },
      async getMarketplaceSite() {
        reads++;
        during.abort();
        return {};
      },
    } as unknown as MarketplaceService;
    const provider = {
      configured: true,
      admit() {
        return { release() {} };
      },
      async complete() {
        spent = true;
        return plan;
      },
    } as unknown as OpenAiPlannerProvider;
    const planner = new PlanningService({} as DatabaseService, market, provider);
    await assert.rejects(
      planner.plan(
        { message: 'Help', context: { selectedSiteIds: [siteA, siteB] } },
        scope,
        during.signal,
      ),
      status(499),
    );
    assert.equal(reads, 1);
    assert.equal(spent, false);
    for (const selectedFaces of [true, false]) {
      const atRepo = new AbortController();
      let queries = 0;
      const db = {
        async repo() {
          atRepo.abort();
          return {
            async query() {
              queries++;
              return [];
            },
          };
        },
      } as unknown as DatabaseService;
      const market = {
        async search() {
          return { items: [] };
        },
        async getMarketplaceSite() {
          return { id: siteA };
        },
      } as unknown as MarketplaceService;
      const service = new PlanningService(db, market, provider);
      const context = selectedFaces
        ? { selectedFaceIds: [faceA] }
        : { selectedSiteIds: [siteA], window: { startDate: '2026-10-10', endDate: '2026-10-24' } };
      await assert.rejects(
        service.plan({ message: 'Help', context }, scope, atRepo.signal),
        status(499),
      );
      assert.equal(queries, 0);
      assert.equal(spent, false);
    }
  });
  it('rejects permit expiry inside the flight before marking availability or accepting a recommendation', async () => {
    const recommendation = {
      ...plan,
      recommendations: [{ siteId: siteA, faceId: faceA, reason: 'A' }],
    };
    const { service } = fixture({ permitExpiresAt: '2026-10-20' });
    const reply = await service.plan({ message: 'Help', context }, scope);
    assert.equal(reply.facts.sites[0].faces[0].availability, 'unavailable');
    assert.equal(reply.facts.sites[0].faces[0].flightEligible, false);
    assert.match(reply.facts.sites[0].faces[0].eligibilityReason!, /permit/);
    const options = await service.siteOptions(siteA, context.window);
    assert.equal(options.faces[0].available, false);
    await assert.rejects(
      fixture({ permitExpiresAt: '2026-10-20', response: recommendation }).service.plan(
        { message: 'Help', context },
        scope,
      ),
      status(502),
    );
    const quote = await fixture({ monthlyOnly: true, response: recommendation }).service.plan(
      { message: 'Help', context },
      scope,
    );
    assert.equal(quote.facts.sites[0].faces[0].flightEligible, true);
    assert.equal(quote.facts.sites[0].faces[0].availability, 'available');
    assert.equal(quote.facts.sites[0].faces[0].estimate.status, 'unavailable');
    assert.equal(quote.recommendations.length, 1);
  });
  it('preserves mixed published currencies without pretending they fit a single-currency budget', async () => {
    const { service } = fixture({ secondCurrency: 'GHS' });
    const reply = await service.plan({ message: 'Help', context }, scope);
    assert.deepEqual(reply.facts.budget.totals, { NGN: 1400, GHS: 1400 });
    assert.equal(reply.facts.budget.pricedCount, 2);
    assert.equal(reply.facts.budget.fit, 'unknown');
    assert.equal(reply.facts.budget.remaining, null);
    const explicit = await service.plan(
      {
        message: 'Help',
        context: {
          ...context,
          faceCurrencies: [
            { faceId: faceA, currency: 'NGN' },
            { faceId: faceB, currency: 'GHS' },
          ],
        },
      },
      scope,
    );
    assert.deepEqual(explicit.facts.budget.totals, { NGN: 1400, GHS: 1400 });
    const unavailable = await service.plan(
      {
        message: 'Help',
        context: { ...context, faceCurrencies: [{ faceId: faceB, currency: 'USD' }] },
      },
      scope,
    );
    assert.equal(unavailable.facts.budget.unpricedCount, 1);
    assert.equal(unavailable.facts.budget.fit, 'unknown');
    await assert.rejects(
      service.plan(
        { message: 'Help', context: { faceCurrencies: [{ faceId: faceA, currency: 'NGN' }] } },
        scope,
      ),
      status(400),
    );
  });
  it('keeps a known partial subtotal while full-plan budget fit remains unknown', async () => {
    const reply = await fixture().service.plan(
      { message: 'Help', context: { ...context, selectionTruncated: true } },
      scope,
    );
    assert.equal(reply.facts.selectionTruncated, true);
    assert.deepEqual(reply.facts.budget.totals, { NGN: 2800 });
    assert.equal(reply.facts.budget.fit, 'unknown');
    assert.equal(reply.facts.budget.remaining, null);
    assert.match(reply.facts.budget.assumptions.join(' '), /included faces only/);
  });
  it('rejects rate/capacity-limited requests before any database or marketplace grounding and holds leases during cancellation', async () => {
    const rate = provider(async () => completed());
    const limited = fixture({ transport: rate });
    for (let i = 0; i < 6; i++) await limited.service.plan({ message: 'Help', context }, scope);
    const counts = {
      queries: limited.calls.queries.length,
      searches: limited.calls.searches,
      repos: limited.calls.repos,
      details: limited.calls.details.length,
    };
    await assert.rejects(limited.service.plan({ message: 'Help', context }, scope), status(429));
    assert.deepEqual(
      {
        queries: limited.calls.queries.length,
        searches: limited.calls.searches,
        repos: limited.calls.repos,
        details: limited.calls.details.length,
      },
      counts,
    );
    const busy = provider(async () => completed());
    const leases = Array.from({ length: 4 }, (_, index) =>
      busy.admit({ userId: `active-${index}`, orgId: 'org-active' }),
    );
    const blocked = fixture({ transport: busy });
    await assert.rejects(blocked.service.plan({ message: 'Help', context }, scope), status(429));
    assert.equal(blocked.calls.searches, 0);
    assert.equal(blocked.calls.repos, 0);
    assert.equal(blocked.calls.details.length, 0);
    leases.forEach((lease) => lease.release());
    let finish: (value: { items: [] }) => void = () => {};
    const hangingMarket = {
      async search() {
        return new Promise<{ items: [] }>((resolve) => {
          finish = resolve;
        });
      },
    } as unknown as MarketplaceService;
    const hanging = new PlanningService({} as DatabaseService, hangingMarket, busy);
    const abort = new AbortController();
    const pending = hanging.plan({ message: 'Help' }, scope, abort.signal);
    abort.abort();
    await assert.rejects(pending, status(499));
    await assert.rejects(blocked.service.plan({ message: 'Help' }, scope), status(429));
    finish({ items: [] });
    await new Promise((resolve) => setImmediate(resolve));
    const resumed = await blocked.service.plan({ message: 'Help' }, scope);
    assert.equal(resumed.mode, 'openai');
  });
  it('normalizes valid uppercase UUID selections and currency references while rejecting case-insensitive duplicates', async () => {
    const { service, calls } = fixture({ secondCurrency: 'GHS' });
    const dto = plainToInstance(AssistantMessageDto, {
      message: 'Help',
      context: {
        ...context,
        selectedSiteIds: [siteA.toUpperCase(), siteB.toUpperCase()],
        selectedFaceIds: [faceA.toUpperCase(), faceB.toUpperCase()],
        faceCurrencies: [
          { faceId: faceA, currency: 'NGN' },
          { faceId: faceB.toUpperCase(), currency: 'GHS' },
        ],
      },
    });
    assert.deepEqual(await validate(dto), []);
    const reply = await service.plan(dto, scope);
    assert.deepEqual(calls.queries[0][1], [[faceA, faceB], scope.orgId]);
    assert.match(String(calls.queries[0][0]), /s.demo_agency_id::text = \$2::text/);
    assert.deepEqual(calls.details, [siteA, siteB]);
    assert.deepEqual(reply.facts.budget.totals, { NGN: 1400, GHS: 1400 });
    assert.equal(reply.facts.sites[0].faces[0].selected, true);
    assert.equal(reply.facts.distances.length, 1);
    for (const context of [
      { selectedSiteIds: [siteA, siteA.toUpperCase()] },
      { selectedFaceIds: [faceA, faceA.toUpperCase()] },
      {
        selectedFaceIds: [faceA],
        faceCurrencies: [
          { faceId: faceA, currency: 'NGN' },
          { faceId: faceA.toUpperCase(), currency: 'GHS' },
        ],
      },
    ]) {
      assert.ok(
        (await validate(plainToInstance(AssistantMessageDto, { message: 'Help', context }))).length,
      );
      await assert.rejects(service.plan({ message: 'Help', context }, scope), status(400));
    }
  });
  it('forwards client cancellation into actual marketplace detail loading before secondary reads or provider spend', async () => {
    const abort = new AbortController();
    const acquired: unknown[] = [];
    let spent = false;
    let finish: (rows: object[]) => void = () => {};
    let started: () => void = () => {};
    const initialRead = new Promise<void>((resolve) => {
      started = resolve;
    });
    const db = {
      async repo(entity: unknown) {
        acquired.push(entity);
        return {
          async query() {
            started();
            return new Promise<object[]>((resolve) => {
              finish = resolve;
            });
          },
        };
      },
    } as unknown as DatabaseService;
    const market = new MarketplaceService(db);
    Object.assign(market, {
      async search() {
        return { items: [], total: 0, page: 1, limit: 8 };
      },
    });
    const fake = {
      configured: true,
      admit() {
        return { release() {} };
      },
      async complete() {
        spent = true;
        return plan;
      },
    } as unknown as OpenAiPlannerProvider;
    const service = new PlanningService(db, market, fake);
    const pending = service.plan(
      { message: 'Help', context: { selectedSiteIds: [siteA] } },
      scope,
      abort.signal,
    );
    await initialRead;
    abort.abort();
    await assert.rejects(pending, status(499));
    finish([{ id: siteA, status: 'listed' }]);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(acquired, [BillboardSiteEntity]);
    assert.equal(spent, false);
  });
});

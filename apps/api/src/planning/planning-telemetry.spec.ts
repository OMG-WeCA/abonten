import { strict as assert } from 'node:assert';
import { describe, it, test } from 'node:test';
import { HttpException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../common/database.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import {
  OpenAiPlannerProvider,
  type ModelPlan,
  type ProviderInput,
} from './openai-planner.provider';
import { PlanningService } from './planning.service';
import {
  emitPlanningTelemetry,
  planningRequestId,
  planningTelemetry,
  type PlanningTelemetryInput,
  type PlanningTelemetryRecord,
} from './planning-telemetry';

const sensitive = 'SECRET_KEY_PRIVATE_BRIEF_PRIVATE_CHAT_PRIVATE_ORG_PRIVATE_USER_RAW_ERROR';
const scope = { userId: `user-${sensitive}`, orgId: `org-${sensitive}` };
const input: ProviderInput = {
  locale: 'en',
  message: sensitive,
  briefText: sensitive,
  history: [{ role: 'user', content: sensitive }],
  snapshot: { label: sensitive },
};
const plan: ModelPlan = { message: sensitive, recommendations: [], questions: [] };
function completed(value = plan, extra: object = {}, headers: Record<string, string> = {}) {
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
      ...extra,
    }),
    { headers },
  );
}
function provider(
  fetch: typeof globalThis.fetch,
  events: PlanningTelemetryRecord[],
  timeoutMs = 1000,
  configured = true,
) {
  return new OpenAiPlannerProvider(
    { get: () => (configured ? sensitive : '') } as unknown as ConfigService,
    { fetch, now: Date.now, timeoutMs, telemetry: (event) => events.push(event) },
  );
}
function service(
  api: OpenAiPlannerProvider | undefined,
  events: PlanningTelemetryRecord[],
  market?: Partial<MarketplaceService>,
) {
  let reads = 0;
  const marketplace = {
    async search() {
      reads++;
      return { items: [], total: 0 };
    },
    ...market,
  } as unknown as MarketplaceService;
  return {
    instance: new PlanningService({} as DatabaseService, marketplace, api, (event) =>
      events.push(event),
    ),
    reads: () => reads,
  };
}
function noContent(events: PlanningTelemetryRecord[]) {
  assert.doesNotMatch(
    JSON.stringify(events),
    /SECRET_KEY|PRIVATE_BRIEF|PRIVATE_CHAT|PRIVATE_ORG|PRIVATE_USER|RAW_ERROR/,
  );
  for (const event of events) {
    assert.ok(event.requestId);
    assert.match(event.requestId, /^[a-f0-9-]{36}$/);
    assert.ok(event.latencyMs !== null && event.latencyMs >= 0);
  }
}
function status(expected: number) {
  return (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), expected);
    return true;
  };
}

describe('content-free bounded agency planning telemetry', () => {
  it('allowlists fields, identifiers, codes and bounded actual token counts', () => {
    const requestId = planningRequestId();
    const safe = planningTelemetry({
      event: 'agency_planner.provider',
      requestId,
      model: 'gpt-6-luna',
      mode: 'openai',
      outcome: 'success',
      status: 200,
      latencyMs: 12.4,
      providerRequestId: 'req_verified123',
      providerCode: 'model_not_found',
      usage: { input_tokens: 321, output_tokens: 42, total_tokens: 363, message: sensitive },
      message: sensitive,
      orgId: sensitive,
      key: sensitive,
    } as PlanningTelemetryInput);
    assert.deepEqual(safe, {
      event: 'agency_planner.provider',
      requestId,
      providerRequestId: 'req_verified123',
      model: 'gpt-6-luna',
      mode: 'openai',
      outcome: 'success',
      status: 200,
      latencyMs: 12,
      usage: { inputTokens: 321, outputTokens: 42, totalTokens: 363 },
      providerCode: 'model_not_found',
    });
    const unsafe = planningTelemetry({
      event: 'agency_planner.provider',
      requestId: sensitive,
      providerRequestId: `req_${sensitive}\n`,
      model: 'gpt-6-luna',
      mode: 'openai',
      outcome: 'success',
      status: 999,
      latencyMs: Infinity,
      providerCode: sensitive,
      usage: { input_tokens: -1, output_tokens: 0.5, total_tokens: 10000001, error: sensitive },
    });
    assert.equal(unsafe.requestId, null);
    assert.equal(unsafe.providerRequestId, null);
    assert.equal(unsafe.providerCode, null);
    assert.equal(unsafe.status, null);
    assert.equal(unsafe.latencyMs, null);
    assert.equal(unsafe.usage, null);
    assert.doesNotMatch(JSON.stringify([safe, unsafe]), /SECRET_KEY|PRIVATE_BRIEF|RAW_ERROR/);
  });
  it('uses the safe record for NestLogger and ignores telemetry delivery failure', () => {
    const logged: unknown[][] = [];
    const old = Logger.log;
    Logger.log = (...args: unknown[]) => {
      logged.push(args);
    };
    const value: PlanningTelemetryInput = {
      event: 'agency_planner.plan',
      requestId: planningRequestId(),
      model: null,
      mode: 'local',
      outcome: 'local_success',
      status: 201,
      latencyMs: 0,
      usage: { input_tokens: 1, message: sensitive },
    };
    try {
      emitPlanningTelemetry(value);
    } finally {
      Logger.log = old;
    }
    assert.deepEqual(JSON.parse(String(logged[0][0])), planningTelemetry(value));
    assert.equal(logged[0][1], 'AgencyPlanner');
    assert.doesNotMatch(JSON.stringify(logged), /SECRET_KEY|PRIVATE_BRIEF|RAW_ERROR/);
    assert.doesNotThrow(() =>
      emitPlanningTelemetry(value, () => {
        throw new Error(sensitive);
      }),
    );
  });
  it('correlates provider and final-plan success without logging inputs, identity or output', async () => {
    const events: PlanningTelemetryRecord[] = [];
    const api = provider(
      async () =>
        completed(
          plan,
          {
            usage: {
              input_tokens: 1200,
              output_tokens: 200,
              total_tokens: 1400,
              secret: sensitive,
            },
          },
          { 'x-request-id': 'req_test_verified' },
        ),
      events,
    );
    const { instance } = service(api, events);
    const reply = await instance.plan(
      {
        message: sensitive,
        briefText: sensitive,
        shareBriefWithProvider: true,
        history: input.history,
      },
      scope,
    );
    assert.equal(reply.message, sensitive);
    assert.deepEqual(
      events.map((event) => [event.event, event.outcome, event.status]),
      [
        ['agency_planner.provider', 'success', 200],
        ['agency_planner.plan', 'success', 201],
      ],
    );
    assert.equal(events[0].requestId, events[1].requestId);
    assert.equal(events[0].providerRequestId, 'req_test_verified');
    assert.deepEqual(events[0].usage, { inputTokens: 1200, outputTokens: 200, totalTokens: 1400 });
    assert.equal(events[1].usage, null);
    noContent(events);
  });
  it('records mapped provider errors with only recognized diagnostic codes', async () => {
    const events: PlanningTelemetryRecord[] = [];
    const api = provider(
      async () =>
        new Response(JSON.stringify({ error: { code: 'model_not_found', message: sensitive } }), {
          status: 403,
          headers: { 'x-request-id': 'req_denied' },
        }),
      events,
    );
    await assert.rejects(
      service(api, events).instance.plan({ message: sensitive }, scope),
      status(503),
    );
    assert.deepEqual(
      events.map((event) => [event.outcome, event.status, event.providerCode]),
      [
        ['provider_error', 503, 'model_not_found'],
        ['provider_error', 503, 'model_not_found'],
      ],
    );
    noContent(events);
    const network: PlanningTelemetryRecord[] = [];
    await assert.rejects(
      provider(async () => {
        throw new Error(sensitive);
      }, network).complete(input, scope),
      status(502),
    );
    assert.equal(network[0].providerCode, null);
    assert.equal(network[0].outcome, 'provider_error');
    noContent(network);
  });
  it('classifies a dropped HTTP200 response stream as transport failure rather than invalid JSON or schema', async () => {
    const dropped: PlanningTelemetryRecord[] = [];
    let reads = 0;
    let calls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        reads++;
        if (reads === 1) controller.enqueue(new TextEncoder().encode('{"status":'));
        else controller.error(new Error(sensitive));
      },
    });
    await assert.rejects(
      service(
        provider(async () => {
          calls++;
          return new Response(stream, {
            status: 200,
            headers: { 'x-request-id': 'req_stream_dropped' },
          });
        }, dropped),
        dropped,
      ).instance.plan({ message: sensitive }, scope),
      status(502),
    );
    assert.equal(calls, 1);
    assert.equal(reads, 2);
    assert.deepEqual(
      dropped.map((event) => [event.outcome, event.status]),
      [
        ['provider_error', 502],
        ['provider_error', 502],
      ],
    );
    assert.equal(dropped[0].providerRequestId, 'req_stream_dropped');
    noContent(dropped);
    for (const response of [new Response('{invalid JSON'), completed({ ...plan, message: '' })]) {
      const invalid: PlanningTelemetryRecord[] = [];
      await assert.rejects(
        provider(async () => response, invalid).complete(input, scope),
        status(502),
      );
      assert.equal(invalid[0].outcome, 'invalid_response');
      noContent(invalid);
    }
  });
  it('distinguishes rejected schema from successful transport with invalid inventory references', async () => {
    const malformed: PlanningTelemetryRecord[] = [];
    await assert.rejects(
      service(
        provider(async () => completed({ ...plan, message: '' }), malformed),
        malformed,
      ).instance.plan({ message: sensitive }, scope),
      status(502),
    );
    assert.equal(malformed[0].outcome, 'invalid_response');
    assert.equal(malformed[1].outcome, 'provider_error');
    noContent(malformed);
    const invalid: PlanningTelemetryRecord[] = [];
    const model = {
      ...plan,
      recommendations: [
        {
          siteId: 'abcdefab-0000-4000-8000-000000000001',
          faceId: 'bcdefabc-0000-4000-8000-000000000001',
          reason: sensitive,
        },
      ],
    };
    await assert.rejects(
      service(
        provider(async () => completed(model), invalid),
        invalid,
      ).instance.plan({ message: sensitive }, scope),
      status(502),
    );
    assert.deepEqual(
      invalid.map((event) => event.outcome),
      ['success', 'invalid_reference'],
    );
    noContent(invalid);
  });
  it('logs admission rejection once, before any expensive read or provider call', async () => {
    const events: PlanningTelemetryRecord[] = [];
    let calls = 0;
    const api = provider(async () => {
      calls++;
      return completed();
    }, events);
    const admitted = api.admit(scope);
    const fixture = service(api, events);
    try {
      await assert.rejects(fixture.instance.plan({ message: sensitive }, scope), status(429));
    } finally {
      admitted.release();
    }
    assert.equal(fixture.reads(), 0);
    assert.equal(calls, 0);
    assert.deepEqual(
      events.map((event) => [event.event, event.outcome, event.status]),
      [['agency_planner.plan', 'rate_limited', 429]],
    );
    noContent(events);
  });
  it('reports local success, validation, grounding and pre-aborted outcomes without content', async () => {
    const events: PlanningTelemetryRecord[] = [];
    const local = service(undefined, events).instance;
    await local.plan({ message: sensitive }, scope);
    await assert.rejects(
      local.plan(
        {
          message: sensitive,
          context: { window: { startDate: '2026-10-10', endDate: '2026-10-10' } },
        },
        scope,
      ),
      status(400),
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(local.plan({ message: sensitive }, scope, controller.signal), status(499));
    await assert.rejects(
      local.plan({ message: sensitive }, { userId: '', orgId: '' }),
      status(403),
    );
    const api = provider(async () => completed(), events);
    await assert.rejects(
      service(api, events, {
        async search() {
          throw new NotFoundException(sensitive);
        },
      }).instance.plan({ message: sensitive }, scope),
      status(404),
    );
    assert.deepEqual(
      events.map((event) => event.outcome),
      ['local_success', 'validation_error', 'cancelled', 'validation_error', 'grounding_error'],
    );
    noContent(events);
  });
  it('records timeout and cancellation without raw fetch errors or hidden retries', async () => {
    const wait: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(new Error(sensitive));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener('abort', abort, { once: true });
      });
    const timeout: PlanningTelemetryRecord[] = [];
    await assert.rejects(
      service(provider(wait, timeout, 5), timeout).instance.plan({ message: sensitive }, scope),
      status(504),
    );
    assert.deepEqual(
      timeout.map((event) => event.outcome),
      ['timeout', 'timeout'],
    );
    noContent(timeout);
    const cancelled: PlanningTelemetryRecord[] = [];
    const controller = new AbortController();
    const api = provider(async (url, init) => {
      controller.abort();
      return wait(url, init);
    }, cancelled);
    await assert.rejects(
      service(api, cancelled).instance.plan({ message: sensitive }, scope, controller.signal),
      status(499),
    );
    // The HTTP cancellation can settle before provider cleanup. Wait one turn for both events.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(cancelled.filter((event) => event.outcome === 'cancelled').length, 2);
    noContent(cancelled);
  });
});

test('grounding counters are bounded and never record intent, labels or errors', () => {
  const result = planningTelemetry({
    event: 'agency_planner.plan',
    requestId: planningRequestId(),
    model: 'gpt-6-luna',
    mode: 'openai',
    outcome: 'success',
    status: 201,
    latencyMs: 5,
    grounding: {
      pagesRead: 3,
      candidatesDiscovered: 24,
      enrichmentReads: 6,
      enrichmentFailures: 2,
      filters: sensitive,
      source: sensitive,
      rawError: sensitive,
    },
  });
  assert.deepEqual(result.grounding, {
    pagesRead: 3,
    candidatesDiscovered: 24,
    enrichmentReads: 6,
    enrichmentFailures: 2,
  });
  assert.doesNotMatch(JSON.stringify(result), /SECRET_KEY|PRIVATE_BRIEF|RAW_ERROR/);
  const invalid = planningTelemetry({
    event: 'agency_planner.plan',
    requestId: planningRequestId(),
    model: null,
    mode: 'local',
    outcome: 'local_success',
    status: 201,
    latencyMs: 0,
    grounding: {
      pagesRead: 4,
      candidatesDiscovered: -1,
      enrichmentReads: 7,
      enrichmentFailures: NaN,
    },
  });
  assert.deepEqual(invalid.grounding, {
    pagesRead: null,
    candidatesDiscovered: null,
    enrichmentReads: null,
    enrichmentFailures: null,
  });
});

import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { compactPlanningSnapshot, PlanningSnapshotTooLargeError } from './planning-snapshot';
import { normalizePlanningDraft } from './planning-drafts.validation';
import { planningScoringCandidates } from './planning-scoring-adapter';
import { projectPlanningEnrichment } from './planning-enrichment';
import type { DatabaseService } from '../common/database.service';
import type { MarketplaceService } from '../marketplace/marketplace.service';
import type { OpenAiPlannerProvider, ProviderInput } from './openai-planner.provider';

const siteId = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const faceId = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const window = { startDate: '2026-11-01', endDate: '2026-11-29' };
const scope = { userId: 'synthetic-planner', orgId: 'synthetic-authorized-agency' };
function record(face: string, payload: Record<string, unknown>, dimension = 'environment') {
  return {
    id: `source-${face}-${dimension}`,
    siteId: siteId(1),
    dimension,
    payload: { faceId: face, ...payload },
    source: 'Synthetic licensed field-survey fixture',
    method: 'Independent structured survey fixture',
    verification: 'field_verified',
    dataClass: 'production',
    collectedAt: '2026-09-01T00:00:00Z',
    expiresAt: '2027-09-01T00:00:00Z',
  };
}
function fixture(faceCount = 2) {
  const calls = { search: 0, provider: [] as ProviderInput[], queries: [] as string[] };
  const detail = {
    id: siteId(1),
    name: 'Synthetic face-level source fixture',
    country: 'Nigeria',
    city: 'Lagos',
    region: 'Lagos',
    format: 'static',
    latitude: 6.4,
    longitude: 3.4,
    faces: Array.from({ length: faceCount }, (_, i) => ({
      id: faceId(i + 1),
      siteId: siteId(1),
      bookable: true,
      faceLabel: `Face ${i + 1}`,
    })),
    rateCards: Array.from({ length: faceCount }, (_, i) => ({
      id: `rate-${i + 1}`,
      siteId: siteId(1),
      faceId: faceId(i + 1),
      currency: 'NGN',
      rates: { perWeek: i === faceCount - 1 ? 1250 : 100 },
      effectiveFrom: '2020-01-01',
    })),
    metadata: [
      record(faceId(faceCount), {
        areaGranularity: 'neighborhood',
        areaNames: ['Ikoyi'],
        corridorName: 'Verified synthetic corridor',
      }),
      record(faceId(faceCount), { segments: { families: 0.8 } }, 'audience'),
    ],
  };
  const provider = {
    configured: true,
    admit() {
      return { release() {} };
    },
    async complete(input: ProviderInput) {
      calls.provider.push(input);
      return {
        message: 'Untrusted invented score 100 and price 1',
        recommendations: [
          {
            siteId: siteId(1),
            faceId: faceId(1),
            reasonCode: 'planning_interest' as const,
            reason: 'AI chooses cheaper poor fit',
          },
        ],
        questions: [],
        adviceCodes: ['confirm_quotes' as const],
        questionCodes: [],
      };
    },
  } as unknown as OpenAiPlannerProvider;
  const market = {
    async search() {
      calls.search++;
      return { items: [{ id: siteId(1) }], total: 1 };
    },
    async getMarketplaceSite(id: string) {
      assert.equal(id, siteId(1));
      return detail;
    },
  } as unknown as MarketplaceService;
  const db = {
    async repo() {
      return {
        async query(sql: string, args: unknown[]) {
          calls.queries.push(sql);
          if (Array.isArray(args[0]))
            return (args[0] as string[]).map((id) => ({ id, siteId: siteId(1) }));
          return detail.faces.map((face) => ({ faceId: face.id, available: true }));
        },
      };
    },
  } as unknown as DatabaseService;
  return { service: new PlanningService(db, market, provider), calls, detail };
}
const context = {
  window,
  budget: { amount: 5000, currency: 'NGN' },
  filters: { country: 'Nigeria', city: 'Lagos' },
  fitPreferences: {
    version: 1 as const,
    targetAreas: ['Ikoyi'],
    audienceTags: ['families'],
    goal: 'balanced' as const,
  },
};

test('server assessment and AI share deterministic fit: higher-fit expensive face beats cheaper poor-fit face, no invented model score', async () => {
  const { service, calls } = fixture();
  const local = await service.assess({ context }, scope);
  assert.equal(calls.provider.length, 0);
  assert.equal(local.assessment.portfolio.status, 'ready');
  assert.deepEqual(
    local.recommendations.map((item) => item.faceId),
    [faceId(2)],
  );
  assert.equal(local.assessment.portfolio.cost?.amount, 5000);
  const reply = await service.plan(
    { message: 'Recommend against confirmed controls.', context },
    scope,
  );
  assert.equal(calls.provider.length, 1);
  assert.deepEqual(
    reply.recommendations.map((item) => item.faceId),
    [faceId(2)],
  );
  assert.deepEqual(
    reply.assessment.portfolio.selectedFaceIds,
    local.assessment.portfolio.selectedFaceIds,
  );
  assert.doesNotMatch(reply.message, /invented|score 100|price 1/);
  assert.equal(reply.facts.ots, null);
  assert.equal(reply.facts.reach, null);
  assert.ok(calls.queries.every((sql) => !/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)));
});

test('full bounded face scoring keeps a higher-fit ninth face before reducing detail to eight', async () => {
  const { service } = fixture(9);
  const reply = await service.assess({ context }, scope);
  assert.equal(reply.facts.sites[0].facesEvaluated, 9);
  assert.equal(reply.facts.sites[0].facesOmitted, 1);
  assert.ok(reply.facts.sites[0].faces.some((face) => face.faceId === faceId(9)));
  assert.deepEqual(
    reply.recommendations.map((item) => item.faceId),
    [faceId(9)],
  );
});

test('unconsented brief-origin preferences never reach provider facts or influence its deterministic portfolio; local assessment may use them', async () => {
  const { service, calls } = fixture();
  const privateContext = {
    ...context,
    fitPreferences: {
      version: 1 as const,
      targetAreas: ['PRIVATE-PRIORITY-IKOYI'],
      audienceTags: ['PRIVATE-AUDIENCE-TOKEN'],
      goal: 'value' as const,
    },
  };
  const reply = await service.plan(
    {
      message: 'Help',
      briefText: 'PRIVATE BRIEF',
      contextRequiresBriefConsent: true,
      shareBriefWithProvider: false,
      context: privateContext,
    },
    scope,
  );
  assert.equal(reply.briefShared, false);
  assert.equal(reply.assessment.portfolio.status, 'insufficient_evidence');
  assert.deepEqual(reply.recommendations, []);
  assert.doesNotMatch(
    JSON.stringify(calls.provider),
    /PRIVATE-PRIORITY|PRIVATE-AUDIENCE|PRIVATE BRIEF/,
  );
  const local = await service.assess({ context: privateContext }, scope);
  assert.ok(
    JSON.stringify(local.assessment).includes('area') || local.assessment.assessments.length > 0,
  );
  assert.equal(calls.provider.length, 1);
});

test('preset method version and displayed config exactly match scored factors, even empty result', async () => {
  const { service } = fixture();
  const reply = await service.assess(
    { context: { ...context, fitPreferences: { version: 1, goal: 'value' } } },
    scope,
  );
  assert.equal(reply.assessment.version, reply.assessment.portfolio.version);
  assert.match(reply.assessment.version, /value/);
  for (const assessment of reply.assessment.assessments)
    assert.deepEqual(assessment.weights, reply.assessment.config.weights);
});

test('adapter does not promote region, road proximity, site bearing, DEMO or stale metadata into face fit', () => {
  const { detail } = fixture();
  detail.metadata.push({
    ...record(faceId(2), { faceBearingDeg: 180, approachHeadingDeg: 0 }, 'structure'),
    expiresAt: '2020-01-01T00:00:00Z',
  });
  detail.metadata.push({
    ...record(faceId(2), { dwellSeconds: 100 }, 'visibility'),
    dataClass: 'demo',
  });
  const face = {
    faceId: faceId(2),
    flightEligible: true,
    availability: 'unknown' as const,
    estimate: {
      status: 'unavailable' as const,
      siteId: siteId(1),
      faceId: faceId(2),
      reason: 'Missing quote',
    },
  };
  const projected = projectPlanningEnrichment({ ...detail, orientationDeg: 180 });
  const candidates = planningScoringCandidates(
    { siteId: detail.id, ...detail, faces: [face], enrichment: projected },
    detail,
    window,
    '2026-10-08T00:00:00Z',
  );
  assert.equal(candidates[0].coordinateStatus, 'owner_reported');
  assert.equal(candidates[0].geometry?.faceBearingDeg, undefined);
  assert.equal(candidates[0].geometry?.dwellSeconds, undefined);
  assert.ok(!candidates[0].geography?.areas?.value.includes('Lagos'));
  assert.equal(candidates[0].availability, 'unknown');
});

test('optional preferences preserve old drafts; persist only controls/version and reject score/unknown evidence fields', () => {
  const draft = {
    version: 1,
    window,
    country: 'Nigeria',
    query: '',
    format: '',
    budget: '5000',
    currency: 'NGN',
    faces: [],
  };
  assert.deepEqual(normalizePlanningDraft(draft), draft);
  const enriched = {
    ...draft,
    fitPreferences: context.fitPreferences,
    scoringVersion: 'brief-fit-v1-provisional',
  };
  assert.deepEqual(normalizePlanningDraft(enriched), enriched);
  for (const fitPreferences of [
    { version: 2 },
    { version: 1, score: 99 },
    { version: 1, daypart: 'midnight' },
    { version: 1, targetAreas: ['Ikoyi', 'ikoyi'] },
  ])
    assert.throws(() => normalizePlanningDraft({ ...draft, fitPreferences }), BadRequestException);
});

test('read-only assessment rejects missing authorization scope and interrupted requests', async () => {
  const { service, calls } = fixture();
  await assert.rejects(
    () => service.assess({ context }, { userId: scope.userId, orgId: '' }),
    ForbiddenException,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => service.assess({ context }, scope, controller.signal), /cancelled/);
  assert.equal(calls.search, 0);
  assert.equal(calls.provider.length, 0);
});

test('modeled coordinate records cannot unlock verified face geometry', () => {
  const { detail } = fixture();
  detail.metadata.push(
    record(
      faceId(2),
      {
        latitude: detail.latitude,
        longitude: detail.longitude,
        coordinateAccuracyMetres: 5,
        evidenceKind: 'modeled',
      },
      'structure',
    ),
  );
  const face = {
    faceId: faceId(2),
    flightEligible: true,
    availability: 'unknown' as const,
    estimate: {
      status: 'unavailable' as const,
      siteId: siteId(1),
      faceId: faceId(2),
      reason: 'Missing quote',
    },
  };
  const candidates = planningScoringCandidates(
    { siteId: detail.id, ...detail, faces: [face], enrichment: projectPlanningEnrichment(detail) },
    detail,
    window,
    '2026-10-08T00:00:00Z',
  );
  assert.equal(candidates[0].coordinateStatus, 'owner_reported');
});

test('local assessment rate admission is independent of provider', async () => {
  const { service, calls } = fixture();
  for (let i = 0; i < 30; i++) await service.assess({ context }, scope);
  await assert.rejects(
    () => service.assess({ context }, scope),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'getStatus' in error &&
      typeof error.getStatus === 'function' &&
      error.getStatus() === 429,
  );
  assert.equal(calls.provider.length, 0);
});

test('cancelled local assessment holds worker capacity until its pending read settles', async () => {
  const { service } = fixture();
  const pendingReads: Array<(value: { items: never[]; total: number }) => void> = [];
  const market = (
    service as unknown as {
      marketplace: { search: () => Promise<{ items: never[]; total: number }> };
    }
  ).marketplace;
  market.search = () => new Promise((resolve) => pendingReads.push(resolve));
  const controllers = Array.from({ length: 4 }, () => new AbortController());
  const work = controllers.map((controller) =>
    service.assess({ context }, scope, controller.signal).catch((error) => error as unknown),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pendingReads.length, 4);
  controllers[0]!.abort();
  const cancelled = (await work[0]) as { getStatus(): number };
  assert.equal(cancelled.getStatus(), 499);
  await assert.rejects(
    () => service.assess({ context }, scope),
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'getStatus' in error &&
      typeof error.getStatus === 'function' &&
      error.getStatus() === 429,
  );
  for (const resolve of pendingReads) resolve({ items: [], total: 0 });
  await Promise.all(work);
  await new Promise((resolve) => setImmediate(resolve));
  market.search = async () => ({ items: [], total: 0 });
  const retry = await service.assess({ context }, scope);
  assert.deepEqual(retry.recommendations, []);
  assert.equal((service as unknown as { activeAssessments: number }).activeAssessments, 0);
});

test('local assessment deadline is cancellable and holds capacity while a stalled read settles', async (t) => {
  const { service } = fixture();
  let release: (value: { items: never[]; total: number }) => void = () => {};
  const market = (
    service as unknown as {
      marketplace: { search: () => Promise<{ items: never[]; total: number }> };
    }
  ).marketplace;
  market.search = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = service
    .assess({ context }, scope)
    .catch((error) => error as { getStatus(): number });
  t.mock.timers.tick(30001);
  const result = await pending;
  assert.ok('getStatus' in result);
  assert.equal(result.getStatus(), 504);
  assert.equal((service as unknown as { activeAssessments: number }).activeAssessments, 1);
  release({ items: [], total: 0 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((service as unknown as { activeAssessments: number }).activeAssessments, 0);
  t.mock.timers.reset();
});

test('provider score context keeps canonical IDs/config without duplicating full factor arrays and enforces total bytes', async () => {
  const { service, calls } = fixture();
  const response = await service.plan({ message: 'Compare confirmed plan.', context }, scope);
  const snapshot = calls.provider[0]!.snapshot as {
    assessment: {
      version: string;
      config: unknown;
      assessments?: unknown;
      portfolio: {
        selectedFaceIds: string[];
        selectedAssessments?: unknown;
        assessments?: unknown;
      };
    };
  };
  assert.deepEqual(
    snapshot.assessment.portfolio.selectedFaceIds,
    response.assessment.portfolio.selectedFaceIds,
  );
  assert.equal(snapshot.assessment.assessments, undefined);
  assert.equal(snapshot.assessment.portfolio.selectedAssessments, undefined);
  assert.equal(snapshot.assessment.portfolio.assessments, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) <= 96 * 1024);
  assert.throws(
    () =>
      compactPlanningSnapshot({
        sites: [
          {
            enrichment: {},
            faces: [
              { faceId: faceId(1), selected: true, unremovableCanonicalSource: 'x'.repeat(100000) },
            ],
          },
        ],
      }),
    PlanningSnapshotTooLargeError,
  );
});

test('digital adapter never equates inventory rotating slots with purchased advertiser exposure or combines unrelated schedule records', () => {
  const { detail } = fixture();
  const digitalDetail = {
    ...detail,
    format: 'digital_led',
    faces: detail.faces.map((face) => ({
      ...face,
      spotLengthSeconds: 10,
      loopLengthSeconds: 60,
      spotsPerLoop: 6,
    })),
  };
  digitalDetail.metadata.push(record(faceId(2), { advertiserSpotsPerLoop: 3 }));
  digitalDetail.metadata.push(
    record(faceId(2), { scheduleWindow: window, scheduleDaypartCoverage: { day: 1, night: 0.5 } }),
  );
  const face = {
    faceId: faceId(2),
    flightEligible: true,
    availability: 'available' as const,
    estimate: {
      status: 'unavailable' as const,
      siteId: siteId(1),
      faceId: faceId(2),
      reason: 'Missing quote',
    },
  };
  const inputs = planningScoringCandidates(
    {
      siteId: digitalDetail.id,
      ...digitalDetail,
      faces: [face],
      enrichment: projectPlanningEnrichment(digitalDetail),
    },
    digitalDetail,
    window,
    '2026-10-08T00:00:00Z',
  );
  assert.equal(inputs[0].digital?.loopLengthSeconds?.value, 60);
  assert.equal(inputs[0].digital?.advertiserSpotsPerLoop, undefined);
  assert.deepEqual(inputs[0].digital?.scheduleWindow, window);
  assert.ok(!('spotsPerLoop' in inputs[0].digital!));
});

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
    payload: { faceId: face, ...payload } as Record<string, unknown>,
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

test('digital adapter selects the newest matching-flight record instead of a newer other-month schedule, independent of input order', () => {
  const { detail } = fixture();
  const november = { startDate: '2026-11-01', endDate: '2026-12-01' };
  const december = { startDate: '2026-12-01', endDate: '2027-01-01' };
  const olderNovember = {
    ...record(faceId(2), {
      scheduleWindow: november,
      scheduleDaypartCoverage: { day: 1, night: 0.25 },
      advertiserSpotsPerLoop: 2,
    }),
    id: 'november-old-record',
    source: 'November source old allocation',
    collectedAt: '2026-10-05T00:00:00Z',
  };
  const currentNovember = {
    ...record(faceId(2), {
      scheduleWindow: november,
      scheduleDaypartCoverage: { day: 0.75, night: 0.5 },
      advertiserSpotsPerLoop: 1,
    }),
    id: 'november-current-record',
    source: 'November source current allocation',
    collectedAt: '2026-10-07T00:00:00Z',
  };
  const newerDecember = {
    ...record(faceId(2), {
      scheduleWindow: december,
      scheduleDaypartCoverage: { day: 0, night: 1 },
      advertiserSpotsPerLoop: 9,
    }),
    id: 'december-newer-record',
    source: 'December unrelated purchased allocation',
    collectedAt: '2026-10-08T00:00:00Z',
  };
  const digitalDetail = {
    ...detail,
    format: 'digital_led',
    faces: detail.faces.map((face) => ({
      ...face,
      spotLengthSeconds: 10,
      loopLengthSeconds: 120,
      spotsPerLoop: 6,
    })),
    metadata: [olderNovember, currentNovember, newerDecember],
  };
  const face = {
    faceId: faceId(2),
    flightEligible: true,
    availability: 'available' as const,
    estimate: {
      status: 'unavailable' as const,
      siteId: siteId(1),
      faceId: faceId(2),
      reason: 'Missing full-flight quote',
    },
  };
  const adapt = (metadata: typeof digitalDetail.metadata, requestedWindow = november) =>
    planningScoringCandidates(
      {
        siteId: digitalDetail.id,
        ...digitalDetail,
        faces: [face],
        enrichment: projectPlanningEnrichment(digitalDetail),
      },
      { ...digitalDetail, metadata },
      requestedWindow,
      '2026-10-09T00:00:00Z',
    )[0]!;
  const first = adapt(digitalDetail.metadata);
  const reversed = adapt([...digitalDetail.metadata].reverse());
  assert.deepEqual(first, reversed);
  assert.deepEqual(first.digital?.scheduleWindow, november);
  assert.equal(first.digital?.advertiserSpotsPerLoop?.value, 1);
  assert.deepEqual(first.digital?.scheduleDaypartCoverage?.value, { day: 0.75, night: 0.5 });
  assert.match(first.digital?.scheduleDaypartCoverage?.source ?? '', /november-current-record/);
  assert.doesNotMatch(JSON.stringify(first), /december-newer-record|December unrelated/);
  const decemberResult = adapt(digitalDetail.metadata, december);
  assert.deepEqual(decemberResult.digital?.scheduleWindow, december);
  assert.equal(decemberResult.digital?.advertiserSpotsPerLoop?.value, 9);
});

test('nonmatching digital flight leaves schedule and advertiser allocation unknown without leaking the other flight', () => {
  const { detail } = fixture();
  const november = { startDate: '2026-11-01', endDate: '2026-12-01' };
  const december = { startDate: '2026-12-01', endDate: '2027-01-01' };
  const digitalDetail = {
    ...detail,
    format: 'digital_led',
    faces: detail.faces.map((face) => ({
      ...face,
      spotLengthSeconds: 10,
      loopLengthSeconds: 60,
      spotsPerLoop: 6,
    })),
    metadata: [
      {
        ...record(faceId(2), {
          scheduleWindow: december,
          scheduleDaypartCoverage: { day: 0, night: 1 },
          advertiserSpotsPerLoop: 9,
        }),
        source: 'UNRELATED-DECEMBER-ALLOCATION',
        collectedAt: '2026-10-08T00:00:00Z',
      },
    ],
  };
  const face = {
    faceId: faceId(2),
    flightEligible: true,
    availability: 'available' as const,
    estimate: {
      status: 'unavailable' as const,
      siteId: siteId(1),
      faceId: faceId(2),
      reason: 'Missing full-flight quote',
    },
  };
  const adapt = (requestedWindow: typeof november | null) =>
    planningScoringCandidates(
      {
        siteId: digitalDetail.id,
        ...digitalDetail,
        faces: [face],
        enrichment: projectPlanningEnrichment(digitalDetail),
      },
      digitalDetail,
      requestedWindow,
      '2026-10-09T00:00:00Z',
    )[0]!;
  for (const candidate of [adapt(november), adapt(null)]) {
    assert.equal(candidate.digital?.scheduleWindow, undefined);
    assert.equal(candidate.digital?.advertiserSpotsPerLoop, undefined);
    assert.equal(candidate.digital?.scheduleDaypartCoverage, undefined);
    assert.doesNotMatch(JSON.stringify(candidate), /UNRELATED-DECEMBER-ALLOCATION/);
  }
});

/** Pure production-shaped fixtures: no database mutation, captured audience or
 * genuine provider generation. Each face's source facts come through the real
 * authorized-detail adapter and full PlanningService portfolio path. */
function portfolioFixture(
  definitions: {
    facing: number;
    price: number;
    digital?: { loop: number; allocation: number };
    sparse?: boolean;
    availability?: 'available' | 'unknown' | 'unavailable';
  }[],
) {
  const calls = {
    provider: [] as ProviderInput[],
    scopes: [] as string[],
    queries: [] as string[],
  };
  const details = definitions.map((definition, index) => {
    const id = siteId(index + 10),
      face = faceId(index + 10);
    const geometry = {
      faceBearingDeg: definition.facing,
      approachHeadingDeg: 0,
      viewingDistanceM: 100,
      legibilityDistanceM: 200,
      unobstructedFraction: 1,
      dwellSeconds: 10,
    };
    const structure = {
      ...record(
        face,
        {
          ...geometry,
          latitude: 6.4 + index / 100,
          longitude: 3.4 + index / 100,
          coordinateAccuracyMetres: 5,
        },
        'structure',
      ),
      siteId: id,
      id: `geometry-source-${index}`,
    };
    const environment = {
      ...record(face, {
        areaGranularity: 'neighborhood',
        areaNames: ['Ikoyi'],
        corridorName: index === 0 ? 'Corridor A' : `Corridor ${index}`,
        daypartCoverage: { day: 1, night: 1 },
        ...(definition.digital
          ? {
              scheduleWindow: window,
              scheduleDaypartCoverage: { day: 1, night: 1 },
              advertiserSpotsPerLoop: definition.digital.allocation,
            }
          : {}),
      }),
      siteId: id,
      id: `environment-source-${index}`,
    };
    const illumination = {
      ...record(face, { nightLighting: true }, 'illumination'),
      siteId: id,
      id: `lighting-source-${index}`,
    };
    return {
      id,
      name: `Synthetic realistic portfolio face ${index}`,
      city: 'Lagos',
      country: 'Nigeria',
      format: definition.digital ? 'digital_led' : 'static',
      latitude: 6.4 + index / 100,
      longitude: 3.4 + index / 100,
      faces: [
        {
          id: face,
          siteId: id,
          bookable: true,
          faceLabel: `Face ${index}`,
          pixelWidth: 1920,
          pixelHeight: 1080,
          spotLengthSeconds: 10,
          loopLengthSeconds: definition.digital?.loop ?? 60,
          spotsPerLoop: 6,
        },
      ],
      metadata: definition.sparse ? [] : [structure, environment, illumination],
      rateCards: [
        {
          id: `portfolio-price-${index}`,
          siteId: id,
          faceId: face,
          currency: 'NGN',
          rates: { perWeek: definition.price / 4 },
          effectiveFrom: '2020-01-01',
        },
      ],
    };
  });
  const provider = {
    configured: true,
    admit() {
      return { release() {} };
    },
    async complete(input: ProviderInput) {
      calls.provider.push(input);
      return {
        message: 'BAD_MODEL bypass usable exposure',
        recommendations: [
          {
            siteId: details[0]!.id,
            faceId: details[0]!.faces[0]!.id,
            reason: 'Cheapest option despite unsupported exposure',
          },
        ],
        questions: [],
      };
    },
  } as unknown as OpenAiPlannerProvider;
  const market = {
    async search(_query: unknown, _signal: unknown, orgId: string) {
      calls.scopes.push(orgId);
      return { items: details.map((detail) => ({ id: detail.id })), total: details.length };
    },
    async getMarketplaceSite(id: string, _signal: unknown, orgId: string) {
      calls.scopes.push(orgId);
      const detail = details.find((detail) => detail.id === id);
      if (!detail) throw new BadRequestException('Unknown source fixture');
      return detail;
    },
  } as unknown as MarketplaceService;
  const db = {
    async repo() {
      return {
        async query(sql: string, args: unknown[]) {
          calls.queries.push(sql);
          if (Array.isArray(args[0]))
            return (args[0] as string[]).flatMap((id) =>
              details.flatMap((detail) =>
                detail.faces
                  .filter((face) => face.id === id)
                  .map((face) => ({ id: face.id, siteId: detail.id })),
              ),
            );
          const index = details.findIndex((detail) => detail.id === args[0]);
          if (index < 0) return [];
          const availability = definitions[index]!.availability;
          return availability === 'unknown'
            ? []
            : [{ faceId: details[index]!.faces[0]!.id, available: availability !== 'unavailable' }];
        },
      };
    },
  } as unknown as DatabaseService;
  return { service: new PlanningService(db, market, provider), calls, details };
}
const usableContext = {
  ...context,
  fitPreferences: {
    version: 1 as const,
    targetAreas: ['Ikoyi'],
    approachDirection: 'N' as const,
    daypart: 'day' as const,
    goal: 'balanced' as const,
  },
};

test('full API portfolio rejects two cheap wrong-facing faces in favor of supported compatible exposure, and AI cannot bypass it', async () => {
  const { service, calls, details } = portfolioFixture([
    { facing: 0, price: 400 },
    { facing: 0, price: 400 },
    { facing: 180, price: 5000 },
  ]);
  const local = await service.assess({ context: usableContext }, scope);
  assert.deepEqual(
    local.recommendations.map((item) => item.faceId),
    [details[2]!.faces[0]!.id],
  );
  assert.equal(local.assessment.portfolio.cost?.amount, 5000);
  for (const detail of details.slice(0, 2))
    assert.equal(
      local.assessment.assessments.find((item) => item.faceId === detail.faces[0]!.id)?.eligible,
      false,
    );
  const reply = await service.plan(
    { message: 'Follow confirmed brief and budget.', context: usableContext },
    scope,
  );
  assert.deepEqual(reply.recommendations, local.recommendations);
  assert.doesNotMatch(JSON.stringify(reply), /BAD_MODEL|bypass usable exposure/);
  assert.equal(calls.provider.length, 1);
  assert.ok(calls.scopes.every((org) => org === scope.orgId));
  assert.ok(calls.queries.every((sql) => !/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)));
  assert.equal(reply.facts.ots, null);
  assert.equal(reply.facts.reach, null);
});

test('full API portfolio attenuates tiny purchased digital allocation rather than letting two cheap screens defeat supported exposure', async () => {
  const { service, details } = portfolioFixture([
    { facing: 180, price: 400, digital: { loop: 6000, allocation: 1 } },
    { facing: 180, price: 400, digital: { loop: 6000, allocation: 1 } },
    { facing: 180, price: 5000, digital: { loop: 60, allocation: 3 } },
  ]);
  const reply = await service.assess({ context: usableContext }, scope);
  assert.deepEqual(
    reply.recommendations.map((item) => item.faceId),
    [details[2]!.faces[0]!.id],
  );
  assert.equal(reply.assessment.portfolio.cost?.amount, 5000);
  assert.equal(reply.facts.ots, null);
  assert.equal(reply.facts.reach, null);
});

test('known usable exposure precedes sparse interest, while missing exposure still permits separately qualified planning continuity', async () => {
  const supported = portfolioFixture([
    { facing: 180, price: 400, sparse: true },
    { facing: 180, price: 5000 },
  ]);
  const reply = await supported.service.assess({ context: usableContext }, scope);
  assert.deepEqual(
    reply.recommendations.map((item) => item.faceId),
    [supported.details[1]!.faces[0]!.id],
  );
  const sparse = portfolioFixture([
    { facing: 180, price: 400, sparse: true, availability: 'unknown' },
  ]);
  const fallback = await sparse.service.assess({ context: usableContext }, scope);
  assert.deepEqual(
    fallback.recommendations.map((item) => item.faceId),
    [sparse.details[0]!.faces[0]!.id],
  );
  assert.equal(fallback.assessment.portfolio.confirmedBudgetFit, false);
  assert.equal(fallback.assessment.portfolio.objective, 0);
  assert.ok(fallback.assessment.portfolio.provisionalObjective > 0);
  assert.equal(fallback.assessment.assessments[0]!.score, null);
  assert.equal(fallback.assessment.assessments[0]!.exposure.status, 'unknown');
  assert.equal(fallback.assessment.assessments[0]!.utilityTier, 'provisional_interest');
  assert.equal(fallback.assessment.assessments[0]!.planningUtility.exposureMultiplier, null);
  assert.equal(fallback.facts.sites[0]!.faces[0]!.availability, 'unknown');
  assert.equal(fallback.facts.ots, null);
  assert.equal(fallback.facts.reach, null);
});

test('locked incompatible exposure cannot be silently repaired by AI, and private or missing face IDs fail before provider use', async () => {
  const { service, calls, details } = portfolioFixture([
    { facing: 0, price: 400 },
    { facing: 180, price: 5000 },
  ]);
  const locked = {
    ...usableContext,
    selectedSiteIds: [details[0]!.id],
    selectedFaceIds: [details[0]!.faces[0]!.id],
  };
  const reply = await service.assess({ context: locked }, scope);
  assert.notEqual(reply.assessment.portfolio.status, 'ready');
  assert.deepEqual(reply.recommendations, []);
  await assert.rejects(
    () => service.assess({ context: { ...usableContext, selectedFaceIds: [faceId(999)] } }, scope),
    BadRequestException,
  );
  assert.equal(calls.provider.length, 0);
});

test('a newer matching-flight zero allocation supersedes older positive plays and remains known no-delivery evidence in the full API portfolio', async () => {
  const { service, details } = portfolioFixture([
    { facing: 180, price: 400, digital: { loop: 60, allocation: 1 } },
    { facing: 180, price: 5000, digital: { loop: 60, allocation: 3 } },
  ]);
  const cancelled = details[0]!;
  const zero = {
    ...record(cancelled.faces[0]!.id, {
      scheduleWindow: window,
      scheduleDaypartCoverage: { day: 1, night: 1 },
      advertiserSpotsPerLoop: 0,
    }),
    siteId: cancelled.id,
    id: 'newest-zero-purchase',
    source: 'Source-backed withdrawn advertiser allocation',
    collectedAt: '2026-10-08T00:00:00Z',
  };
  cancelled.metadata.push(zero);
  const adapt = () =>
    planningScoringCandidates(
      {
        siteId: cancelled.id,
        ...cancelled,
        faces: [
          {
            faceId: cancelled.faces[0]!.id,
            flightEligible: true,
            availability: 'available',
            estimate: {
              status: 'unavailable',
              siteId: cancelled.id,
              faceId: cancelled.faces[0]!.id,
              reason: 'Synthetic adapter cost not needed',
            },
          },
        ],
        enrichment: projectPlanningEnrichment(cancelled),
      },
      cancelled,
      window,
      '2026-10-09T00:00:00Z',
    )[0]!;
  const first = adapt();
  cancelled.metadata.reverse();
  const reversed = adapt();
  assert.deepEqual(first, reversed);
  assert.equal(first.digital?.advertiserSpotsPerLoop?.value, 0);
  assert.match(first.digital?.advertiserSpotsPerLoop?.source ?? '', /newest-zero-purchase/);
  const reply = await service.assess({ context: usableContext }, scope);
  assert.deepEqual(
    reply.recommendations.map((item) => item.faceId),
    [details[1]!.faces[0]!.id],
  );
  const assessment = reply.assessment.assessments.find(
    (item) => item.faceId === cancelled.faces[0]!.id,
  )!;
  assert.equal(assessment.eligible, false);
  assert.equal(assessment.exposure.delivery.value, 0);
  assert.equal(assessment.utilityTier, 'ineligible');
});

test('measured zero dwell survives the adapter and cannot be compensated by geography or a cheap price', async () => {
  const { service, details } = portfolioFixture([
    { facing: 180, price: 400 },
    { facing: 180, price: 5000 },
  ]);
  const stalled = details[0]!;
  const structure = stalled.metadata.find((item) => item.dimension === 'structure')!;
  structure.payload.dwellSeconds = 0;
  const reply = await service.assess({ context: usableContext }, scope);
  const assessment = reply.assessment.assessments.find(
    (item) => item.faceId === stalled.faces[0]!.id,
  )!;
  assert.equal(assessment.eligible, false);
  assert.equal(assessment.exposure.usable.value, 0);
  assert.deepEqual(
    reply.recommendations.map((item) => item.faceId),
    [details[1]!.faces[0]!.id],
  );
});

test('removing detailed overlap evidence cannot increase full-portfolio supported utility', async () => {
  const { service, details } = portfolioFixture([
    { facing: 180, price: 400 },
    { facing: 180, price: 400 },
  ]);
  for (const detail of details) {
    const environment = detail.metadata.find((item) => item.dimension === 'environment')!;
    environment.payload.corridorName = 'Same source corridor';
  }
  const before = await service.assess({ context: usableContext }, scope);
  const second = details[1]!.metadata.find((item) => item.dimension === 'environment')!;
  delete second.payload.corridorName;
  delete second.payload.areaNames;
  delete second.payload.areaGranularity;
  const after = await service.assess({ context: usableContext }, scope);
  assert.ok(after.assessment.portfolio.objective <= before.assessment.portfolio.objective);
  assert.equal(after.facts.ots, null);
  assert.equal(after.facts.reach, null);
});

test('newest matching-flight purchase remains coherent when coverage is missing or invalid and never fills fields from an older record', async () => {
  for (const coverage of [undefined, { day: 2, night: 1 }]) {
    for (const allocation of [0, 3, undefined, 7]) {
      const { service, details } = portfolioFixture([
        { facing: 180, price: 400, digital: { loop: 60, allocation: 2 } },
        { facing: 180, price: 5000, digital: { loop: 60, allocation: 3 } },
      ]);
      const detail = details[0]!;
      const newest = {
        ...record(detail.faces[0]!.id, {
          scheduleWindow: window,
          scheduleDaypartCoverage: coverage,
          advertiserSpotsPerLoop: allocation,
        }),
        siteId: detail.id,
        id: 'newest-incomplete-purchase',
        source: 'Source-backed newest coherent purchase record',
        collectedAt: '2026-10-08T00:00:00Z',
      };
      if (allocation === 0) {
        detail.faces[0]!.spotLengthSeconds = 0;
        detail.faces[0]!.loopLengthSeconds = 0;
        const structure = detail.metadata.find((item) => item.dimension === 'structure')!;
        delete structure.payload.dwellSeconds;
      }
      detail.metadata.push(newest);
      const adapt = () =>
        planningScoringCandidates(
          {
            siteId: detail.id,
            ...detail,
            faces: [
              {
                faceId: detail.faces[0]!.id,
                flightEligible: true,
                availability: 'available',
                estimate: {
                  status: 'unavailable',
                  siteId: detail.id,
                  faceId: detail.faces[0]!.id,
                  reason: 'Synthetic missing quote',
                },
              },
            ],
            enrichment: projectPlanningEnrichment(detail),
          },
          detail,
          window,
          '2026-10-09T00:00:00Z',
        )[0]!;
      const candidate = adapt();
      detail.metadata.reverse();
      assert.deepEqual(adapt(), candidate);
      assert.deepEqual(candidate.digital?.scheduleWindow, window);
      assert.equal(candidate.digital?.scheduleDaypartCoverage, undefined);
      assert.equal(
        candidate.digital?.advertiserSpotsPerLoop?.value,
        allocation === 7 ? undefined : allocation,
      );
      if (allocation === 0 || allocation === 3)
        assert.match(
          candidate.digital?.advertiserSpotsPerLoop?.source ?? '',
          /newest-incomplete-purchase/,
        );
      assert.doesNotMatch(JSON.stringify(candidate.digital), /environment-source-0/);
      const reply = await service.assess({ context: usableContext }, scope);
      const assessment = reply.assessment.assessments.find(
        (item) => item.faceId === detail.faces[0]!.id,
      )!;
      if (allocation === 0) {
        assert.equal(assessment.eligible, false);
        assert.equal(assessment.exposure.delivery.value, 0);
      } else {
        assert.equal(assessment.exposure.delivery.value, null);
        assert.equal(assessment.utilityTier, 'provisional_interest');
      }
      assert.deepEqual(
        reply.recommendations.map((item) => item.faceId),
        [details[1]!.faces[0]!.id],
      );
    }
  }
});

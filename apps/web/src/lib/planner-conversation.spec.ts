import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AssistantStatus } from './agency-api';
import { buildPlannerContext, buildPlannerRequest, isOpenAiReady } from './planner-conversation';

const status: AssistantStatus = {
  mode: 'openai',
  provider: 'openai',
  model: 'gpt-6-luna',
  aiAvailable: true,
  message: '',
  documentFormats: ['txt'],
  maxUploadBytes: 10485760,
  documentsRetained: false,
  externalTransfer: true,
};
const window = { startDate: '2026-10-05', endDate: '2026-11-02' };
const defaults = {
  message: 'Plan this flight',
  locale: 'en' as const,
  status,
  messages: [],
  context: { window },
  briefText: 'Confidential brief',
  briefConfirmed: true,
  briefConsentText: null,
};

test('ready UI requires the exact configured provider/model and availability', () => {
  assert.equal(isOpenAiReady(status), true);
  for (const value of [
    null,
    { ...status, model: null },
    { ...status, aiAvailable: false },
    { ...status, mode: 'local' as const },
    { ...status, provider: null },
  ])
    assert.equal(isOpenAiReady(value), false);
});
test('confirmation alone never shares an uploaded brief with OpenAI', () => {
  const request = buildPlannerRequest(defaults);
  assert.equal(request.shareBriefWithProvider, false);
  assert.equal(request.briefText, undefined);
  assert.ok(!JSON.stringify(request).includes(defaults.briefText));
});
test('sharing requires consent to the current confirmed text; editing invalidates it', () => {
  const consented = { ...defaults, briefConsentText: defaults.briefText };
  assert.equal(buildPlannerRequest(consented).briefText, defaults.briefText);
  assert.equal(buildPlannerRequest(consented).shareBriefWithProvider, true);
  assert.equal(
    buildPlannerRequest({ ...consented, briefText: 'Edited brief' }).briefText,
    undefined,
  );
  assert.equal(buildPlannerRequest({ ...consented, briefConfirmed: false }).briefText, undefined);
  assert.equal(buildPlannerRequest({ ...consented, briefConsentText: null }).briefText, undefined);
});
test('local help can use confirmed text without provider transfer', () => {
  const request = buildPlannerRequest({
    ...defaults,
    status: {
      ...status,
      mode: 'local',
      provider: null,
      model: null,
      aiAvailable: false,
      externalTransfer: false,
    },
  });
  assert.equal(request.briefText, defaults.briefText);
  assert.equal(request.shareBriefWithProvider, false);
});
test('history is bounded and preserves Unicode code points', () => {
  const request = buildPlannerRequest({
    ...defaults,
    messages: Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? ('assistant' as const) : ('user' as const),
      text: `${index} ` + '😀'.repeat(6000),
    })),
  });
  assert.equal(request.history!.length, 8);
  assert.match(request.history![0].content, /^12 /);
  assert.ok(
    request.history!.every(
      (item) => Array.from(item.content).length === 4000 && !item.content.includes('\ufffd'),
    ),
  );
});
test('context bounds and deduplicates actual IDs and strips injected client prices', () => {
  const ids = Array.from(
    { length: 30 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  );
  const injected = {
    selectedSiteIds: [...ids, ids[0], 'bad-id'],
    selectedFaceIds: ids,
    filters: { country: ' Nigeria ', search: 'x'.repeat(600), price: 'invented' },
    estimates: [{ amount: 1 }],
  };
  const context = buildPlannerContext(injected, window, '250000', 'NGN');
  assert.equal(context.selectedSiteIds!.length, 12);
  assert.equal(context.selectedFaceIds!.length, 24);
  assert.equal(context.filters!.country, 'Nigeria');
  assert.equal(context.filters!.search!.length, 160);
  assert.deepEqual(context.budget, { amount: 250000, currency: 'NGN' });
  assert.ok(
    !JSON.stringify(context).includes('estimates') && !JSON.stringify(context).includes('price'),
  );
  for (const budget of ['', 'NaN', '-1', '1000000000001'])
    assert.equal(buildPlannerContext(undefined, window, budget, 'NGN').budget, undefined);
  assert.equal(buildPlannerContext(undefined, window, '100', 'BAD').budget, undefined);
  assert.equal(
    buildPlannerContext({ filters: { country: 'x'.repeat(100) } }, window, '', 'NGN').filters!
      .country!.length,
    80,
  );
  assert.equal(
    buildPlannerContext({ filters: { format: 'invalid' } }, window, '', 'NGN').filters,
    undefined,
  );
});

test('general planning chat omits invalid or unsupported flights without inventing dates', () => {
  for (const invalid of [
    { startDate: '', endDate: window.endDate },
    { startDate: window.startDate, endDate: '' },
    { startDate: '2026-02-30', endDate: '2026-03-02' },
    { startDate: window.endDate, endDate: window.startDate },
    { startDate: window.startDate, endDate: window.startDate },
    { startDate: '2026-01-01', endDate: '2027-01-03' },
  ]) {
    const context = buildPlannerContext(undefined, invalid, '100', 'NGN');
    assert.equal(context.window, undefined);
    assert.deepEqual(context.budget, { amount: 100, currency: 'NGN' });
  }
  assert.deepEqual(
    buildPlannerContext(undefined, { startDate: '2028-01-01', endDate: '2029-01-01' }, '', 'NGN')
      .window,
    { startDate: '2028-01-01', endDate: '2029-01-01' },
  );
});

test('selected face currencies remain separate from the campaign currency and contain no prices', () => {
  const faceId = '00000000-0000-4000-8000-000000000001';
  const otherId = '00000000-0000-4000-8000-000000000002';
  const context = buildPlannerContext(
    {
      selectedFaceIds: [faceId],
      faceCurrencies: [
        { faceId, currency: 'GHS', amount: 5 },
        { faceId, currency: 'GHS' },
        { faceId, currency: 'BAD' },
        { faceId: otherId, currency: 'NGN' },
      ],
    } as Parameters<typeof buildPlannerContext>[0],
    window,
    '1000',
    'NGN',
  );
  assert.deepEqual(context.faceCurrencies, [{ faceId, currency: 'GHS' }]);
  assert.deepEqual(context.budget, { amount: 1000, currency: 'NGN' });
  assert.equal(JSON.stringify(context).includes('"amount":5'), false);
});

test('partial-selection state survives request construction without becoming a complete budget claim', () => {
  const context = buildPlannerContext({ selectionTruncated: true }, window, '1000', 'NGN');
  assert.equal(context.selectionTruncated, true);
  assert.equal(buildPlannerRequest({ ...defaults, context }).context!.selectionTruncated, true);
});

test('follow-up history preserves ordered displayed faces, reasons and clarification questions', () => {
  const recommendations = [1, 2].map((index) => ({
    siteId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    faceId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    reason: index === 1 ? 'Near the requested market.' : 'Better spacing for the corridor.',
  }));
  const reply = {
    recommendations,
    questions: ['Which face should we inspect first?'],
    facts: { hiddenPrice: 99999 },
    briefText: 'PRIVATE_EXTRACTED_TEXT',
  };
  const request = buildPlannerRequest({
    ...defaults,
    message: 'Tell me more about the second face',
    messages: [{ role: 'assistant', text: 'Compare these two faces.', reply }],
  });
  const content = request.history![0].content;
  const history = JSON.parse(content);
  assert.deepEqual(
    history.recommendations.map(
      (reference: { position: number; siteId: string; faceId: string; reason: string }) =>
        reference,
    ),
    recommendations.map((reference, index) => ({ position: index + 1, ...reference })),
  );
  assert.equal(history.recommendations[1].faceId, recommendations[1].faceId);
  assert.equal(history.recommendations[1].reason, recommendations[1].reason);
  assert.deepEqual(history.questions, reply.questions);
  assert.ok(
    !content.includes('hiddenPrice') &&
      !content.includes('99999') &&
      !content.includes('PRIVATE_EXTRACTED_TEXT'),
  );
  assert.equal(
    buildPlannerRequest({
      ...defaults,
      messages: [
        {
          role: 'assistant',
          text: 'Ordinary reply.',
          reply: { recommendations: [], questions: [] },
        },
      ],
    }).history![0].content,
    'Ordinary reply.',
  );
});

test('oversized structured replies remain complete bounded JSON without losing face order', () => {
  const recommendations = Array.from({ length: 12 }, (_, index) => ({
    siteId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    faceId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    reason: '"\\\n😀'.repeat(1000),
  }));
  const request = buildPlannerRequest({
    ...defaults,
    messages: [
      {
        role: 'assistant',
        text: '"\\\n😀'.repeat(1000),
        reply: {
          recommendations,
          questions: Array.from({ length: 5 }, () => '"\\\n😀'.repeat(500)),
        },
      },
    ],
  });
  const content = request.history![0].content;
  assert.ok(content.length <= 4000);
  const history = JSON.parse(content);
  assert.equal(history.recommendations.length, 12);
  assert.deepEqual(
    history.recommendations.map((reference: { faceId: string }) => reference.faceId),
    recommendations.map((reference) => reference.faceId),
  );
  assert.equal(history.questions.length, 5);
  assert.ok(
    history.recommendations.every((reference: { reason: string }) => reference.reason.length > 0),
  );
});

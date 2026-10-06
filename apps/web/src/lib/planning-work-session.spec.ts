import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parsePlanningWorkSession,
  planningDraftSignature,
  orderPlanningFaces,
} from './planning-work-session';

test('partial restoration retries preserve saved order and append new selections', () => {
  const original = ['missing-first', 'loaded-second'];
  const partial = [
    { faceId: 'loaded-second', source: 'fresh' },
    { faceId: 'missing-first', source: 'unresolved' },
  ];
  assert.deepEqual(
    orderPlanningFaces(partial, original).map((face) => face.faceId),
    original,
  );
  const restored = [
    { faceId: 'loaded-second', source: 'fresh' },
    { faceId: 'new-third', source: 'new' },
    { faceId: 'missing-first', source: 'retried' },
  ];
  assert.deepEqual(
    orderPlanningFaces(restored, original).map((face) => face.faceId),
    [...original, 'new-third'],
  );
  assert.equal(orderPlanningFaces(restored, original)[0].source, 'retried');
  assert.equal(restored[0].faceId, 'loaded-second');
});
const requestId = '00000000-0000-4000-8000-000000000001';
test('planning work identity keeps replay/revision metadata and allowlists stored control evidence', () => {
  const draft = {
    version: 1 as const,
    window: { startDate: '2026-10-10', endDate: '2026-10-24' },
    country: 'Nigeria',
    query: '',
    format: '',
    budget: '3 000 000,50',
    currency: 'NGN',
    faces: [],
  };
  const signature = planningDraftSignature(draft);
  const value = parsePlanningWorkSession(
    JSON.stringify({
      name: 'Personal plan',
      clientRequestId: requestId,
      recordId: requestId,
      revision: 2,
      savedSignature: signature,
      brief: 'Never retain',
      accessToken: 'Never retain',
    }),
  );
  assert.deepEqual(value, {
    name: 'Personal plan',
    clientRequestId: requestId,
    recordId: requestId,
    revision: 2,
    savedSignature: signature,
  });
  assert.equal(
    parsePlanningWorkSession(
      JSON.stringify({
        name: 'Plan',
        clientRequestId: requestId,
        recordId: requestId,
        revision: 0,
      }),
    ),
    null,
  );
  assert.equal(
    parsePlanningWorkSession(
      JSON.stringify({
        name: 'Plan',
        clientRequestId: requestId,
        savedSignature: '{"brief":"unknown"}',
      }),
    ),
    null,
  );
  assert.equal(
    parsePlanningWorkSession(JSON.stringify({ name: 'Plan', clientRequestId: 'invalid' })),
    null,
  );
});

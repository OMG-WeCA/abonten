import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AgencyDraft } from './agency-draft';
import {
  attentionDestination,
  hasRecoverableTabWork,
  planningAttention,
  planningDestination,
} from './agency-home';
import { planningDraftSignature, type PlanningWorkSession } from './planning-work-session';

const draft: AgencyDraft = {
  version: 1,
  window: { startDate: '2026-10-01', endDate: '2026-10-08' },
  country: 'Nigeria',
  query: '',
  format: '',
  budget: '3 000 000,50',
  currency: 'NGN',
  faces: [{ siteId: 'site-test', faceId: 'face-test' }],
};

test('attention uses precise saved controls without pretending current inventory facts were checked', () => {
  assert.deepEqual(planningAttention(draft, '2026-10-06'), []);
  assert.deepEqual(planningAttention({ ...draft, budget: '', faces: [] }, '2026-10-06'), [
    'budget',
    'selection',
  ]);
  assert.deepEqual(planningAttention({ ...draft, budget: '3,000' }, '2026-10-06'), ['budget']);
  assert.deepEqual(
    planningAttention({ ...draft, window: { startDate: '', endDate: '' } }, '2026-10-06'),
    ['flight'],
  );
  assert.deepEqual(planningAttention({ ...draft, budget: '0' }, '2026-10-06'), ['budget']);
});

test('exclusive end is outside the flight; an invalid date is never classified as expired', () => {
  assert.deepEqual(planningAttention(draft, '2026-10-08'), ['expired']);
  assert.deepEqual(planningAttention(draft, '2026-10-07'), []);
  assert.deepEqual(
    planningAttention(
      { ...draft, window: { startDate: '2026-02-30', endDate: '2026-03-03' } },
      '2026-10-06',
    ),
    ['flight'],
  );
  assert.deepEqual(planningAttention(draft, 'invalid'), []);
});

test('home actions enter the precise planner journey without silently replacing a tab draft', () => {
  assert.equal(planningDestination(), '/planner/');
  assert.equal(planningDestination({ newPlan: true }), '/planner/?new=1');
  assert.equal(planningDestination({ view: 'inventory' }), '/planner/?view=inventory');
  assert.equal(
    planningDestination({ draftId: 'draft-test', view: 'compare' }),
    '/planner/?draft=draft-test&view=compare',
  );
  assert.equal(
    attentionDestination('budget', 'draft-test'),
    '/planner/?draft=draft-test&focus=budget',
  );
  assert.equal(
    attentionDestination('expired', 'draft-test'),
    '/planner/?draft=draft-test&focus=flight',
  );
  assert.equal(attentionDestination('selection'), '/planner/?view=inventory');
});

test('tab recovery preserves date-only, market-only and ambiguous-save work while hiding known unchanged snapshots', () => {
  const baseline: PlanningWorkSession = {
    name: '',
    clientRequestId: '00000000-0000-4000-8000-000000000001',
    initialSignature: planningDraftSignature(draft),
  };
  assert.equal(hasRecoverableTabWork(draft, baseline), false);
  assert.equal(
    hasRecoverableTabWork(draft, { ...baseline, savedSignature: planningDraftSignature(draft) }),
    false,
  );
  assert.equal(
    hasRecoverableTabWork(
      { ...draft, window: { startDate: '2026-11-01', endDate: '2026-11-08' } },
      baseline,
    ),
    true,
  );
  assert.equal(hasRecoverableTabWork({ ...draft, country: 'Ghana' }, baseline), true);
  assert.equal(
    hasRecoverableTabWork(draft, {
      ...baseline,
      pendingCreate: { name: 'Synthetic pending plan', draft },
    }),
    true,
  );
  assert.equal(hasRecoverableTabWork(draft, null), true);
  assert.equal(hasRecoverableTabWork(null, baseline), false);
});

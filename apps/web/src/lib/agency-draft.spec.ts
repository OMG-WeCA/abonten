import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearSession } from './api';
import { estimateFaceCost, summarizeBudget } from './agency-planning';
import {
  clearAgencyDrafts,
  draftFaceEligibility,
  loadAgencyDraft,
  parseAgencyDraft,
  saveAgencyDraft,
  type AgencyDraft,
} from './agency-draft';
import { summarizeDraftBudget } from './agency-draft';
import type { SiteFace } from './sites-api';

const window = { startDate: '2026-10-01', endDate: '2026-10-08' };
const site = { id: 'site-1', status: 'listed' as const, format: 'static', rateCards: [] };
const face: SiteFace = {
  id: 'face-1',
  siteId: site.id,
  faceLabel: 'A',
  bookable: true,
  width: 10,
  height: 4,
  area: 40,
  units: 'm',
};
const draft: AgencyDraft = {
  version: 1,
  window,
  country: 'Nigeria',
  query: 'Ikeja',
  format: 'static',
  budget: '1000000',
  currency: 'NGN',
  faces: [{ siteId: site.id, faceId: face.id }],
};

test('interest survives absent pricing/calendar facts without confirming budget fit', () => {
  for (const cards of [
    [],
    [
      {
        id: 'monthly',
        siteId: site.id,
        currency: 'NGN',
        rates: { perMonth: 1000 },
        effectiveFrom: '2026-01-01',
      },
    ],
  ]) {
    const inventory = { ...site, rateCards: cards };
    assert.equal(
      draftFaceEligibility(inventory, face, window, { status: 'unknown' }).eligible,
      true,
    );
    const estimate = estimateFaceCost(inventory, face, window, 'NGN', { status: 'unknown' });
    assert.equal(estimate.status, 'unavailable');
    const summary = summarizeBudget([estimate], { amount: 1e6, currency: 'NGN' });
    assert.equal(summary.fit, 'unknown');
    assert.equal(summary.remaining, null);
    assert.deepEqual(summary.totals, {});
  }
});
test('draft interest never bypasses physical eligibility or a current unavailable calendar', () => {
  const knownUnavailable = { status: 'unavailable' as const, window };
  assert.equal(draftFaceEligibility(site, face, window, knownUnavailable).eligible, false);
  // An obsolete availability result cannot claim anything about a revised flight.
  assert.equal(
    draftFaceEligibility(site, face, { ...window, endDate: '2026-10-09' }, knownUnavailable)
      .eligible,
    true,
  );
  for (const [inventory, selected] of [
    [{ ...site, permitExpiresAt: '2026-10-05' }, face],
    [{ ...site, status: 'suspended' as const }, face],
    [{ ...site, format: 'digital_led' }, face],
    [site, { ...face, bookable: false }],
    [site, { ...face, siteId: 'another-site' }],
  ] as const)
    assert.equal(
      draftFaceEligibility(inventory, selected, window, { status: 'unknown' }).eligible,
      false,
    );
  assert.equal(
    draftFaceEligibility(
      site,
      face,
      { ...window, endDate: window.startDate },
      { status: 'unknown' },
    ).eligible,
    false,
  );
});
test('partial restoration retains known subtotal without confirming the full draft budget', () => {
  const available = { status: 'available' as const, window, checkedAt: '2026-10-01T00:00:00Z' };
  const estimate = estimateFaceCost(
    {
      ...site,
      rateCards: [
        {
          id: 'daily',
          siteId: site.id,
          currency: 'NGN',
          rates: { perDay: 100 },
          effectiveFrom: '2026-01-01',
        },
      ],
    },
    face,
    window,
    'NGN',
    available,
  );
  const budget = { amount: 1000, currency: 'NGN' };
  assert.equal(summarizeDraftBudget([estimate], [], budget).fit, 'within');
  const partial = summarizeDraftBudget(
    [estimate],
    [{ siteId: 'other', faceId: 'unloaded-face' }],
    budget,
  );
  assert.deepEqual(partial.totals, { NGN: 700 });
  assert.equal(partial.selectedCount, 2);
  assert.equal(partial.unpricedCount, 1);
  assert.equal(partial.fit, 'unknown');
  assert.equal(partial.remaining, null);
});
test('untrusted persisted drafts retain only bounded controls and identifiers', () => {
  const unsafe = {
    ...draft,
    token: 'secret',
    brief: 'private brief',
    consent: true,
    messages: ['private model answer'],
    fullInventory: site,
    window: { ...window, privateUrl: 'https://private.example' },
    faces: [{ ...draft.faces[0], site, auth: 'secret', pricingCurrency: 'NGN' }, draft.faces[0]],
  };
  const parsed = parseAgencyDraft(JSON.stringify(unsafe));
  assert.deepEqual(parsed, { ...draft, faces: [{ ...draft.faces[0], pricingCurrency: 'NGN' }] });
  for (const bad of [
    null,
    'invalid',
    JSON.stringify({ ...draft, version: 2 }),
    JSON.stringify({ ...draft, query: 'x'.repeat(201) }),
    JSON.stringify({ ...draft, faces: Array(101).fill(draft.faces[0]) }),
    JSON.stringify({ ...draft, currency: 'BITCOIN' }),
    JSON.stringify({ ...draft, faces: [{ siteId: '../private', faceId: 'face-1' }] }),
    JSON.stringify({ ...draft, window: { ...window, endDate: '2026-02-30' } }),
  ])
    assert.equal(parseAgencyDraft(bad), null);
});
test('same-tab drafts isolate user and organization and authentication clearing preserves other storage', () => {
  const data = new Map<string, string>();
  const storage = {
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    data.set('unrelated.settings', 'keep');
    assert.equal(saveAgencyDraft('user-1', 'org-1', draft), true);
    assert.deepEqual(loadAgencyDraft('user-1', 'org-1'), draft);
    assert.equal(loadAgencyDraft('user-2', 'org-1'), null);
    assert.equal(loadAgencyDraft('user-1', 'org-2'), null);
    clearSession();
    assert.equal(loadAgencyDraft('user-1', 'org-1'), null);
    assert.equal(data.get('unrelated.settings'), 'keep');
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('Storage is disabled');
      },
    });
    assert.equal(loadAgencyDraft('user-1', 'org-1'), null);
    assert.equal(saveAgencyDraft('user-1', 'org-1', draft), false);
    assert.doesNotThrow(clearAgencyDrafts);
  } finally {
    Reflect.deleteProperty(globalThis, 'sessionStorage');
    Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('local brief provenance survives reload without persisting content or consent', () => {
  const parsed = parseAgencyDraft(
    JSON.stringify({
      ...draft,
      briefDerivedContext: true,
      briefText: 'private document',
      briefConsentText: 'private document',
    }),
  );
  assert.equal(parsed?.briefDerivedContext, true);
  assert.equal(JSON.stringify(parsed).includes('private document'), false);
  assert.equal(
    parseAgencyDraft(JSON.stringify({ ...draft, briefDerivedContext: 'true' }))
      ?.briefDerivedContext,
    undefined,
  );
});
test('research references can be retained as interest without confirming availability or price', () => {
  const researched = { ...site, format: 'digital_led', isResearchReference: true };
  const reference = { ...face, bookable: false };
  assert.equal(
    draftFaceEligibility(researched, reference, window, { status: 'unknown' }).eligible,
    true,
  );
  assert.equal(
    estimateFaceCost(researched, reference, window, 'NGN', { status: 'unknown' }).status,
    'unavailable',
  );
});

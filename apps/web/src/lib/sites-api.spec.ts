import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, test } from 'node:test';
import { assetFileUrl, siteThumbUrl, type SiteSummary } from './sites-api';
import { sitesCopy } from './sites-locale';

beforeEach(() => {
  process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.example.com/';
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_API_BASE_URL;
});

const site: SiteSummary = {
  id: '11111111-1111-1111-1111-111111111111',
  organizationId: '22222222-2222-2222-2222-222222222222',
  code: 'TEST-001',
  name: 'Test Site',
  type: 'billboard',
  format: 'static',
  latitude: 6.6,
  longitude: 3.35,
  country: 'Nigeria',
  illuminationType: 'none',
  status: 'draft',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

test('assetFileUrl builds the streaming endpoint URL without a trailing double slash', () => {
  const url = assetFileUrl({ siteId: site.id, id: '33333333-3333-3333-3333-333333333333' });
  assert.equal(url, 'https://api.example.com/api/inventory/sites/11111111-1111-1111-1111-111111111111/assets/33333333-3333-3333-3333-333333333333/file');
});

test('siteThumbUrl is empty without a front photo and points at /file when present', () => {
  assert.deepEqual(siteThumbUrl({ id: site.id, frontAssetId: null }), { plain: null, authUrl: null });
  const url = siteThumbUrl({ id: site.id, frontAssetId: '44444444-4444-4444-4444-444444444444' });
  assert.equal(url.plain, null);
  assert.ok(url.authUrl!.endsWith('/assets/44444444-4444-4444-4444-444444444444/file'));
  // Seeded placeholder refs are external URLs and render directly.
  assert.deepEqual(
    siteThumbUrl({ id: site.id, frontAssetRef: 'https://picsum.photos/seed/x/800/600' }),
    { plain: 'https://picsum.photos/seed/x/800/600', authUrl: null },
  );
});

test('en and fr copy stay structurally in sync', () => {
  const en = sitesCopy.en;
  const fr = sitesCopy.fr;
  for (const section of Object.keys(en) as Array<keyof typeof en>) {
    assert.deepEqual(Object.keys(en[section]), Object.keys(fr[section]), `section ${section}`);
  }
});

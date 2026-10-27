import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { missingSiteMedia } from './site-media';
import type { SiteAsset } from './sites-api';
const photos = [
  { kind: 'wide', mediaType: 'image', capturedAt: '2026-10-20' },
  { kind: 'close_up', mediaType: 'image', capturedAt: '2026-10-20' },
] as SiteAsset[];
test('both dated views and either walkthrough are required', () => {
  assert.equal(missingSiteMedia([]).length, 3);
  assert.equal(missingSiteMedia(photos).length, 1);
  assert.deepEqual(
    missingSiteMedia([
      ...photos,
      { kind: 'site_video', mediaType: 'video', durationSeconds: 30 } as SiteAsset,
    ]),
    [],
  );
  assert.deepEqual(
    missingSiteMedia([
      ...photos,
      { kind: 'panorama', mediaType: 'image', width: 2048, height: 1024 } as SiteAsset,
    ]),
    [],
  );
});
test('legacy photos and malformed alternatives cannot satisfy capture requirements', () => {
  assert.equal(
    missingSiteMedia([{ kind: 'front', capturedAt: '2026-10-20' } as SiteAsset]).length,
    3,
  );
  assert.equal(
    missingSiteMedia([
      ...photos,
      { kind: 'panorama', mediaType: 'image', width: 1600, height: 900 } as SiteAsset,
    ]).length,
    1,
  );
  assert.equal(
    missingSiteMedia([
      ...photos,
      { kind: 'site_video', mediaType: 'video', durationSeconds: 61 } as SiteAsset,
    ]).length,
    1,
  );
  assert.match(missingSiteMedia([], 'fr')[0]!, /vue large/);
});

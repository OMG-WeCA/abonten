import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { siteMediaProblems, type RequiredSiteMedia } from './site-media-requirements';
const photos: RequiredSiteMedia[] = ['wide', 'close_up'].map((kind) => ({
  kind,
  mediaType: 'image',
  capturedAt: '2026-10-20',
}));
const panorama: RequiredSiteMedia = {
  kind: 'panorama',
  mediaType: 'image',
  width: 2000,
  height: 1000,
};
const video: RequiredSiteMedia = { kind: 'site_video', mediaType: 'video', durationSeconds: 20 };
for (const walkthrough of [panorama, video])
  test(`requires both framing views alongside ${walkthrough.kind}`, () => {
    assert.deepEqual(siteMediaProblems([...photos, walkthrough]), []);
    assert.match(siteMediaProblems([photos[0], walkthrough]).join(';'), /close-up/);
    assert.match(siteMediaProblems([photos[1], walkthrough]).join(';'), /wide/);
    assert.match(siteMediaProblems(photos).join(';'), /video or full 360/);
    assert.equal(
      siteMediaProblems([...photos.map((p) => ({ ...p, capturedAt: null })), walkthrough]).length,
      2,
    );
  });
test('legacy media is not silently reclassified and old board recordings are not site-context videos', () => {
  assert.equal(
    siteMediaProblems([
      { kind: 'front', capturedAt: '2026-10-20' },
      { kind: 'context', capturedAt: '2026-10-20' },
      { ...video, kind: 'board_video' },
    ]).length,
    3,
  );
  assert.deepEqual(siteMediaProblems([{ kind: 'front', capturedAt: '2026-10-20' }], 1), []);
});
test('alternative evidence may be removed only while the other compatible alternative remains', () => {
  assert.deepEqual(siteMediaProblems([...photos, panorama, video]), []);
  assert.deepEqual(siteMediaProblems([...photos, video]), []);
  assert.deepEqual(siteMediaProblems([...photos, panorama]), []);
  for (const broken of [
    { ...panorama, width: 1300 },
    { ...panorama, mediaType: 'video' },
    { ...video, durationSeconds: 0 },
    { ...video, durationSeconds: 61 },
    { ...video, mediaType: 'image' },
  ])
    assert.equal(siteMediaProblems([...photos, broken]).length, 1);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { screenPixelError } from '../components/sites/ScreenResolutionFields';
import { screenResolution } from './screen-resolution';
test('screen resolution shows explicit pixel units and never infers missing dimensions', () => {
  assert.equal(screenResolution({ pixelWidth: 1920, pixelHeight: 1080 }), '1,920 × 1,080 px');
  assert.equal(screenResolution({ pixelWidth: 1920 }), '1,920 × — px');
  assert.equal(screenResolution(undefined), 'Not recorded');
  assert.equal(screenResolution({ pixelWidth: 0, pixelHeight: -1 }, 'fr'), 'Non renseignée');
  assert.equal(screenResolution({ pixelWidth: 1.5, pixelHeight: 720 }), '— × 720 px');
});


test('main-form pixels accept optional drafts and positive integers only', async () => {
  for (const value of ['', ' ', '1', '1920', '2147483647']) assert.equal(screenPixelError(value), undefined);
  for (const value of ['0', '-1', '1.5', '1080,5', '1e3', 'Infinity', '2147483648']) assert.ok(screenPixelError(value), value);
  assert.match(screenPixelError('-1', 'fr')!, /entier positif/);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { screenResolution } from './screen-resolution';
test('screen resolution shows explicit pixel units and never infers missing dimensions', () => {
  assert.equal(screenResolution({ pixelWidth: 1920, pixelHeight: 1080 }), '1,920 × 1,080 px');
  assert.equal(screenResolution({ pixelWidth: 1920 }), '1,920 × — px');
  assert.equal(screenResolution(undefined), 'Not recorded');
  assert.equal(screenResolution({ pixelWidth: 0, pixelHeight: -1 }, 'fr'), 'Non renseignée');
  assert.equal(screenResolution({ pixelWidth: 1.5, pixelHeight: 720 }), '— × 720 px');
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { displayDateOnly, displayNumber, displayUtcTimestamp } from './locale-format';

test('French decimal display and English display use locale separators without changing values', () => {
  assert.equal(displayNumber(18.83, 'fr', { maximumFractionDigits: 2 }), '18,83');
  assert.equal(displayNumber(18.83, 'en', { maximumFractionDigits: 2 }), '18.83');
  assert.equal(displayNumber(0, 'fr'), '0');
  assert.equal(displayNumber(-1.2, 'fr'), '-1,2');
  assert.equal(displayNumber(6.188138, 'fr'), '6,188138');
});
test('calendar-only dates format by locale with no invented time and invalid days remain literal', () => {
  assert.equal(displayDateOnly('2026-10-05', 'fr'), '05 oct. 2026');
  assert.equal(displayDateOnly('2026-10-05T23:59:00-11:00', 'en'), '05 Oct 2026');
  assert.equal(displayDateOnly('2026-02-30', 'fr'), '2026-02-30');
  assert.equal(displayDateOnly('source date unknown', 'fr'), 'source date unknown');
});
test('UTC timestamp display converts only explicit offset instants and retains unknown EXIF time', () => {
  assert.match(
    displayUtcTimestamp('2026-10-05T23:15:00-02:00', 'fr'),
    /^06 oct\. 2026.*01:15:00 UTC$/,
  );
  assert.equal(displayUtcTimestamp('2026:10:05 09:00:00', 'fr'), '2026:10:05 09:00:00');
  assert.equal(displayUtcTimestamp('2026-10-05T09:00:00', 'fr'), '2026-10-05T09:00:00');
  assert.equal(displayUtcTimestamp('2026-10-05', 'fr'), '05 oct. 2026');
  assert.equal(displayUtcTimestamp('2026-02-30T09:00:00Z', 'fr'), '2026-02-30T09:00:00Z');
});

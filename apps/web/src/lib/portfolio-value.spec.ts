import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentMonthlyRates } from './portfolio-value';
import type { RateCard } from './sites-api';
const now = Date.parse('2026-09-15T00:00:00Z');
const card = (patch: Partial<RateCard> = {}): RateCard => ({ id: 'a', siteId: 'site', currency: 'GHS', rates: { perMonth: 1000 }, effectiveFrom: '2026-01-01', ...patch });
test('monthly potential keeps currencies separate and only the newest current price per currency', () => {
  assert.deepEqual(currentMonthlyRates([card(), card({id:'b', effectiveFrom:'2026-02-01',rates:{perMonth:1500}}), card({currency:'NGN',rates:{perMonth:90000}})], now), {GHS:1500,NGN:90000});
});
test('ignores expired, future, invalid-date and face-level cards', () => {
  assert.deepEqual(currentMonthlyRates([card({effectiveTo:'2026-09-15'}),card({effectiveFrom:'2027-01-01'}),card({effectiveFrom:'bad'}),card({effectiveTo:'bad'}),card({faceId:'face'})], now), {});
});
test('never extrapolates daily or weekly rates, uses expired prices, or treats missing prices as zero', () => {
  assert.deepEqual(currentMonthlyRates([card(),card({id:'b',effectiveFrom:'2026-02-01',rates:{perDay:100,perWeek:600}})],now),{});
});
test('rejects unsupported currencies and non-positive or non-finite money', () => {
  for (const amount of [0,-1,NaN,Infinity]) assert.deepEqual(currentMonthlyRates([card({rates:{perMonth:amount}})],now),{});
  assert.deepEqual(currentMonthlyRates([card({currency:'INVALID'})],now),{});
});
test('empty rate list has no priced currencies', () => assert.deepEqual(currentMonthlyRates([], now), {}));

import { selectMonthlyQuote, convertPortfolio } from './portfolio-value';
test('one site is counted once, preferring partner currency over newer alternative quote', () => {
  assert.deepEqual(selectMonthlyQuote([card(), card({id:'b',currency:'USD',rates:{perMonth:200},effectiveFrom:'2026-03-01'})], 'GHS', now), {currency:'GHS',amount:1000});
  assert.deepEqual(selectMonthlyQuote([card(), card({id:'b',currency:'USD',rates:{perMonth:200},effectiveFrom:'2026-03-01'})], 'EUR', now), {currency:'USD',amount:200});
});
test('cross-currency totals use USD-relative ratios without converting local rates twice', () => {
  assert.equal(convertPortfolio({GHS:100,NGN:2000,USD:2},'GHS',{GHS:10,NGN:1000,USD:1}),140);
  assert.equal(convertPortfolio({GHS:100},'GHS',{}),100);
  assert.throws(()=>convertPortfolio({NGN:100},'GHS',{GHS:10}));
  assert.throws(()=>convertPortfolio({NGN:100},'GHS',{GHS:10,NGN:0}));
});

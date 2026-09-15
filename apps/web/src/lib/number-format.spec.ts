import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { formatMoney, parseAmount, parseDecimal } from './number-format';

test('parseDecimal accepts point and comma decimals in both locales', () => {
  assert.equal(parseDecimal('5.5597'), 5.5597);
  assert.equal(parseDecimal('5,5597'), 5.5597);
  assert.equal(parseDecimal('-0,2179'), -0.2179);
  assert.equal(parseDecimal('12,5'), 12.5);
  assert.equal(parseDecimal('12.5'), 12.5);
  assert.equal(parseDecimal(' 6,6058 '), 6.6058);
  assert.equal(parseDecimal('3'), 3);
  assert.equal(parseDecimal('0.5'), 0.5);
  assert.equal(parseDecimal('.5'), 0.5);
});

test('parseDecimal rejects ambiguous or non-numeric input', () => {
  assert.equal(parseDecimal('1.234,5'), null); // mixed separators
  assert.equal(parseDecimal('1,234.5'), null);
  assert.equal(parseDecimal('3 m'), null);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal('1,2,3'), null);
  assert.equal(parseDecimal('1..5'), null);
});

test('parseAmount treats spaces as grouping and 1-2 digit commas as decimals', () => {
  assert.equal(parseAmount('250 000'), 250000);
  assert.equal(parseAmount('1 234,50'), 1234.5);
  assert.equal(parseAmount('12,50'), 12.5);
  assert.equal(parseAmount('12.50'), 12.5);
  assert.equal(parseAmount('6000'), 6000);
  assert.equal(parseAmount('1\u00A0234'), 1234); // NBSP grouping (French keyboards)
});

test('parseAmount rejects ambiguous magnitudes instead of corrupting them', () => {
  assert.equal(parseAmount('6,000'), null); // must not become 6000
  assert.equal(parseAmount('6.000'), null);
  assert.equal(parseAmount('1,234.56'), null);
  assert.equal(parseAmount('1.234,56'), null);
  assert.equal(parseAmount('-500'), null); // negative amounts are invalid
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount('1,2345'), null); // >2 decimals after comma is not money input
});

test('formatMoney is locale-aware', () => {
  assert.match(formatMoney(2500000, 'NGN', 'en'), /2,500,000/);
  assert.match(formatMoney(2500000, 'NGN', 'fr'), /2\s?500\s?000/);
  assert.ok(formatMoney(15, 'GHS', 'en').includes('GHS'));
});
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractConstraints } from './brief-constraints';

test('EN and FR grouped money tokens preserve their complete amount', () => {
  for (const [token, expected] of [
    ['20000', 20000],
    ['20,000', 20000],
    ['20.000', 20000],
    ['20 000', 20000],
    ['20\u00a0000', 20000],
    ['20\u202f000', 20000],
    ['3,000,000', 3000000],
    ['3.000.000', 3000000],
    ['3 000 000', 3000000],
    ['1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['1 234,50', 1234.5],
    ['1\u202f234,50', 1234.5],
    ['1234.50', 1234.5],
    ['1234,50', 1234.5],
    ['0,50', 0.5],
    ['0.50', 0.5],
  ] as const) {
    const result = extractConstraints(`Budget: EUR ${token}`);
    assert.equal(result.budget, expected, token);
    assert.equal(result.currency, 'EUR', token);
    assert.equal(result.evidence[0], `Budget: EUR ${token}`, token);
  }
});

test('EN and FR decimal magnitude suffixes have exact multipliers', () => {
  for (const [token, expected] of [
    ['1,5 million', 1500000],
    ['1.5 million', 1500000],
    ['1,25 millions', 1250000],
    ['1.25m', 1250000],
    ['0,5M', 500000],
    ['20 million', 20000000],
    ['1,5 milliard', 1500000000],
    ['1.5 billion', 1500000000],
    ['2 milliards', 2000000000],
    ['1,5 thousand', 1500],
    ['2K', 2000],
  ] as const)
    assert.equal(extractConstraints(`Budget: EUR ${token}`).budget, expected, token);
});

test('a single sentence full stop preserves a complete valid budget before prose or EOF', () => {
  const brief = extractConstraints('Budget: NGN 3,000,000. Flight: Lagos campaign.');
  assert.equal(brief.budget, 3000000);
  assert.equal(brief.currency, 'NGN');
  assert.equal(brief.evidence[0], 'Budget: NGN 3,000,000');
  for (const [token, amount] of [
    ['20000', 20000],
    ['1', 1],
    ['20,000', 20000],
    ['20.000', 20000],
    ['3.000.000', 3000000],
    ['1,234.50', 1234.5],
    ['1.234,50', 1234.5],
    ['1234.50', 1234.5],
    ['1\u202f234,50', 1234.5],
  ] as const) {
    assert.equal(extractConstraints(`Budget: EUR ${token}.`).budget, amount, token);
    assert.equal(
      extractConstraints(`Budget: EUR ${token}. Flight: next month`).budget,
      amount,
      token,
    );
  }
  assert.equal(extractConstraints('Budget: EUR 20,000. million more options').budget, 20000);
  assert.equal(extractConstraints('Budget: EUR 20,000. km from the city').budget, 20000);
  for (const token of ['20,00,000.', '1,234,50.', '20, 000.', '20..', '1.000..', '20.billion'])
    assert.equal(extractConstraints(`Budget: EUR ${token}`).budget, null, token);
});

test('suffix amounts cannot be prefixes of ranges, arithmetic or numeric lists', () => {
  for (const token of [
    '20m-30m',
    '20m - 30m',
    '1,5 million – 2 millions',
    '20million / 2',
    '20m+2m',
    '20m + 2m',
    '20m−2m',
    '20m — 30m',
    '20m * 2',
    '20m×2',
    '20m ÷ 2',
    '20m = 2m',
    '20m < 30m',
    '20m > 10m',
    '20m ≥ 10m',
    '20m ≤ 30m',
    '20m ≠ 30m',
    '20m ⁄ 2',
    '20m ∕ 2',
    '20m ± 2m',
    '20m % 2',
    '20m ^ 2',
    '20m & 2m',
    '20m | 2m',
    '20m ~ 30m',
    '20m, 30m',
    '20m; 30m',
    '20m (30m)',
    '20m [EUR 30m]',
    '20m {30m}',
    '20m: EUR 30m',
    '20m.30m',
    '20m. / 2',
    '20m.. Flight: next month',
    '20m to 30m',
    '20m or EUR 30m',
    '1,5 million à 2 millions',
    '20m and 30m',
    '20m et 30m',
    '20m ou 30m',
    '20m 30m',
  ]) {
    const result = extractConstraints(`Budget: EUR ${token}`);
    assert.equal(result.budget, null, token);
    assert.equal(result.currency, null, token);
    assert.deepEqual(result.evidence, [], token);
  }
  for (const text of [
    'Budget: NGN 20m. Flight: Lagos campaign.',
    'Budget: EUR 1,5 million. Flight: next month.',
    'Budget: EUR 20 million, for Lagos.',
    'Budget: EUR 20 million; Flight: next month.',
    'Budget: EUR 20 million (including installation).',
  ])
    assert.notEqual(extractConstraints(text).budget, null, text);
});

test('compact French monetary ranges stay ambiguous without spacing before currency symbols', () => {
  for (const token of [
    '20 million à€30 million',
    '20m à$30m',
    '20m à₦30m',
    '20 million à30 million',
    '1,5 million à\u202f€2 millions',
    '20m or€30m',
  ]) {
    const result = extractConstraints(`Budget: EUR ${token}`);
    assert.equal(result.budget, null, token);
    assert.equal(result.currency, null, token);
  }
  for (const [text, expected] of [
    ['Budget est EUR 1,5 million pour Accra', 1500000],
    ['Allocation de EUR 20\u202f000,50. Accra', 20000.5],
    ['Budget: EUR 20 million à Accra', 20000000],
  ] as const)
    assert.equal(extractConstraints(text).budget, expected, text);
});

test('ISO date suggestions require complete tokens and preserve valid date punctuation', () => {
  for (const token of [
    '2026-10-100',
    '2026-10-10junk',
    '2026-10-10_foo',
    '2026-10-10é',
    '2026-10-10T12:00:00Z',
    '2026-02-30',
  ]) {
    const start = extractConstraints(`Start: ${token} End: 2026-10-24`);
    assert.equal(start.startDate, null, token);
    assert.equal(start.endDate, '2026-10-24', token);
    assert.ok(!start.evidence.some((item) => item.startsWith('Start:')), token);
    const end = extractConstraints(`Start: 2026-10-10 End: ${token}`);
    assert.equal(end.startDate, '2026-10-10', token);
    assert.equal(end.endDate, null, token);
  }
  assert.equal(extractConstraints('Restart: 2026-10-10').startDate, null);
  assert.equal(extractConstraints('weekend: 2026-10-24').endDate, null);
  assert.equal(extractConstraints('Start: 2026-10-10. End: 2026-10-24.').startDate, '2026-10-10');
  assert.equal(
    extractConstraints('Start date = 2026-10-10; END DATE: 2026-10-24').endDate,
    '2026-10-24',
  );
  assert.equal(extractConstraints('Start: 2026-10-10 Start: 2026-10-11').startDate, null);
});

test('malformed groups and mixed separators never become a valid leading substring', () => {
  for (const token of [
    '20, 000',
    '20. 000',
    '20 00',
    '20 000 00',
    '1,23,456',
    '1.23.456',
    '1,234,50',
    '1.234.50',
    '1,23.45',
    '1.23,45',
    '1,234.567',
    '1.234,567',
    '1,,000',
    '1..000',
    '1,.000',
    '1.,000',
    '1,234 567',
    '1 234,567',
    '1\t000',
    "1'000",
    '1’000',
    '1,',
    '1,000,',
    '1,2345',
  ]) {
    const result = extractConstraints(`Budget: EUR ${token}`);
    assert.equal(result.budget, null, token);
    assert.equal(result.currency, null, token);
    assert.deepEqual(result.evidence, [], token);
  }
});

test('ambiguous fraction versus grouping with a magnitude suffix requires confirmation', () => {
  for (const token of ['1,234 million', '1.234 million', '20,000m', '20.000m'])
    assert.equal(extractConstraints(`Budget: EUR ${token}`).budget, null, token);
});

test('signs, ranges, scientific notation and unsupported units are rejected in full', () => {
  for (const token of [
    '-100',
    '+100',
    '0',
    '1e6',
    '1 e6',
    '20-30',
    '20 – 30',
    '20—30',
    '20−30',
    '20/000',
    '20_000',
    '20%',
    '20 million%',
    '20mUSD',
    '20millionaire',
    '20 trillion',
    '20bn',
    '20 mn',
    '20 crore',
    '20 lakh',
    '20 hundred',
    '20 USD',
    '20 million USD',
    '20 km',
    '20 bananas',
    '20 milion',
    '20 million million',
    '20 million 2',
    '1000000000001',
    '2 trillion',
  ])
    assert.equal(extractConstraints(`Budget: EUR ${token}`).budget, null, token);
});

test('multiple candidates never silently select a valid amount over an invalid one', () => {
  for (const text of [
    'Budget: EUR 20 000\nBudget: EUR 30 000',
    'Budget: EUR 20, 000\nAllocation: EUR 30,000',
    'Budget: EUR 20 000\nBudget: EUR -100',
    'Budget: EUR 20 000\nSpend: USD 10000',
    'Budget: EUR 20 000\nBudget: EUR unknown',
  ]) {
    const result = extractConstraints(text);
    assert.equal(result.budget, null, text);
    assert.equal(result.currency, null, text);
  }
});

test('literal currency and label boundaries do not infer unsupported currencies', () => {
  for (const currency of ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'])
    assert.equal(extractConstraints(`Budget: ${currency} 20000`).currency, currency);
  assert.equal(extractConstraints('Budget: ₦20,000').currency, 'NGN');
  assert.equal(extractConstraints('Budget: €20 000').currency, 'EUR');
  assert.equal(extractConstraints('Budget: $20,000').budget, 20000);
  assert.equal(extractConstraints('Budget: $20,000').currency, null);
  assert.equal(extractConstraints('Budget: USD20,000').budget, 20000);
  assert.equal(extractConstraints('budget est eur 1,5 million').budget, 1500000);
  assert.equal(extractConstraints('allocation de EUR 20\u202f000').budget, 20000);
  for (const text of [
    'Budget: AUD 20000',
    'Budget: CHF 20000',
    'Budget: EURX 20000',
    'xBudget: EUR 20000',
    'Budgetary: EUR 20000',
    'annualbudget: EUR 20000',
  ])
    assert.equal(extractConstraints(text).budget, null, text);
});

test('ordinary following prose and independent date/city suggestions remain intact', () => {
  assert.equal(extractConstraints('Budget: NGN 20,000\nLagos').budget, 20000);
  assert.equal(extractConstraints('Budget: NGN 20,000\tLagos').budget, 20000);
  assert.equal(extractConstraints('Budget: NGN 20 million Lagos').budget, 20000000);
  const result = extractConstraints(
    'Budget: EUR 20\u202f000 for Lagos\nStart date: 2026-10-10\nEnd: 2026-11-10',
  );
  assert.equal(result.budget, 20000);
  assert.equal(result.currency, 'EUR');
  assert.deepEqual(result.cities, ['Lagos']);
  assert.equal(result.startDate, '2026-10-10');
  assert.equal(result.endDate, '2026-11-10');
  assert.equal(result.evidence[0], 'Budget: EUR 20\u202f000');
});

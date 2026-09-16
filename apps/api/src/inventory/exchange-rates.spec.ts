import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ExchangeRatesController, validateExchangeSnapshot } from './exchange-rates.controller';
const now = Date.now();
const valid = { result:'success', base_code:'USD', time_last_update_unix:Math.floor(now / 1000), rates:{USD:1,EUR:.9,GHS:10,NGN:1000,XAF:600,XOF:600} };
test('validates complete fresh exchange snapshots and preserves provider date', () => {
  const result = validateExchangeSnapshot(valid, now);
  assert.equal(result.source, 'ExchangeRate-API');
  assert.equal(result.rates.GHS, 10);
  assert.equal(Date.parse(result.asOf), valid.time_last_update_unix * 1000);
});
test('rejects stale, future, incomplete, malformed or non-positive exchange quotes', () => {
  for (const data of [null, {}, {...valid,result:'error'}, {...valid,base_code:'EUR'}, {...valid,time_last_update_unix:now/1000-49*3600}, {...valid,time_last_update_unix:now/1000+3600}, {...valid,rates:{...valid.rates,NGN:0}}, {...valid,rates:{...valid.rates,USD:2}}]) assert.throws(()=>validateExchangeSnapshot(data,now));
});
test('caches and coalesces provider requests; failures remain retryable', async () => {
  const original = global.fetch;
  let calls=0;
  try {
    global.fetch = async () => { calls++; return new Response(JSON.stringify(valid),{status:200}); };
    const controller = new ExchangeRatesController();
    await Promise.all([controller.get(),controller.get()]); await controller.get();
    assert.equal(calls,1);
    global.fetch = async () => { throw new Error('offline'); };
    const failed = new ExchangeRatesController();
    await assert.rejects(failed.get(), /temporarily unavailable/);
    global.fetch = async () => new Response(JSON.stringify(valid),{status:200});
    assert.equal((await failed.get()).rates.USD,1);
  } finally { global.fetch = original; }
});

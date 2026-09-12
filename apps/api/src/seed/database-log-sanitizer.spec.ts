import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { describeDatabaseEndpoint, sanitizeDatabaseError } from './database-log-sanitizer';

describe('seed database log sanitization', () => {
  it('describes only host, port, and database name', () => {
    const url =
      'postgresql://seed-user:p%40ss-marker@db.example.test:5544/abonten_dev?sslmode=require&token=query-secret';
    const description = describeDatabaseEndpoint(url);

    assert.equal(description, 'db.example.test:5544/abonten_dev');
    assert.doesNotMatch(description, /seed-user|marker|query-secret|sslmode/);
    assert.equal(describeDatabaseEndpoint('not-a-database-url'), '[invalid database endpoint]');
  });

  it('redacts complete URLs and credential variants without hiding actionable diagnostics', () => {
    const url = 'postgresql://seed-user:p%40ss-marker@localhost:5432/abonten';
    const error = new Error(
      `Identity reconciliation blocked while connecting to ${url}; user=seed-user password=p@ss-marker`,
    );
    const message = sanitizeDatabaseError(error, url);

    assert.match(message, /Identity reconciliation blocked/);
    assert.match(message, /localhost:5432\/abonten/);
    assert.doesNotMatch(message, /seed-user|p%40ss-marker|p@ss-marker|postgresql:\/\//);
  });
});

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import { createRuntimeDataSource } from './database.module';

function config(nodeEnv: string): ConfigService {
  return {
    get<T>(key: string): T | undefined {
      const values: Record<string, unknown> = {
        nodeEnv,
        'database.url': 'postgresql://example.invalid/abonten',
      };
      return values[key] as T | undefined;
    },
  } as ConfigService;
}

describe('runtime database schema policy', () => {
  it('never enables TypeORM synchronization in development or production', () => {
    for (const nodeEnv of ['development', 'test', 'production']) {
      const dataSource = createRuntimeDataSource(config(nodeEnv));
      assert.equal(
        dataSource.options.synchronize,
        false,
        `${nodeEnv} must preserve migration-defined checks and indexes`,
      );
    }
  });
});

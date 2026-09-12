import { strict as assert } from 'node:assert';
import { createServer } from 'node:net';
import { describe, it } from 'node:test';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthService } from '../auth/auth.service';
import { EmailCodeService } from '../auth/email-code.service';
import type { UserIdentityService } from '../auth/user-identity.service';
import type { MailService } from './mail.service';
import { RedisService } from './redis.service';

async function unavailableRedisUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return `redis://127.0.0.1:${address.port}`;
}

async function rejectsWithin(action: () => Promise<unknown>, milliseconds: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Redis command did not reject within ${milliseconds}ms`)),
      milliseconds,
    );
    action().then(
      () => {
        clearTimeout(timeout);
        reject(new Error('Redis command unexpectedly resolved'));
      },
      () => {
        clearTimeout(timeout);
        resolve();
      },
    );
  });
}

async function rejectsWithStatusWithin(
  action: () => Promise<unknown>,
  status: HttpStatus,
  milliseconds: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Request did not reject within ${milliseconds}ms`)),
      milliseconds,
    );
    action().then(
      () => {
        clearTimeout(timeout);
        reject(new Error('Request unexpectedly resolved'));
      },
      (error: unknown) => {
        clearTimeout(timeout);
        if (error instanceof HttpException && error.getStatus() === status) resolve();
        else reject(error);
      },
    );
  });
}

describe('RedisService outage policy', () => {
  it('rejects a command promptly instead of queuing it while Redis reconnects', async () => {
    const originalRedisUrl = process.env.REDIS_URL;
    process.env.REDIS_URL = await unavailableRedisUrl();
    const redis = new RedisService();

    try {
      assert.equal(redis.instance.options.enableOfflineQueue, false);
      assert.equal(redis.instance.options.maxRetriesPerRequest, 0);
      assert.equal(redis.instance.options.autoResendUnfulfilledCommands, false);
      assert.equal(redis.instance.options.commandTimeout, 2_000);

      const mail = {
        sent: 0,
        async send() {
          this.sent += 1;
        },
      };
      const emailCode = new EmailCodeService(
        redis,
        mail as unknown as MailService,
        {} as UserIdentityService,
        {} as AuthService,
        {
          get<T>(key: string): T | undefined {
            return (
              key === 'auth.emailCodeSecret'
                ? 'tests-only-email-code-secret-that-is-long-enough'
                : undefined
            ) as T | undefined;
          },
        } as ConfigService,
      );

      await redis.onModuleInit();
      await rejectsWithin(() => redis.instance.eval('return 1', 0), 250);
      await rejectsWithStatusWithin(
        () => emailCode.request('outage-request@example.com'),
        HttpStatus.SERVICE_UNAVAILABLE,
        250,
      );
      await rejectsWithStatusWithin(
        () => emailCode.verify('outage-verify@example.com', '123456'),
        HttpStatus.SERVICE_UNAVAILABLE,
        250,
      );
      assert.equal(mail.sent, 0);
    } finally {
      redis.onModuleDestroy();
      if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = originalRedisUrl;
    }
  });
});

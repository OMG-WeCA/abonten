import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AuthService } from './auth.service';
import { EmailCodeService } from './email-code.service';
import type { UserEntity } from './entities/user.entity';
import type { UserIdentityService } from './user-identity.service';
import type { MailService } from '../common/mail.service';
import type { RedisService } from '../common/redis.service';

const redisUrl = process.env.REDIS_INTEGRATION_URL;

interface TestConfig {
  requestLimit?: number;
  requestWindowSeconds?: number;
  verificationLimit?: number;
  verificationWindowSeconds?: number;
  maxAttempts?: number;
}

class CapturingMail {
  readonly html: string[] = [];

  async send(_to: string, _subject: string, html: string): Promise<void> {
    this.html.push(html);
  }
}

async function withRealRedis(test: (redis: Redis) => Promise<void>): Promise<void> {
  if (!redisUrl) throw new Error('REDIS_INTEGRATION_URL is required');
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
  });
  await redis.connect();
  try {
    await test(redis);
  } finally {
    redis.disconnect();
  }
}

function createSubject(redis: Redis, overrides: TestConfig = {}) {
  const mail = new CapturingMail();
  const identitySecret = `redis-integration-${randomUUID()}`;
  const identities = {
    async findOrCreateByEmail(email: string) {
      return {
        id: `user-${email}`,
        email,
        name: email.split('@')[0],
        status: 'active',
      } as UserEntity;
    },
  };
  const auth = {
    async issueTokens(user: UserEntity) {
      return {
        accessToken: `access-${user.id}`,
        refreshToken: `refresh-${user.id}`,
        user: { id: user.id, email: user.email, name: user.name, status: user.status },
      };
    },
  };
  const values: Record<string, unknown> = {
    'auth.emailCodeSecret': identitySecret,
    'auth.emailCodeTtlSeconds': 10,
    'auth.emailCodeMaxAttempts': overrides.maxAttempts ?? 5,
    'auth.emailCodeRequestLimit': overrides.requestLimit ?? 10,
    'auth.emailCodeRequestWindowSeconds': overrides.requestWindowSeconds ?? 10,
    'auth.emailCodeVerificationLimit': overrides.verificationLimit ?? 20,
    'auth.emailCodeVerificationWindowSeconds': overrides.verificationWindowSeconds ?? 10,
  };
  const cfg = {
    get<T>(key: string): T | undefined {
      return values[key] as T | undefined;
    },
  };
  const service = new EmailCodeService(
    { instance: redis } as RedisService,
    mail as unknown as MailService,
    identities as unknown as UserIdentityService,
    auth as AuthService,
    cfg as ConfigService,
  );
  return { service, mail };
}

function latestCode(mail: CapturingMail): string {
  const match = />(\d{6})</.exec(mail.html.at(-1) ?? '');
  assert.ok(match, 'the delivered message contains a six-digit code');
  return match[1];
}

function differentCode(code: string): string {
  return `${code.slice(0, 5)}${code.endsWith('0') ? '1' : '0'}`;
}

async function expectStatus(action: () => Promise<unknown>, status: HttpStatus): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    return error instanceof HttpException && error.getStatus() === status;
  });
}

describe('EmailCodeService shipped Lua against real Redis', () => {
  it(
    'resets request and verification counters at fixed-window boundaries',
    { skip: !redisUrl },
    async () => {
      await withRealRedis(async (redis) => {
        const requestSubject = createSubject(redis, {
          requestLimit: 2,
          requestWindowSeconds: 1,
        });
        await requestSubject.service.request('request-window@example.com');
        await requestSubject.service.request('request-window@example.com');
        await expectStatus(
          () => requestSubject.service.request('request-window@example.com'),
          HttpStatus.TOO_MANY_REQUESTS,
        );
        await new Promise((resolve) => setTimeout(resolve, 1_100));
        assert.deepEqual(await requestSubject.service.request('request-window@example.com'), {
          accepted: true,
        });

        const verifySubject = createSubject(redis, {
          verificationLimit: 2,
          verificationWindowSeconds: 1,
          maxAttempts: 10,
        });
        await verifySubject.service.request('verify-window@example.com');
        const code = latestCode(verifySubject.mail);
        await expectStatus(
          () => verifySubject.service.verify('verify-window@example.com', differentCode(code)),
          HttpStatus.UNAUTHORIZED,
        );
        await expectStatus(
          () => verifySubject.service.verify('verify-window@example.com', differentCode(code)),
          HttpStatus.UNAUTHORIZED,
        );
        await expectStatus(
          () => verifySubject.service.verify('verify-window@example.com', differentCode(code)),
          HttpStatus.TOO_MANY_REQUESTS,
        );
        await new Promise((resolve) => setTimeout(resolve, 1_100));
        assert.equal(
          (await verifySubject.service.verify('verify-window@example.com', code)).user.email,
          'verify-window@example.com',
        );
      });
    },
  );

  it(
    'allows one concurrent consumer and rejects replay of the same code',
    { skip: !redisUrl },
    async () => {
      await withRealRedis(async (redis) => {
        const { service, mail } = createSubject(redis);
        await service.request('concurrent@example.com');
        const code = latestCode(mail);
        const results = await Promise.allSettled([
          service.verify('concurrent@example.com', code),
          service.verify('concurrent@example.com', code),
          service.verify('concurrent@example.com', code),
        ]);
        assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
        assert.equal(results.filter((result) => result.status === 'rejected').length, 2);
        await expectStatus(
          () => service.verify('concurrent@example.com', code),
          HttpStatus.UNAUTHORIZED,
        );
      });
    },
  );

  it('locks a challenge after the configured attempt count', { skip: !redisUrl }, async () => {
    await withRealRedis(async (redis) => {
      const { service, mail } = createSubject(redis, { maxAttempts: 3 });
      await service.request('attempts@example.com');
      const code = latestCode(mail);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await expectStatus(
          () => service.verify('attempts@example.com', differentCode(code)),
          HttpStatus.UNAUTHORIZED,
        );
      }
      await expectStatus(
        () => service.verify('attempts@example.com', code),
        HttpStatus.UNAUTHORIZED,
      );
    });
  });

  it('invalidates the previous challenge on resend', { skip: !redisUrl }, async () => {
    await withRealRedis(async (redis) => {
      const { service, mail } = createSubject(redis);
      await service.request('resend@example.com');
      const firstCode = latestCode(mail);
      let secondCode = firstCode;
      for (let request = 0; request < 5 && secondCode === firstCode; request += 1) {
        await service.request('resend@example.com');
        secondCode = latestCode(mail);
      }
      assert.notEqual(secondCode, firstCode, 'a distinct resend code was generated');
      await expectStatus(
        () => service.verify('resend@example.com', firstCode),
        HttpStatus.UNAUTHORIZED,
      );
      assert.equal(
        (await service.verify('resend@example.com', secondCode)).user.email,
        'resend@example.com',
      );
    });
  });
});

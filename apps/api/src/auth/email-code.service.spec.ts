import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthService } from './auth.service';
import { EmailCodeService } from './email-code.service';
import type { UserEntity } from './entities/user.entity';
import type { MailService } from '../common/mail.service';
import type { RedisService } from '../common/redis.service';
import type { UserIdentityService } from './user-identity.service';

interface StoredValue {
  value: string;
  expiresAt?: number;
}

class FakeRedis {
  readonly values = new Map<string, StoredValue>();
  now = 0;
  failNext = false;

  async eval(script: string, keyCount: number, ...args: string[]): Promise<number | string[]> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Redis unavailable');
    }

    const keys = args.slice(0, keyCount);
    const parameters = args.slice(keyCount);
    this.pruneExpired();

    if (script.includes('-- email-code-request')) {
      const [requestRateKey, challengeKey] = keys;
      const [requestLimit, requestWindowSeconds, challengeJson, codeTtlSeconds] = parameters;
      const nextCount = this.incrementFixedWindow(requestRateKey, Number(requestWindowSeconds));
      if (nextCount > Number(requestLimit)) return 0;
      this.set(challengeKey, challengeJson, Number(codeTtlSeconds));
      return 1;
    }

    if (script.includes('-- email-code-verify')) {
      const [challengeKey, verificationRateKey] = keys;
      const [candidateHash, verificationLimit, verificationWindowSeconds, maxAttempts] = parameters;
      const nextCount = this.incrementFixedWindow(
        verificationRateKey,
        Number(verificationWindowSeconds),
      );
      if (nextCount > Number(verificationLimit)) return ['rate_limited'];

      const rawChallenge = this.get(challengeKey);
      if (!rawChallenge) return ['invalid'];
      const challenge = JSON.parse(rawChallenge) as {
        email: string;
        codeHash: string;
        attempts: number;
      };
      if (challenge.codeHash === candidateHash) {
        this.values.delete(challengeKey);
        return ['valid', challenge.email];
      }

      challenge.attempts += 1;
      if (challenge.attempts >= Number(maxAttempts)) {
        this.values.delete(challengeKey);
        return ['locked'];
      }
      const ttlSeconds = this.ttl(challengeKey);
      if (ttlSeconds > 0) this.set(challengeKey, JSON.stringify(challenge), ttlSeconds);
      return ['invalid'];
    }

    if (script.includes('-- email-code-delete-current')) {
      const [challengeKey] = keys;
      const [id] = parameters;
      const rawChallenge = this.get(challengeKey);
      if (!rawChallenge) return 0;
      const challenge = JSON.parse(rawChallenge) as { id: string };
      if (challenge.id !== id) return 0;
      this.values.delete(challengeKey);
      return 1;
    }

    throw new Error('Unknown Redis script');
  }

  advance(seconds: number): void {
    this.now += seconds * 1000;
    this.pruneExpired();
  }

  get(key: string): string | undefined {
    this.pruneExpired();
    return this.values.get(key)?.value;
  }

  private set(key: string, value: string, ttlSeconds: number): void {
    this.values.set(key, { value, expiresAt: this.now + ttlSeconds * 1000 });
  }

  private incrementFixedWindow(key: string, ttlSeconds: number): number {
    const current = this.values.get(key);
    const nextCount = Number(current?.value ?? '0') + 1;
    this.values.set(key, {
      value: String(nextCount),
      expiresAt: current?.expiresAt ?? this.now + ttlSeconds * 1000,
    });
    return nextCount;
  }

  private ttl(key: string): number {
    const entry = this.values.get(key);
    if (!entry?.expiresAt) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - this.now) / 1000));
  }

  private pruneExpired(): void {
    for (const [key, entry] of this.values) {
      if (entry.expiresAt !== undefined && entry.expiresAt <= this.now) this.values.delete(key);
    }
  }
}

class FakeMail {
  readonly sent: Array<{ to: string; subject: string; html: string }> = [];
  fail = false;

  async send(to: string, subject: string, html: string): Promise<void> {
    if (this.fail) throw new Error('SMTP unavailable');
    this.sent.push({ to, subject, html });
  }
}

class FakeUsers {
  readonly users = new Map<string, UserEntity>();

  async findOne(email: string): Promise<UserEntity | null> {
    return (
      [...this.users.values()].find((user) => user.email.toLowerCase() === email.toLowerCase()) ??
      null
    );
  }

  create(input: Pick<UserEntity, 'email' | 'name' | 'status'>): UserEntity {
    return { ...input, id: `user-${this.users.size + 1}` } as UserEntity;
  }

  async save(user: UserEntity): Promise<UserEntity> {
    this.users.set(user.email, user);
    return user;
  }
}

function createSubject() {
  const redis = new FakeRedis();
  const mail = new FakeMail();
  const users = new FakeUsers();
  const issued: string[] = [];
  const auth = {
    async issueTokens(user: UserEntity) {
      issued.push(user.email);
      return {
        accessToken: `access-${user.id}`,
        refreshToken: `refresh-${user.id}`,
        user: { id: user.id, email: user.email, name: user.name, status: user.status },
      };
    },
  };
  const cfg = {
    get<T>(key: string): T | undefined {
      const values: Record<string, unknown> = {
        'auth.emailCodeSecret': 'tests-only-email-code-secret-that-is-long-enough',
        'auth.emailCodeTtlSeconds': 600,
        'auth.emailCodeMaxAttempts': 5,
        'auth.emailCodeRequestLimit': 3,
        'auth.emailCodeRequestWindowSeconds': 900,
        'auth.emailCodeVerificationLimit': 15,
        'auth.emailCodeVerificationWindowSeconds': 900,
      };
      return values[key] as T | undefined;
    },
  };
  const identities = {
    async findOrCreateByEmail(email: string, profile: { name: string }) {
      const existing = await users.findOne(email);
      if (existing) return existing;
      return users.save(users.create({ email, name: profile.name, status: 'active' }));
    },
  };
  const service = new EmailCodeService(
    { instance: redis } as unknown as RedisService,
    mail as unknown as MailService,
    identities as UserIdentityService,
    auth as AuthService,
    cfg as ConfigService,
  );
  return { service, redis, mail, users, issued };
}

function latestCode(mail: FakeMail): string {
  const html = mail.sent.at(-1)?.html ?? '';
  const match = />(\d{6})</.exec(html);
  assert.ok(match, 'the email contains a six-digit code');
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

describe('EmailCodeService', () => {
  it('sends a French code email and keeps verification language independent from token security', async () => {
    const { service, mail } = createSubject();
    await service.request('french@example.com', 'fr');
    assert.equal(mail.sent[0].subject, 'Votre code de connexion Abonten');
    assert.match(mail.sent[0].html, /lang="fr"/);
    assert.match(mail.sent[0].html, /Il expire dans 10 minutes/);
    const code = latestCode(mail);
    await assert.rejects(
      () => service.verify('french@example.com', differentCode(code), undefined, 'fr'),
      (error: unknown) =>
        error instanceof HttpException &&
        JSON.stringify(error.getResponse()).includes('Code de connexion incorrect ou expiré'),
    );
    assert.equal(
      (await service.verify('french@example.com', code, undefined, 'fr')).user.email,
      'french@example.com',
    );
  });

  it('stores only a keyed hash and issues existing session tokens after a correct code', async () => {
    const { service, redis, mail, users, issued } = createSubject();
    await users.save(
      users.create({ email: 'person@example.com', name: 'Person', status: 'active' }),
    );

    assert.deepEqual(await service.request(' Person@Example.com '), { accepted: true });
    const code = latestCode(mail);
    const challenge = [...redis.values.entries()].find(([key]) => key.includes(':challenge:'))?.[1]
      .value;
    assert.ok(challenge);
    assert.match(challenge, /"codeHash":"[a-f0-9]{64}"/);
    assert.doesNotMatch(challenge, new RegExp(code));

    const result = await service.verify('person@example.com', code);
    assert.equal(result.user.email, 'person@example.com');
    assert.equal(users.users.size, 1);
    assert.equal(issued.length, 1);
    assert.equal(mail.sent[0].to, 'person@example.com');
  });

  it('treats percent and underscore in an email address as literal characters', async () => {
    const { service, mail, users, issued } = createSubject();
    await users.save(users.create({ email: 'aXb@example.com', name: 'Victim', status: 'active' }));
    await users.save(
      users.create({ email: 'a-long-b@example.com', name: 'Victim', status: 'active' }),
    );

    await service.request('a_b@example.com');
    const underscoreCode = latestCode(mail);
    const underscoreResult = await service.verify('a_b@example.com', underscoreCode);
    assert.equal(underscoreResult.user.email, 'a_b@example.com');

    await service.request('a%b@example.com');
    const percentCode = latestCode(mail);
    const percentResult = await service.verify('a%b@example.com', percentCode);
    assert.equal(percentResult.user.email, 'a%b@example.com');

    assert.equal(users.users.size, 4);
    assert.deepEqual(issued, ['a_b@example.com', 'a%b@example.com']);
  });

  it('rejects wrong, expired, replayed, and exhausted codes', async () => {
    const { service, redis, mail } = createSubject();
    await service.request('person@example.com');
    const code = latestCode(mail);

    await expectStatus(
      () => service.verify('person@example.com', differentCode(code)),
      HttpStatus.UNAUTHORIZED,
    );
    const success = await service.verify('person@example.com', code);
    assert.equal(success.user.email, 'person@example.com');
    await expectStatus(() => service.verify('person@example.com', code), HttpStatus.UNAUTHORIZED);

    await service.request('expiry@example.com');
    const expiringCode = latestCode(mail);
    redis.advance(601);
    await expectStatus(
      () => service.verify('expiry@example.com', expiringCode),
      HttpStatus.UNAUTHORIZED,
    );

    await service.request('locked@example.com');
    const lockedCode = latestCode(mail);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expectStatus(
        () => service.verify('locked@example.com', differentCode(lockedCode)),
        HttpStatus.UNAUTHORIZED,
      );
    }
    await expectStatus(
      () => service.verify('locked@example.com', lockedCode),
      HttpStatus.UNAUTHORIZED,
    );
  });

  it('invalidates a previous code on resend and limits requests and verification guesses', async () => {
    const { service, mail } = createSubject();
    await service.request('resend@example.com');
    const firstCode = latestCode(mail);
    await service.request('resend@example.com');
    const secondCode = latestCode(mail);
    assert.notEqual(firstCode, secondCode);
    await expectStatus(
      () => service.verify('resend@example.com', firstCode),
      HttpStatus.UNAUTHORIZED,
    );
    assert.equal(
      (await service.verify('resend@example.com', secondCode)).user.email,
      'resend@example.com',
    );

    await service.request('rate@example.com');
    await service.request('rate@example.com');
    await service.request('rate@example.com');
    await expectStatus(() => service.request('rate@example.com'), HttpStatus.TOO_MANY_REQUESTS);

    await service.request('verify-rate@example.com');
    const verificationCode = latestCode(mail);
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await expectStatus(
        () => service.verify('verify-rate@example.com', differentCode(verificationCode)),
        HttpStatus.UNAUTHORIZED,
      );
    }
    await expectStatus(
      () => service.verify('verify-rate@example.com', differentCode(verificationCode)),
      HttpStatus.TOO_MANY_REQUESTS,
    );
  });

  it('keeps request and verification limits on fixed windows instead of sliding expiry', async () => {
    const { service, redis, mail } = createSubject();

    await service.request('request-window@example.com');
    redis.advance(899);
    await service.request('request-window@example.com');
    await service.request('request-window@example.com');
    await expectStatus(
      () => service.request('request-window@example.com'),
      HttpStatus.TOO_MANY_REQUESTS,
    );
    redis.advance(2);
    assert.deepEqual(await service.request('request-window@example.com'), { accepted: true });

    await service.request('verify-window@example.com');
    const code = latestCode(mail);
    await expectStatus(
      () => service.verify('verify-window@example.com', differentCode(code)),
      HttpStatus.UNAUTHORIZED,
    );
    redis.advance(899);
    for (let attempt = 1; attempt < 15; attempt += 1) {
      await expectStatus(
        () => service.verify('verify-window@example.com', differentCode(code)),
        HttpStatus.UNAUTHORIZED,
      );
    }
    await expectStatus(
      () => service.verify('verify-window@example.com', differentCode(code)),
      HttpStatus.TOO_MANY_REQUESTS,
    );
    redis.advance(2);
    await expectStatus(
      () => service.verify('verify-window@example.com', differentCode(code)),
      HttpStatus.UNAUTHORIZED,
    );
  });

  it('allows exactly one concurrent verification to consume a code', async () => {
    const { service, mail } = createSubject();
    await service.request('concurrent@example.com');
    const code = latestCode(mail);

    const results = await Promise.allSettled([
      service.verify('concurrent@example.com', code),
      service.verify('concurrent@example.com', code),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  });

  it('fails closed when Redis or email delivery is unavailable', async () => {
    const { service, redis, mail } = createSubject();
    redis.failNext = true;
    await expectStatus(
      () => service.request('redis-request@example.com'),
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    assert.equal(mail.sent.length, 0);

    mail.fail = true;
    await expectStatus(
      () => service.request('mail-failure@example.com'),
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    assert.equal([...redis.values.keys()].filter((key) => key.includes(':challenge:')).length, 0);

    mail.fail = false;
    await service.request('redis-verify@example.com');
    const code = latestCode(mail);
    redis.failNext = true;
    await expectStatus(
      () => service.verify('redis-verify@example.com', code),
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  });
});

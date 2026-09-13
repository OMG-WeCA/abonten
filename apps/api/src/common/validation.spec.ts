import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { CookieOptions, Store } from 'express-session';
import configuration from './configuration';
import validationSchema from './validation';
import { oidcSessionOptions } from './oidc-session-options';

const JWT_SECRET = 'jwt-secret-for-production-tests-32-bytes';
const EMAIL_CODE_SECRET = 'email-code-secret-for-production-tests';
const SESSION_SECRET = 'oidc-session-secret-for-production-tests';

describe('production authentication configuration', () => {
  it('rejects missing, placeholder, and short JWT secrets in production', () => {
    const base = { NODE_ENV: 'production', EMAIL_CODE_SECRET, SESSION_SECRET };

    assert.ok(validationSchema.validate(base).error);
    assert.ok(validationSchema.validate({ ...base, JWT_SECRET: 'change-me-in-dev' }).error);
    assert.ok(validationSchema.validate({ ...base, JWT_SECRET: 'short-secret' }).error);
    assert.ok(validationSchema.validate({ ...base, JWT_SECRET: 'x'.repeat(31) }).error);
  });

  it('rejects equal strong JWT and email-code secrets in production', () => {
    const result = validationSchema.validate({
      NODE_ENV: 'production',
      JWT_SECRET,
      EMAIL_CODE_SECRET: JWT_SECRET,
      SESSION_SECRET,
    });
    assert.match(result.error?.message ?? '', /must be distinct from JWT_SECRET/);
  });

  it('accepts distinct strong JWT and email-code secrets in production', () => {
    const result = validationSchema.validate({
      NODE_ENV: 'production',
      JWT_SECRET,
      EMAIL_CODE_SECRET,
      SESSION_SECRET,
    });
    assert.equal(result.error, undefined);
  });

  it('requires a strong non-placeholder OIDC session secret in production', () => {
    const base = { NODE_ENV: 'production', JWT_SECRET, EMAIL_CODE_SECRET };
    assert.ok(validationSchema.validate(base).error);
    assert.ok(
      validationSchema.validate({ ...base, SESSION_SECRET: 'change-me-session-dev' }).error,
    );
    assert.ok(validationSchema.validate({ ...base, SESSION_SECRET: 'x'.repeat(31) }).error);
    assert.equal(validationSchema.validate({ ...base, SESSION_SECRET }).error, undefined);

    assert.throws(
      () => oidcSessionOptions('change-me-session-dev', 'production'),
      /strong SESSION_SECRET/,
    );
    assert.throws(
      () => oidcSessionOptions(SESSION_SECRET, 'production'),
      /shared OIDC session store/,
    );
    const store = {} as Store;
    const options = oidcSessionOptions(SESSION_SECRET, 'production', store);
    const cookie = options.cookie as CookieOptions;
    assert.equal(options.store, store);
    assert.equal(options.proxy, true);
    assert.equal(options.saveUninitialized, false);
    assert.equal(cookie.httpOnly, true);
    assert.equal(cookie.secure, true);
    assert.equal(cookie.sameSite, 'lax');
  });

  it('shares the optional web base path with the Microsoft return route configuration', () => {
    assert.equal(
      validationSchema.validate({ NEXT_PUBLIC_BASE_PATH: '/preview/account' }).error,
      undefined,
    );
    assert.ok(validationSchema.validate({ NEXT_PUBLIC_BASE_PATH: 'preview' }).error);
    assert.ok(validationSchema.validate({ NEXT_PUBLIC_BASE_PATH: '/preview/' }).error);

    const previousBasePath = process.env.NEXT_PUBLIC_BASE_PATH;
    try {
      process.env.NEXT_PUBLIC_BASE_PATH = '/preview';
      assert.equal(configuration().web.basePath, '/preview');
    } finally {
      if (previousBasePath === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
      else process.env.NEXT_PUBLIC_BASE_PATH = previousBasePath;
    }
  });

  it('validates bounded SMTP timeout settings', () => {
    const valid = validationSchema.validate({
      SMTP_CONNECTION_TIMEOUT_MS: 100,
      SMTP_GREETING_TIMEOUT_MS: 200,
      SMTP_SOCKET_TIMEOUT_MS: 300,
      SMTP_DELIVERY_TIMEOUT_MS: 400,
    });
    assert.equal(valid.error, undefined);
    assert.ok(validationSchema.validate({ SMTP_CONNECTION_TIMEOUT_MS: 99 }).error);
    assert.ok(validationSchema.validate({ SMTP_DELIVERY_TIMEOUT_MS: 120_001 }).error);
  });

  it('does not configure production secret fallbacks but preserves development convenience', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousJwtSecret = process.env.JWT_SECRET;
    const previousEmailCodeSecret = process.env.EMAIL_CODE_SECRET;
    const previousSessionSecret = process.env.SESSION_SECRET;
    try {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = JWT_SECRET;
      delete process.env.EMAIL_CODE_SECRET;
      delete process.env.SESSION_SECRET;
      assert.equal(configuration().auth.emailCodeSecret, undefined);
      assert.equal(configuration().session.secret, undefined);

      delete process.env.JWT_SECRET;
      assert.equal(configuration().jwt.secret, undefined);

      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = JWT_SECRET;
      assert.equal(configuration().auth.emailCodeSecret, JWT_SECRET);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwtSecret;
      if (previousEmailCodeSecret === undefined) delete process.env.EMAIL_CODE_SECRET;
      else process.env.EMAIL_CODE_SECRET = previousEmailCodeSecret;
      if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = previousSessionSecret;
    }
  });
});

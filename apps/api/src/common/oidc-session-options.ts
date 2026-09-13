import type { SessionOptions, Store } from 'express-session';

const DEVELOPMENT_SESSION_SECRET = 'change-me-session-dev';
const INVALID_PRODUCTION_SECRETS = new Set([
  DEVELOPMENT_SESSION_SECRET,
  'change-me-in-dev',
  'change-me',
]);

export function oidcSessionOptions(
  configuredSecret: string | undefined,
  nodeEnv: string,
  store?: Store,
): SessionOptions {
  const production = nodeEnv === 'production';
  const normalized = configuredSecret?.trim() ?? '';
  if (
    production &&
    (normalized.length < 32 || INVALID_PRODUCTION_SECRETS.has(normalized.toLowerCase()))
  ) {
    throw new Error('A strong SESSION_SECRET is required in production');
  }

  if (production && !store) {
    throw new Error('A shared OIDC session store is required in production');
  }

  const secret = normalized || DEVELOPMENT_SESSION_SECRET;
  return {
    store,
    name: 'abonten.oidc',
    secret,
    resave: false,
    saveUninitialized: false,
    unset: 'destroy',
    proxy: production,
    cookie: {
      httpOnly: true,
      secure: production,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    },
  };
}

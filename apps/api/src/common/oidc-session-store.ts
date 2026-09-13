import session, { type SessionData } from 'express-session';
import type Redis from 'ioredis';

const DEFAULT_TTL_MS = 10 * 60 * 1000;

/** Redis-backed, short-lived storage for OIDC state and nonce sessions. */
export class OidcRedisSessionStore extends session.Store {
  constructor(private readonly redis: Redis) {
    super();
  }

  override get(
    sid: string,
    callback: (error: unknown, session?: SessionData | null) => void,
  ): void {
    void this.redis
      .get(key(sid))
      .then((value) => callback(null, value ? (JSON.parse(value) as SessionData) : null))
      .catch((error: unknown) => callback(error));
  }

  override set(sid: string, value: SessionData, callback?: (error?: unknown) => void): void {
    const ttl = value.cookie.maxAge ?? DEFAULT_TTL_MS;
    void this.redis
      .set(key(sid), JSON.stringify(value), 'PX', Math.max(1, ttl))
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override destroy(sid: string, callback?: (error?: unknown) => void): void {
    void this.redis
      .del(key(sid))
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }

  override touch(sid: string, value: SessionData, callback?: (error?: unknown) => void): void {
    const ttl = value.cookie.maxAge ?? DEFAULT_TTL_MS;
    void this.redis
      .pexpire(key(sid), Math.max(1, ttl))
      .then(() => callback?.())
      .catch((error: unknown) => callback?.(error));
  }
}

function key(sid: string): string {
  return `oidc:session:${sid}`;
}

import { strict as assert } from 'node:assert';
import { beforeEach, test } from 'node:test';
import {
  ApiError,
  apiJson,
  loadSession,
  repairSessionOrganizationContext,
  saveSession,
  type StoredSession,
} from './api';
import { microsoftSessionFromHash } from './microsoft-session';
import {
  clearOnboardingProgress,
  loadOrCreateOnboardingProgress,
  resumeOnboardingOrganization,
  saveOnboardingProgress,
  type OnboardingProgress,
} from './onboarding-progress';
import {
  hasValidActiveOrganization,
  loadAccountWithRecovery,
  shouldClearRejectedSession,
  workspaceAccessState,
} from './account-session-recovery';

const staleSession: StoredSession = {
  accessToken: 'expired-access-token',
  refreshToken: 'current-refresh-token',
  activeOrgId: 'org-1',
};
const rotatedSession: StoredSession = {
  accessToken: 'rotated-access-token',
  refreshToken: 'rotated-refresh-token',
  activeOrgId: 'org-1',
};
const invalidContextSession: StoredSession = {
  accessToken: 'invalid-context-access-token',
  refreshToken: 'invalid-context-refresh-token',
  activeOrgId: 'revoked-org',
};

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      locks: {
        request: async <T>(_name: string, callback: () => Promise<T>) => callback(),
      },
    },
  });
  saveSession(staleSession);
});

test('Microsoft callback session retains its issued active organization', () => {
  assert.deepEqual(
    microsoftSessionFromHash(
      '#accessToken=access-token&refreshToken=refresh-token&activeOrgId=org-2',
    ),
    {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      activeOrgId: 'org-2',
    },
  );
});

test('onboarding retries a failed context switch without creating another organization', async () => {
  let progress = loadOrCreateOnboardingProgress(localStorage, 'user-1');
  let createRequests = 0;
  let switchRequests = 0;
  const resume = () =>
    resumeOnboardingOrganization({
      progress,
      createOrganization: async () => {
        createRequests += 1;
        return { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' };
      },
      saveProgress: (nextProgress: OnboardingProgress) => {
        progress = nextProgress;
        saveOnboardingProgress(localStorage, 'user-1', nextProgress);
      },
      switchOrganization: async () => {
        switchRequests += 1;
        if (switchRequests === 1) throw new Error('temporary switch failure');
      },
    });

  await assert.rejects(resume(), /temporary switch failure/);
  assert.equal(
    loadOrCreateOnboardingProgress(localStorage, 'user-1').organizationId,
    'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  );
  await resume();

  assert.equal(createRequests, 1);
  assert.equal(switchRequests, 2);
  clearOnboardingProgress(localStorage, 'user-1');
  assert.notEqual(
    loadOrCreateOnboardingProgress(localStorage, 'user-1').idempotencyKey,
    progress.idempotencyKey,
  );
});

test('concurrent protected requests redeem one refresh token and both retry', async () => {
  let refreshRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/auth/refresh')) {
      refreshRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return Response.json(rotatedSession);
    }
    const authorized = new Headers(init?.headers).get('Authorization');
    return authorized === `Bearer ${rotatedSession.accessToken}`
      ? Response.json({ ok: true })
      : new Response(null, { status: 401 });
  };

  const responses = await Promise.all([
    apiJson<{ ok: boolean }>('/api/me'),
    apiJson<{ ok: boolean }>('/api/me/organizations'),
  ]);

  assert.equal(refreshRequests, 1);
  assert.deepEqual(responses, [{ ok: true }, { ok: true }]);
  assert.deepEqual(loadSession(), rotatedSession);
});

test('a refresh 403 removes the rejected organization and retries with an active membership', async () => {
  saveSession(invalidContextSession);
  const requestedOrganizations: Array<string | undefined> = [];
  globalThis.fetch = async (input, init) => {
    if (String(input).endsWith('/api/auth/refresh')) {
      const request = JSON.parse(String(init?.body)) as { activeOrgId?: string };
      requestedOrganizations.push(request.activeOrgId);
      return request.activeOrgId
        ? new Response(null, { status: 403 })
        : Response.json(rotatedSession);
    }
    const authorized = new Headers(init?.headers).get('Authorization');
    return authorized === `Bearer ${rotatedSession.accessToken}`
      ? Response.json({ ok: true })
      : new Response(null, { status: 401 });
  };

  assert.deepEqual(await apiJson('/api/me'), { ok: true });
  assert.deepEqual(requestedOrganizations, ['revoked-org', undefined]);
  assert.deepEqual(loadSession(), rotatedSession);
});

test('a stale rejected refresh cannot clear a newer browser session', async () => {
  let releaseRefresh: (() => void) | undefined;
  let markRefreshStarted: (() => void) | undefined;
  const refreshStarted = new Promise<void>((resolve) => {
    markRefreshStarted = resolve;
  });
  const refreshReleased = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });

  globalThis.fetch = async (input) => {
    if (String(input).endsWith('/api/auth/refresh')) {
      markRefreshStarted?.();
      await refreshReleased;
      return new Response(null, { status: 401 });
    }
    return new Response(null, { status: 401 });
  };

  const request = apiJson('/api/me');
  await refreshStarted;
  saveSession(rotatedSession);
  releaseRefresh?.();

  await assert.rejects(request);
  assert.deepEqual(loadSession(), rotatedSession);
});

test('a temporary refresh outage preserves the recoverable browser session', async () => {
  globalThis.fetch = async (input) =>
    String(input).endsWith('/api/auth/refresh')
      ? new Response(null, { status: 503 })
      : new Response(null, { status: 401 });

  await assert.rejects(apiJson('/api/me'), /temporarily unavailable/);
  assert.deepEqual(loadSession(), staleSession);
});

test('AuthProvider orchestration repairs an invalid active organization before routing', async () => {
  saveSession(invalidContextSession);
  let accountLoads = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/api/auth/refresh')) {
      const request = JSON.parse(String(init?.body)) as { activeOrgId?: string };
      assert.equal(request.activeOrgId, undefined);
      return Response.json(rotatedSession);
    }
    accountLoads += 1;
    const authorized = new Headers(init?.headers).get('Authorization');
    if (authorized !== `Bearer ${rotatedSession.accessToken}`) {
      return new Response(null, { status: 403 });
    }
    return url.endsWith('/api/me/organizations')
      ? Response.json([{ organizationId: 'org-1' }])
      : Response.json({ activeOrgId: 'org-1' });
  };

  const result = await loadAccountWithRecovery(
    invalidContextSession,
    loadSession,
    async () =>
      Promise.all([
        apiJson<{ activeOrgId: string }>('/api/me'),
        apiJson<Array<{ organizationId: string }>>('/api/me/organizations'),
      ]),
    repairSessionOrganizationContext,
  );

  assert.equal(result.status, 'loaded');
  assert.equal(accountLoads, 4);
  assert.deepEqual(loadSession(), rotatedSession);
});

test('both route guards reject an invalid active organization without choosing onboarding', () => {
  assert.equal(hasValidActiveOrganization('revoked-org', ['org-1']), false);
  assert.equal(hasValidActiveOrganization('org-1', ['org-1']), true);
  assert.equal(
    workspaceAccessState({
      ready: true,
      hasProfile: true,
      hasActiveOrganization: false,
      hasOrganizations: true,
      hasRecoveryError: false,
    }),
    'recovery',
  );
});

test('AuthProvider orchestration retries a stale 401 against the newer session', async () => {
  let currentSession = staleSession;
  let accountRequests = 0;
  const result = await loadAccountWithRecovery(
    staleSession,
    () => currentSession,
    async () => {
      accountRequests += 1;
      if (accountRequests === 1) {
        currentSession = rotatedSession;
        throw new ApiError('Unauthorized', 401);
      }
      return { userId: 'user-1', organizationId: 'org-1' };
    },
  );

  assert.deepEqual(result, {
    status: 'loaded',
    value: { userId: 'user-1', organizationId: 'org-1' },
  });
  assert.equal(accountRequests, 2);
  assert.equal(
    workspaceAccessState({
      ready: true,
      hasProfile: true,
      hasActiveOrganization: true,
      hasOrganizations: true,
      hasRecoveryError: false,
    }),
    'ready',
  );
});

test('AuthProvider orchestration exposes retry instead of redirecting after a temporary outage', async () => {
  const result = await loadAccountWithRecovery(
    staleSession,
    () => staleSession,
    async () => {
      throw new ApiError('Session refresh is temporarily unavailable.', 503);
    },
  );

  assert.deepEqual(result, { status: 'recoverable-error' });
  assert.equal(
    workspaceAccessState({
      ready: true,
      hasProfile: false,
      hasActiveOrganization: false,
      hasOrganizations: false,
      hasRecoveryError: true,
    }),
    'recovery',
  );
});

test('AuthProvider orchestration redirects only after the current session is rejected', async () => {
  const result = await loadAccountWithRecovery(
    staleSession,
    () => staleSession,
    async () => {
      throw new ApiError('Unauthorized', 401);
    },
  );

  assert.deepEqual(result, {
    status: 'signed-out',
    rejectedRefreshToken: staleSession.refreshToken,
  });
  assert.equal(shouldClearRejectedSession(staleSession.refreshToken, staleSession), true);
  assert.equal(shouldClearRejectedSession(staleSession.refreshToken, rotatedSession), false);
  assert.equal(
    workspaceAccessState({
      ready: true,
      hasProfile: false,
      hasActiveOrganization: false,
      hasOrganizations: false,
      hasRecoveryError: false,
    }),
    'sign-in',
  );
});

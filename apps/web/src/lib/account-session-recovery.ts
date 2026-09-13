import { ApiError, type StoredSession } from './api';

export type AccountLoadResult<T> =
  | { status: 'loaded'; value: T }
  | { status: 'signed-out'; rejectedRefreshToken: string }
  | { status: 'recoverable-error' };

export async function loadAccountWithRecovery<T>(
  initialSession: StoredSession,
  readSession: () => StoredSession | null,
  loadAccount: () => Promise<T>,
  repairOrganizationContext?: () => Promise<boolean>,
): Promise<AccountLoadResult<T>> {
  let snapshot = initialSession;
  let followedNewerSession = false;
  let repairedOrganization = false;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return { status: 'loaded', value: await loadAccount() };
    } catch (error) {
      const current = readSession();
      if (!current) {
        return { status: 'signed-out', rejectedRefreshToken: snapshot.refreshToken };
      }

      const sessionChanged = current.refreshToken !== snapshot.refreshToken;
      if (sessionChanged && !followedNewerSession) {
        followedNewerSession = true;
        snapshot = current;
        continue;
      }
      if (
        error instanceof ApiError &&
        error.status === 403 &&
        !repairedOrganization &&
        repairOrganizationContext
      ) {
        repairedOrganization = true;
        try {
          if (await repairOrganizationContext()) {
            const repairedSession = readSession();
            if (!repairedSession) {
              return { status: 'signed-out', rejectedRefreshToken: snapshot.refreshToken };
            }
            snapshot = repairedSession;
            continue;
          }
          if (!readSession()) {
            return { status: 'signed-out', rejectedRefreshToken: snapshot.refreshToken };
          }
        } catch {
          return { status: 'recoverable-error' };
        }
        return { status: 'recoverable-error' };
      }
      if (error instanceof ApiError && error.status === 401 && !sessionChanged) {
        return { status: 'signed-out', rejectedRefreshToken: snapshot.refreshToken };
      }
      return { status: 'recoverable-error' };
    }
  }

  return { status: 'recoverable-error' };
}

export function hasValidActiveOrganization(
  activeOrganizationId: string | undefined,
  organizationIds: readonly string[],
): boolean {
  return activeOrganizationId
    ? organizationIds.includes(activeOrganizationId)
    : organizationIds.length === 0;
}

export function shouldClearRejectedSession(
  rejectedRefreshToken: string,
  currentSession: StoredSession | null,
): boolean {
  return !currentSession || currentSession.refreshToken === rejectedRefreshToken;
}

export type WorkspaceAccessState = 'loading' | 'recovery' | 'sign-in' | 'onboarding' | 'ready';

export function workspaceAccessState(input: {
  ready: boolean;
  hasProfile: boolean;
  hasActiveOrganization: boolean;
  hasOrganizations: boolean;
  hasRecoveryError: boolean;
}): WorkspaceAccessState {
  if (!input.ready) return 'loading';
  if (input.hasRecoveryError) return 'recovery';
  if (!input.hasProfile) return 'sign-in';
  if (!input.hasActiveOrganization) {
    return input.hasOrganizations ? 'recovery' : 'onboarding';
  }
  return 'ready';
}

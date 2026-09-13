'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiError,
  apiFetch,
  apiJson,
  clearSession,
  loadSession,
  publicJson,
  repairSessionOrganizationContext,
  saveSession,
  SESSION_STORAGE_KEY,
  type StoredSession,
} from '../../lib/api';
import {
  hasValidActiveOrganization,
  loadAccountWithRecovery,
  shouldClearRejectedSession,
} from '../../lib/account-session-recovery';

export interface AccountProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  locale: 'en' | 'fr';
  timezone: string;
  status: string;
  hasAvatar: boolean;
}

export interface OrganizationSummary {
  organizationId: string;
  role: string;
  name: string;
  type: 'media_partner' | 'agency' | 'brand' | 'platform';
  country: string;
  defaultCurrency: string;
  defaultLocale: 'en' | 'fr';
}

interface MeResponse {
  user: AccountProfile | null;
  activeOrgId?: string;
  role?: string;
  capabilities: string[];
}

interface AuthContextValue {
  ready: boolean;
  sessionRecoveryError: boolean;
  profile: AccountProfile | null;
  organizations: OrganizationSummary[];
  activeOrganization: OrganizationSummary | null;
  capabilities: string[];
  avatarUrl: string | null;
  startSession: (session: StoredSession) => Promise<void>;
  refreshAccount: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | undefined>();
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sessionRecoveryError, setSessionRecoveryError] = useState(false);

  const clearAccount = useCallback(() => {
    clearSession();
    setSessionRecoveryError(false);
    setProfile(null);
    setOrganizations([]);
    setActiveOrgId(undefined);
    setCapabilities([]);
    setAvatarUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  }, []);

  const loadAvatar = useCallback(async (hasAvatar: boolean) => {
    setAvatarUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    if (!hasAvatar) return;
    try {
      const response = await apiFetch('/api/me/avatar');
      if (!response.ok) return;
      const photo = await response.blob();
      setAvatarUrl(URL.createObjectURL(photo));
    } catch {
      // A profile image should never prevent account recovery or navigation.
    }
  }, []);

  const refreshAccount = useCallback(async () => {
    const session = loadSession();
    if (!session) {
      clearAccount();
      setReady(true);
      return;
    }

    const result = await loadAccountWithRecovery(
      session,
      loadSession,
      async () => {
        const [me, orgs] = await Promise.all([
          apiJson<MeResponse>('/api/me'),
          apiJson<OrganizationSummary[]>('/api/me/organizations'),
        ]);
        if (!me.user) throw new Error('Account unavailable');
        const activeOrganizationIsValid = hasValidActiveOrganization(
          me.activeOrgId,
          orgs.map((organization) => organization.organizationId),
        );
        if (!activeOrganizationIsValid) {
          throw new ApiError('The active organization is no longer available.', 403);
        }
        return { me, orgs, user: me.user };
      },
      repairSessionOrganizationContext,
    );

    if (result.status === 'loaded') {
      const { me, orgs, user } = result.value;
      setSessionRecoveryError(false);
      setProfile(user);
      setOrganizations(orgs);
      setActiveOrgId(me.activeOrgId);
      setCapabilities(me.capabilities);
      void loadAvatar(user.hasAvatar);
    } else if (result.status === 'signed-out') {
      const current = loadSession();
      if (shouldClearRejectedSession(result.rejectedRefreshToken, current)) {
        clearAccount();
      } else {
        // Another tab replaced the rejected session after the request settled.
        // Keep the newer credentials and let the user retry safely.
        setSessionRecoveryError(true);
      }
    } else {
      setSessionRecoveryError(true);
    }
    setReady(true);
  }, [clearAccount, loadAvatar]);

  useEffect(() => {
    void refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    document.documentElement.lang = profile?.locale === 'fr' ? 'fr' : 'en';
  }, [profile?.locale]);

  useEffect(() => {
    const synchronizeSession = (event: StorageEvent) => {
      if (event.key !== SESSION_STORAGE_KEY) return;
      if (event.newValue) {
        void refreshAccount();
      } else {
        clearAccount();
        setReady(true);
      }
    };
    window.addEventListener('storage', synchronizeSession);
    return () => window.removeEventListener('storage', synchronizeSession);
  }, [clearAccount, refreshAccount]);

  const startSession = useCallback(
    async (session: StoredSession) => {
      saveSession(session);
      setSessionRecoveryError(false);
      setReady(false);
      await refreshAccount();
    },
    [refreshAccount],
  );

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      const current = loadSession();
      if (!current) throw new Error('No active session');

      const requestSwitch = (session: StoredSession) =>
        apiJson<StoredSession>('/api/me/switch-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId, refreshToken: session.refreshToken }),
        });

      let next: StoredSession;
      try {
        next = await requestSwitch(current);
      } catch (error) {
        // apiFetch may have refreshed an expired access JWT before retrying the
        // original body. Retry once with that newly rotated refresh token.
        const refreshed = loadSession();
        if (
          !(error instanceof ApiError) ||
          error.status !== 401 ||
          !refreshed ||
          refreshed.refreshToken === current.refreshToken
        ) {
          throw error;
        }
        next = await requestSwitch(refreshed);
      }

      saveSession(next);
      await refreshAccount();
    },
    [refreshAccount],
  );

  const signOut = useCallback(async () => {
    const session = loadSession();
    try {
      if (session) {
        await publicJson('/api/auth/logout', { refreshToken: session.refreshToken });
      }
    } catch {
      // Clear local credentials even if the API is unavailable or expired.
    } finally {
      clearAccount();
      setReady(true);
    }
  }, [clearAccount]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      sessionRecoveryError,
      profile,
      organizations,
      activeOrganization:
        organizations.find((organization) => organization.organizationId === activeOrgId) ?? null,
      capabilities,
      avatarUrl,
      startSession,
      refreshAccount,
      switchOrganization,
      signOut,
    }),
    [
      activeOrgId,
      avatarUrl,
      capabilities,
      organizations,
      profile,
      ready,
      refreshAccount,
      sessionRecoveryError,
      signOut,
      startSession,
      switchOrganization,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

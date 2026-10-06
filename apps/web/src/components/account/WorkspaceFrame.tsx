'use client';

import { displayUiText } from '../../lib/display-ui-text';

import {
  Building2,
  ChevronDown,
  CircleUserRound,
  Landmark as LandmarkIcon,
  LayoutGrid,
  LogOut,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getAccountCopy, type AccountLocale } from '../../lib/account-locale';
import { getSitesCopy } from '../../lib/sites-locale';
import { canSeeSitesArea } from '../../lib/sites-access';
import { workspaceAccessState } from '../../lib/account-session-recovery';
import { confirmUnsavedNavigation } from '../../lib/unsaved-navigation';
import { useAuth } from '../auth/AuthProvider';
import { LanguageSwitcher, useLocale } from '../LocaleProvider';

export function WorkspaceFrame({
  children,
  current,
}: {
  children: ReactNode;
  current: 'dashboard' | 'settings' | 'sites' | 'review';
}) {
  const router = useRouter();
  const {
    activeOrganization,
    avatarUrl,
    capabilities,
    organizations,
    profile,
    ready,
    refreshAccount,
    sessionRecoveryError,
    signOut,
    switchOrganization,
  } = useAuth();
  const { locale } = useLocale();
  const copy = getAccountCopy(locale);
  const sitesCopy = getSitesCopy(locale);
  // The server only lets media-partner organizations manage billboard sites
  // (assertMediaPartnerOrg) — the nav mirrors that rule, not just capabilities.
  const canSeeSites = canSeeSitesArea({
    capabilities,
    orgType: activeOrganization?.type,
  });
  const canReview = capabilities.includes('PLATFORM_ADMIN');
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const accessState = workspaceAccessState({
    ready,
    hasProfile: Boolean(profile),
    hasActiveOrganization: Boolean(activeOrganization),
    hasOrganizations: organizations.length > 0,
    hasRecoveryError: sessionRecoveryError,
  });

  useEffect(() => {
    if (accessState === 'sign-in') router.replace('/sign-in');
    else if (accessState === 'onboarding') router.replace('/onboarding');
  }, [accessState, router]);

  if (accessState === 'recovery') {
    return (
      <AccountRecovery
        locale={locale}
        onRetry={refreshAccount}
        onSignOut={async () => {
          await signOut();
          router.replace('/sign-in');
        }}
      />
    );
  }
  if (accessState !== 'ready' || !profile || !activeOrganization) {
    return <AccountLoading locale={locale} />;
  }

  const switchTo = async (organizationId: string) => {
    if (organizationId === activeOrganization.organizationId || !confirmUnsavedNavigation()) return;
    setSwitchError('');
    setSwitching(true);
    try {
      await switchOrganization(organizationId);
      router.replace('/dashboard');
    } catch {
      setSwitchError(copy.workspace.switchError);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center gap-3 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => {
              if (confirmUnsavedNavigation()) router.push('/dashboard');
            }}
            className="flex shrink-0 items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={copy.workspace.dashboard}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-black text-white shadow-lg shadow-primary/20">
              A
            </span>
            <span className="hidden text-base font-extrabold uppercase tracking-tight sm:inline">
              Abonten
            </span>
          </button>

          <label className="relative min-w-0 flex-1 sm:max-w-xs">
            <span className="sr-only">{copy.workspace.activeOrganization}</span>
            <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <select
              value={activeOrganization.organizationId}
              disabled={switching || organizations.length < 2}
              onChange={(event) => void switchTo(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-8 text-sm font-semibold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:cursor-default disabled:opacity-100"
            >
              {organizations.map((organization) => (
                <option key={organization.organizationId} value={organization.organizationId}>
                  {organization.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          </label>

          <nav className="ml-auto flex items-center gap-1" aria-label={copy.workspace.navigation}>
            <button
              type="button"
              onClick={() => {
                if (confirmUnsavedNavigation()) router.push('/dashboard');
              }}
              aria-label={copy.workspace.home}
              className={`flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition sm:px-3 ${
                current === 'dashboard'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-surface hover:text-foreground'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">{copy.workspace.home}</span>
            </button>
            {canSeeSites && (
              <button
                type="button"
                onClick={() => {
                  if (confirmUnsavedNavigation()) router.push('/sites');
                }}
                aria-label={sitesCopy.nav.sites}
                className={`flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition sm:px-3 ${
                  current === 'sites'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:bg-surface hover:text-foreground'
                }`}
              >
                <LandmarkIcon className="h-4 w-4" />
                <span className="hidden sm:inline">{sitesCopy.nav.sites}</span>
              </button>
            )}
            {canReview && (
              <button
                type="button"
                onClick={() => {
                  if (confirmUnsavedNavigation()) router.push('/admin/review');
                }}
                className={`flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition sm:px-3 ${
                  current === 'review'
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted hover:bg-surface hover:text-foreground'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">{sitesCopy.nav.review}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (confirmUnsavedNavigation()) router.push('/settings');
              }}
              aria-label={copy.workspace.settings}
              className={`flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold transition sm:px-3 ${
                current === 'settings'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted hover:bg-surface hover:text-foreground'
              }`}
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">{copy.workspace.settings}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmUnsavedNavigation())
                  void signOut().then(() => router.replace('/sign-in'));
              }}
              aria-label={copy.workspace.signOut}
              className="ml-1 flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-muted transition hover:bg-surface hover:text-foreground sm:px-3"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <CircleUserRound className="h-4 w-4" />
              )}
              <span className="hidden lg:inline">{copy.workspace.signOut}</span>
              <LogOut className="hidden h-4 w-4 lg:block" />
            </button>
          </nav>
          <LanguageSwitcher />
        </div>
      </header>
      {switchError && (
        <p
          role="alert"
          className="mx-auto mt-4 max-w-7xl px-4 text-sm font-medium text-error sm:px-6"
        >
          {displayUiText(switchError, locale)}
        </p>
      )}
      <main
        className={`mx-auto max-w-7xl px-4 sm:px-6 ${current === 'dashboard' ? 'py-4 lg:py-6' : 'py-8 lg:py-10'}`}
      >
        {children}
      </main>
    </div>
  );
}

export function AccountRecovery({
  locale,
  onRetry,
  onSignOut,
}: {
  locale?: AccountLocale;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
}) {
  const copy = getAccountCopy(locale);
  const [pendingAction, setPendingAction] = useState<'retry' | 'sign-out' | null>(null);

  const run = async (action: 'retry' | 'sign-out') => {
    setPendingAction(action);
    try {
      await (action === 'retry' ? onRetry() : onSignOut());
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 py-12 text-foreground">
      <section className="w-full max-w-md" aria-labelledby="account-recovery-heading">
        <span className="mb-8 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-base font-black text-white shadow-lg shadow-primary/20">
          A
        </span>
        <h1
          id="account-recovery-heading"
          className="max-w-sm text-3xl font-extrabold tracking-tight sm:text-4xl"
        >
          {copy.workspace.recoveryHeading}
        </h1>
        <p className="mt-4 max-w-sm text-base leading-7 text-muted">
          {copy.workspace.recoveryDetail}
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-4">
          <button
            type="button"
            disabled={pendingAction !== null}
            onClick={() => void run('retry')}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-70"
          >
            <RefreshCw className={`h-4 w-4 ${pendingAction === 'retry' ? 'animate-spin' : ''}`} />
            {pendingAction === 'retry' ? copy.workspace.retrying : copy.workspace.retry}
          </button>
          <button
            type="button"
            disabled={pendingAction !== null}
            onClick={() => void run('sign-out')}
            className="min-h-11 rounded-lg px-2 text-sm font-semibold text-muted transition hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-wait disabled:opacity-70"
          >
            {copy.workspace.signOut}
          </button>
        </div>
      </section>
    </div>
  );
}

export function AccountLoading({ locale }: { locale?: AccountLocale } = {}) {
  const copy = getAccountCopy(locale);
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
      <div>
        <div className="mx-auto mb-4 h-9 w-9 animate-pulse rounded-xl bg-primary/30" />
        <p className="text-sm font-medium text-muted">{copy.workspace.loading}</p>
      </div>
    </div>
  );
}

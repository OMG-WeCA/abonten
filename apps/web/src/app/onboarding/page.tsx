'use client';

import { ArrowRight, Building2, Check, Globe2, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AccountLoading, AccountRecovery } from '../../components/account/WorkspaceFrame';
import { useAuth } from '../../components/auth/AuthProvider';
import { getAccountCopy } from '../../lib/account-locale';
import { workspaceAccessState } from '../../lib/account-session-recovery';
import { ApiError, apiJson } from '../../lib/api';
import {
  clearOnboardingProgress,
  loadOrCreateOnboardingProgress,
  resumeOnboardingOrganization,
  saveOnboardingProgress,
} from '../../lib/onboarding-progress';

const COUNTRY_CURRENCIES: Record<string, string> = {
  Nigeria: 'NGN',
  Ghana: 'GHS',
  Cameroon: 'XAF',
};

export default function OnboardingPage() {
  const router = useRouter();
  const {
    activeOrganization,
    organizations,
    profile,
    ready,
    refreshAccount,
    sessionRecoveryError,
    signOut,
    switchOrganization,
  } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [locale, setLocale] = useState<'en' | 'fr'>('en');
  const [timezone, setTimezone] = useState('Africa/Lagos');
  const [organizationName, setOrganizationName] = useState('');
  const [organizationType, setOrganizationType] = useState<'media_partner' | 'agency' | 'brand'>(
    'media_partner',
  );
  const [country, setCountry] = useState('Nigeria');
  const [currency, setCurrency] = useState('NGN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const copy = getAccountCopy(locale).onboarding;
  const accessState = workspaceAccessState({
    ready,
    hasProfile: Boolean(profile),
    hasActiveOrganization: Boolean(activeOrganization),
    hasOrganizations: organizations.length > 0,
    hasRecoveryError: sessionRecoveryError,
  });

  useEffect(() => {
    if (accessState === 'sign-in') router.replace('/sign-in');
    else if (accessState === 'ready') {
      if (profile) clearOnboardingProgress(localStorage, profile.id);
      router.replace('/dashboard');
    }
  }, [accessState, profile, router]);

  useEffect(() => {
    if (!profile) return;
    setName(profile.name);
    setPhone(profile.phone ?? '');
    setLocale(profile.locale);
    setTimezone(profile.timezone);
  }, [profile]);

  const chooseCountry = (nextCountry: string) => {
    setCountry(nextCountry);
    setCurrency(COUNTRY_CURRENCIES[nextCountry] ?? 'NGN');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const profileName = name.trim();
    const orgName = organizationName.trim();
    if (!profile || !profileName || !orgName) {
      setError(copy.requiredFields);
      return;
    }

    const progress = loadOrCreateOnboardingProgress(localStorage, profile.id);
    setLoading(true);
    setError('');
    try {
      await apiJson('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName, phone: phone.trim(), locale, timezone }),
      });
      await resumeOnboardingOrganization({
        progress,
        createOrganization: (onboardingKey) =>
          apiJson<{ id: string }>('/api/orgs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              onboardingKey,
              name: orgName,
              type: organizationType,
              country: country.trim(),
              defaultCurrency: currency,
              defaultLocale: locale,
            }),
          }),
        saveProgress: (nextProgress) =>
          saveOnboardingProgress(localStorage, profile.id, nextProgress),
        switchOrganization,
      });
      clearOnboardingProgress(localStorage, profile.id);
      router.replace('/dashboard');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : copy.saveError);
    } finally {
      setLoading(false);
    }
  };

  if (accessState === 'recovery') {
    return (
      <AccountRecovery
        locale={profile?.locale}
        onRetry={refreshAccount}
        onSignOut={async () => {
          await signOut();
          router.replace('/sign-in');
        }}
      />
    );
  }
  if (accessState !== 'onboarding' || !profile) {
    return <AccountLoading locale={profile?.locale} />;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-6 sm:py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between sm:mb-12">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-base font-black text-white">
              A
            </span>
            Abonten
          </div>
          <p className="text-sm font-semibold text-muted">{copy.accountSetup}</p>
        </div>

        <div className="grid overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-2xl shadow-black/20 lg:grid-cols-[.78fr_1.22fr]">
          <aside className="relative overflow-hidden border-b border-border bg-surface p-7 sm:p-9 lg:border-b-0 lg:border-r lg:p-10">
            <div className="relative">
              <h1 className="text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">
                {copy.heading}
              </h1>
              <p className="mt-4 max-w-sm leading-7 text-muted">{copy.intro}</p>
              <ol className="mt-10 space-y-5 text-sm">
                <li className="flex items-center gap-3 font-semibold text-foreground">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-white">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {copy.profileStep}
                </li>
                <li className="flex items-center gap-3 font-semibold text-foreground">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-white">
                    2
                  </span>
                  {copy.organizationStep}
                </li>
                <li className="flex items-center gap-3 text-muted">
                  <span className="grid h-6 w-6 place-items-center rounded-full border border-border text-xs">
                    3
                  </span>
                  {copy.workspaceStep}
                </li>
              </ol>
            </div>
            <div className="pointer-events-none absolute -bottom-28 -left-24 h-64 w-64 rounded-full border-[24px] border-primary/10" />
          </aside>

          <form onSubmit={submit} className="p-7 sm:p-9 lg:p-10">
            <fieldset>
              <legend className="flex items-center gap-2 text-lg font-bold">
                <UserRound className="h-5 w-5 text-primary" />
                {copy.yourProfile}
              </legend>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field label={copy.name} htmlFor="name">
                  <input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={120}
                    className={inputClass}
                  />
                </Field>
                <Field label={copy.phone} htmlFor="phone">
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    maxLength={50}
                    className={inputClass}
                  />
                </Field>
                <Field label={copy.language} htmlFor="locale">
                  <select
                    id="locale"
                    value={locale}
                    onChange={(event) => setLocale(event.target.value as 'en' | 'fr')}
                    className={inputClass}
                  >
                    <option value="en">English</option>
                    <option value="fr">Français</option>
                  </select>
                </Field>
                <Field label={copy.timezone} htmlFor="timezone">
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    className={inputClass}
                  >
                    <option value="Africa/Lagos">Lagos (WAT)</option>
                    <option value="Africa/Accra">Accra (GMT)</option>
                    <option value="Africa/Douala">Douala (WAT)</option>
                  </select>
                </Field>
              </div>
            </fieldset>

            <div className="my-8 h-px bg-border" />

            <fieldset>
              <legend className="flex items-center gap-2 text-lg font-bold">
                <Building2 className="h-5 w-5 text-primary" />
                {copy.yourOrganization}
              </legend>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <Field
                  label={copy.organizationName}
                  htmlFor="organizationName"
                  className="sm:col-span-2"
                >
                  <input
                    id="organizationName"
                    value={organizationName}
                    onChange={(event) => setOrganizationName(event.target.value)}
                    required
                    maxLength={160}
                    placeholder={copy.organizationNameExample}
                    className={inputClass}
                  />
                </Field>
                <Field label={copy.workFor} htmlFor="organizationType">
                  <select
                    id="organizationType"
                    value={organizationType}
                    onChange={(event) =>
                      setOrganizationType(event.target.value as typeof organizationType)
                    }
                    className={inputClass}
                  >
                    <option value="media_partner">{copy.mediaPartner}</option>
                    <option value="agency">{copy.agency}</option>
                    <option value="brand">{copy.brand}</option>
                  </select>
                </Field>
                <Field label={copy.country} htmlFor="country">
                  <select
                    id="country"
                    value={country}
                    onChange={(event) => chooseCountry(event.target.value)}
                    className={inputClass}
                  >
                    <option>Nigeria</option>
                    <option>Ghana</option>
                    <option>Cameroon</option>
                  </select>
                </Field>
                <Field label={copy.defaultCurrency} htmlFor="currency">
                  <select
                    id="currency"
                    value={currency}
                    onChange={(event) => setCurrency(event.target.value)}
                    className={inputClass}
                  >
                    <option value="NGN">NGN — Nigerian naira</option>
                    <option value="GHS">GHS — Ghanaian cedi</option>
                    <option value="XAF">XAF — Central African CFA franc</option>
                    <option value="XOF">XOF — West African CFA franc</option>
                    <option value="USD">USD — US dollar</option>
                    <option value="EUR">EUR — Euro</option>
                  </select>
                </Field>
                <div className="flex items-end pb-1 text-sm leading-5 text-muted">
                  <Globe2 className="mr-2 h-4 w-4 shrink-0 text-primary" />
                  {copy.currencyHelp}
                </div>
              </div>
            </fieldset>

            {error && (
              <p
                role="alert"
                className="mt-6 rounded-lg bg-error/10 px-3 py-2.5 text-sm text-error"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover disabled:cursor-wait disabled:opacity-65 sm:w-auto sm:min-w-52"
            >
              {loading ? copy.saving : copy.enterWorkspace} <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20';

function Field({
  label,
  htmlFor,
  children,
  className = '',
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

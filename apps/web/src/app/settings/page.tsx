'use client';

import { displayUiText } from '../../lib/display-ui-text';

import {
  Camera,
  ChevronRight,
  CircleUserRound,
  Globe2,
  Landmark,
  LoaderCircle,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WorkspaceFrame } from '../../components/account/WorkspaceFrame';
import { useAuth } from '../../components/auth/AuthProvider';
import { formatAccountDate, getAccountCopy } from '../../lib/account-locale';
import { SUPPORTED_MARKETS, findMarket } from '../../lib/markets';
import { useLocale } from '../../components/LocaleProvider';
import { ApiError, apiJson } from '../../lib/api';

type Tab = 'profile' | 'preferences' | 'organization' | 'security';
interface SessionInfo {
  id: string;
  createdAt: string;
  expiresAt: string;
  userAgent?: string;
  ip?: string;
}
type SettingsCopy = ReturnType<typeof getAccountCopy>['settings'];

const inputClass =
  'h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-primary focus:ring-2 focus:ring-primary/20';

export default function SettingsPage() {
  const router = useRouter();
  const { activeOrganization, avatarUrl, capabilities, profile, refreshAccount, signOut } =
    useAuth();
  const { locale: displayLocale } = useLocale();
  const accountCopy = getAccountCopy(displayLocale);
  const copy = accountCopy.settings;
  const canManageOrganization = capabilities.includes('ORG_SETTINGS_EDIT');
  const [tab, setTab] = useState<Tab>('profile');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const initializedProfileId = useRef<string | null>(null);
  const previousSavedLocale = useRef<'en' | 'fr' | null>(null);
  const initializedOrganizationId = useRef<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [locale, setLocale] = useState<'en' | 'fr'>('en');
  const [timezone, setTimezone] = useState('Africa/Lagos');
  const [organizationName, setOrganizationName] = useState('');
  const [country, setCountry] = useState('Nigeria');
  const [currency, setCurrency] = useState('NGN');
  const [organizationLocale, setOrganizationLocale] = useState<'en' | 'fr'>('en');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    if (!profile) return;
    if (initializedProfileId.current === profile.id) {
      // Follow a saved language only while the preference field is unedited.
      const savedLocale = previousSavedLocale.current;
      setLocale((current) => (current === savedLocale ? profile.locale : current));
      previousSavedLocale.current = profile.locale;
      return;
    }
    initializedProfileId.current = profile.id;
    previousSavedLocale.current = profile.locale;
    setName(profile.name);
    setPhone(profile.phone ?? '');
    setLocale(profile.locale);
    setTimezone(profile.timezone);
  }, [profile]);

  useEffect(() => {
    if (
      !activeOrganization ||
      initializedOrganizationId.current === activeOrganization.organizationId
    )
      return;
    initializedOrganizationId.current = activeOrganization.organizationId;
    setOrganizationName(activeOrganization.name);
    setCountry(findMarket(activeOrganization.country)?.name ?? activeOrganization.country);
    setCurrency(activeOrganization.defaultCurrency);
    setOrganizationLocale(activeOrganization.defaultLocale);
  }, [activeOrganization]);

  const clearMessages = () => {
    setNotice('');
    setError('');
  };

  const selectTab = (next: Tab) => {
    if (next === 'organization' && !canManageOrganization) return;
    setTab(next);
    clearMessages();
  };

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    clearMessages();
    try {
      await apiJson('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone }),
      });
      await refreshAccount();
      setNotice(copy.profileSaved);
    } catch (caught) {
      setError(messageFor(caught, copy));
    } finally {
      setSaving(false);
    }
  };

  const savePreferences = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    clearMessages();
    try {
      await apiJson('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale, timezone }),
      });
      await refreshAccount();
      setNotice(getAccountCopy(locale).settings.preferencesSaved);
    } catch (caught) {
      setError(messageFor(caught, copy));
    } finally {
      setSaving(false);
    }
  };

  const saveOrganization = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeOrganization) return;
    setSaving(true);
    clearMessages();
    try {
      await apiJson(`/api/orgs/${activeOrganization.organizationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Org-Id': activeOrganization.organizationId,
        },
        body: JSON.stringify({
          name: organizationName,
          country,
          defaultCurrency: currency,
          defaultLocale: organizationLocale,
        }),
      });
      await refreshAccount();
      setNotice(copy.organizationSaved);
    } catch (caught) {
      setError(messageFor(caught, copy));
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    clearMessages();
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError(copy.photoError);
      event.target.value = '';
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.set('file', file);
      await apiJson('/api/me/avatar', { method: 'POST', body: form });
      await refreshAccount();
      setNotice(copy.photoSaved);
    } catch (caught) {
      setError(messageFor(caught, copy));
    } finally {
      setSaving(false);
      event.target.value = '';
    }
  };

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      setSessions(await apiJson<SessionInfo[]>('/api/me/sessions'));
    } catch (caught) {
      setError(messageFor(caught, copy));
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'security') void loadSessions();
  }, [tab]); // Deliberately loads on entry so the count is current before revocation.

  const revokeEverywhere = async () => {
    if (!confirmAll) {
      setConfirmAll(true);
      return;
    }
    setSaving(true);
    clearMessages();
    try {
      await apiJson('/api/me/sessions/revoke-all', { method: 'POST' });
      await signOut();
      router.replace('/sign-in');
    } catch (caught) {
      setError(messageFor(caught, copy));
    } finally {
      setSaving(false);
    }
  };

  const tabs: Array<{ id: Tab; label: string; hidden?: boolean }> = [
    { id: 'profile', label: copy.profile },
    { id: 'preferences', label: copy.preferences },
    { id: 'organization', label: copy.organization, hidden: !canManageOrganization },
    { id: 'security', label: copy.security },
  ];

  return (
    <WorkspaceFrame current="settings">
      <div className="max-w-5xl">
        <h1 className="text-3xl font-extrabold tracking-[-0.045em] sm:text-4xl">{copy.heading}</h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted">{copy.intro}</p>
        {activeOrganization?.type === 'media_partner' && (
          <Link
            href="/partner-terms/accepted"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-semibold hover:bg-surface focus-visible:ring-2 focus-visible:ring-primary"
          >
            {displayLocale === 'fr'
              ? 'Conditions partenaires et acceptations'
              : 'Partner terms and acceptance records'}
          </Link>
        )}

        <div className="mt-8 border-b border-border" role="tablist" aria-label={copy.tabLabel}>
          <div className="grid grid-cols-2 gap-1 sm:flex sm:overflow-x-auto">
            {tabs
              .filter((item) => !item.hidden)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => selectTab(item.id)}
                  className={`min-h-11 border-b-2 px-3 text-sm font-semibold transition sm:shrink-0 ${tab === item.id ? 'border-primary text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}
                >
                  {item.label}
                </button>
              ))}
          </div>
        </div>

        <div className="mt-7 max-w-2xl">
          {notice && (
            <p
              role="status"
              className="mb-5 rounded-lg bg-success/10 px-3 py-2.5 text-sm text-success"
            >
              {displayUiText(notice, displayLocale)}
            </p>
          )}
          {error && (
            <p role="alert" className="mb-5 rounded-lg bg-error/10 px-3 py-2.5 text-sm text-error">
              {displayUiText(error, displayLocale)}
            </p>
          )}
          {tab === 'profile' && (
            <ProfilePanel
              copy={copy}
              name={name}
              phone={phone}
              avatarUrl={avatarUrl}
              saving={saving}
              onName={setName}
              onPhone={setPhone}
              onSubmit={saveProfile}
              onAvatar={uploadAvatar}
            />
          )}
          {tab === 'preferences' && (
            <PreferencesPanel
              copy={copy}
              locale={locale}
              timezone={timezone}
              saving={saving}
              onLocale={setLocale}
              onTimezone={setTimezone}
              onSubmit={savePreferences}
            />
          )}
          {tab === 'organization' && activeOrganization && canManageOrganization && (
            <OrganizationPanel
              copy={copy}
              organizationName={organizationName}
              country={country}
              currency={currency}
              locale={organizationLocale}
              saving={saving}
              onName={setOrganizationName}
              onCountry={setCountry}
              onCurrency={setCurrency}
              onLocale={setOrganizationLocale}
              onSubmit={saveOrganization}
            />
          )}
          {tab === 'security' && (
            <SecurityPanel
              copy={copy}
              locale={displayLocale}
              timezone={profile?.timezone}
              sessions={sessions}
              loading={sessionsLoading}
              saving={saving}
              confirmAll={confirmAll}
              onRevoke={revokeEverywhere}
            />
          )}
        </div>
      </div>
    </WorkspaceFrame>
  );
}

function ProfilePanel(props: {
  copy: SettingsCopy;
  name: string;
  phone: string;
  avatarUrl: string | null;
  saving: boolean;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onAvatar: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-6">
      <section className="border-b border-border pb-7">
        <h2 className="text-xl font-bold">{props.copy.profile}</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">{props.copy.profileDetail}</p>
        <div className="mt-6 flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-primary/10 text-primary">
            {props.avatarUrl ? (
              <img
                src={props.avatarUrl}
                alt={props.copy.yourProfile}
                className="h-full w-full object-cover"
              />
            ) : (
              <CircleUserRound className="h-8 w-8" />
            )}
          </span>
          <div>
            <label
              htmlFor="avatar"
              className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold transition hover:bg-surface"
            >
              <Camera className="h-4 w-4" />
              {props.copy.changePhoto}
              <input
                id="avatar"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={props.onAvatar}
              />
            </label>
            <p className="mt-1.5 text-xs text-muted">{props.copy.photoFormat}</p>
          </div>
        </div>
      </section>
      <Field label={props.copy.name} htmlFor="settingsName">
        <input
          id="settingsName"
          value={props.name}
          onChange={(event) => props.onName(event.target.value)}
          required
          maxLength={120}
          className={inputClass}
        />
      </Field>
      <Field label={props.copy.phone} htmlFor="settingsPhone">
        <input
          id="settingsPhone"
          type="tel"
          value={props.phone}
          onChange={(event) => props.onPhone(event.target.value)}
          maxLength={50}
          className={inputClass}
        />
      </Field>
      <SaveButton copy={props.copy} saving={props.saving} label={props.copy.saveProfile} />
    </form>
  );
}

function PreferencesPanel(props: {
  copy: SettingsCopy;
  locale: 'en' | 'fr';
  timezone: string;
  saving: boolean;
  onLocale: (value: 'en' | 'fr') => void;
  onTimezone: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={props.onSubmit} className="space-y-6">
      <section className="border-b border-border pb-7">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Globe2 className="h-5 w-5 text-primary" />
          {props.copy.preferences}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">{props.copy.preferencesDetail}</p>
      </section>
      <Field label={props.copy.language} htmlFor="settingsLocale">
        <select
          id="settingsLocale"
          value={props.locale}
          onChange={(event) => props.onLocale(event.target.value as 'en' | 'fr')}
          className={inputClass}
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
      </Field>
      <Field label={props.copy.timezone} htmlFor="settingsTimezone">
        <select
          id="settingsTimezone"
          value={props.timezone}
          onChange={(event) => props.onTimezone(event.target.value)}
          className={inputClass}
        >
          <option value="Africa/Lagos">Lagos (WAT)</option>
          <option value="Africa/Accra">Accra (GMT)</option>
          <option value="Africa/Douala">Douala (WAT)</option>
          <option value="Africa/Porto-Novo">Porto-Novo (WAT)</option>
          <option value="Africa/Abidjan">Abidjan (GMT)</option>
        </select>
      </Field>
      <SaveButton copy={props.copy} saving={props.saving} label={props.copy.savePreferences} />
    </form>
  );
}

function OrganizationPanel(props: {
  copy: SettingsCopy;
  organizationName: string;
  country: string;
  currency: string;
  locale: 'en' | 'fr';
  saving: boolean;
  onName: (value: string) => void;
  onCountry: (value: string) => void;
  onCurrency: (value: string) => void;
  onLocale: (value: 'en' | 'fr') => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const { locale: uiLocale } = useLocale();
  return (
    <form onSubmit={props.onSubmit} className="space-y-6">
      <section className="border-b border-border pb-7">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Landmark className="h-5 w-5 text-primary" />
          {props.copy.organizationDefaults}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">{props.copy.organizationDetail}</p>
      </section>
      <Field label={props.copy.organizationName} htmlFor="settingsOrganization">
        <input
          id="settingsOrganization"
          value={props.organizationName}
          onChange={(event) => props.onName(event.target.value)}
          required
          maxLength={160}
          className={inputClass}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={props.copy.country} htmlFor="settingsCountry">
          <select
            id="settingsCountry"
            value={props.country}
            onChange={(event) => {
              props.onCountry(event.target.value);
              const market = findMarket(event.target.value);
              if (market) props.onCurrency(market.currency);
            }}
            className={inputClass}
          >
            {SUPPORTED_MARKETS.map((market) => (
              <option key={market.code} value={market.name}>
                {market.labels[uiLocale]}
              </option>
            ))}
            {!findMarket(props.country) && <option value={props.country}>{props.country}</option>}
          </select>
        </Field>
        <Field label={props.copy.defaultCurrency} htmlFor="settingsCurrency">
          <select
            id="settingsCurrency"
            value={props.currency}
            onChange={(event) => props.onCurrency(event.target.value)}
            className={inputClass}
          >
            <option value="NGN">
              NGN — {uiLocale === 'fr' ? 'naira nigérian' : 'Nigerian naira'}
            </option>
            <option value="GHS">
              GHS — {uiLocale === 'fr' ? 'cedi ghanéen' : 'Ghanaian cedi'}
            </option>
            <option value="XAF">
              XAF —{' '}
              {uiLocale === 'fr' ? 'franc CFA d’Afrique centrale' : 'Central African CFA franc'}
            </option>
            <option value="XOF">
              XOF —{' '}
              {uiLocale === 'fr' ? 'franc CFA d’Afrique de l’Ouest' : 'West African CFA franc'}
            </option>
            <option value="USD">
              USD — {uiLocale === 'fr' ? 'dollar américain' : 'US dollar'}
            </option>
            <option value="EUR">EUR — Euro</option>
          </select>
        </Field>
      </div>
      <Field label={props.copy.organizationLanguage} htmlFor="settingsOrganizationLocale">
        <select
          id="settingsOrganizationLocale"
          value={props.locale}
          onChange={(event) => props.onLocale(event.target.value as 'en' | 'fr')}
          className={inputClass}
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
      </Field>
      <SaveButton copy={props.copy} saving={props.saving} label={props.copy.saveOrganization} />
    </form>
  );
}

function SecurityPanel(props: {
  copy: SettingsCopy;
  locale: 'en' | 'fr' | undefined;
  timezone: string | undefined;
  sessions: SessionInfo[];
  loading: boolean;
  saving: boolean;
  confirmAll: boolean;
  onRevoke: () => void;
}) {
  return (
    <section>
      <div className="border-b border-border pb-7">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <ShieldCheck className="h-5 w-5 text-primary" />
          {props.copy.security}
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-muted">{props.copy.securityDetail}</p>
      </div>
      <div className="py-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-bold">{props.copy.activeSessions}</h3>
            <p className="mt-1 text-sm text-muted">{props.copy.sessionsDetail}</p>
          </div>
          {props.loading ? (
            <LoaderCircle className="h-5 w-5 animate-spin text-muted" />
          ) : (
            <span className="rounded-full bg-surface px-2.5 py-1 text-sm font-semibold text-foreground">
              {props.sessions.length}
            </span>
          )}
        </div>
        {!props.loading && props.sessions.length > 0 && (
          <ul className="mt-5 divide-y divide-border border-y border-border">
            {props.sessions.map((session) => (
              <li key={session.id} className="py-3 text-sm">
                <p className="font-semibold text-foreground">
                  {props.copy.signedIn}{' '}
                  {formatAccountDate(session.createdAt, props.locale, props.timezone)}
                </p>
                <p className="mt-1 text-muted">
                  {props.copy.expires}{' '}
                  {formatAccountDate(session.expiresAt, props.locale, props.timezone)}
                  {session.userAgent ? ` · ${shortAgent(session.userAgent)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="rounded-xl border border-error/30 bg-error/5 p-5">
        <h3 className="font-bold">{props.copy.signOutEverywhere}</h3>
        <p className="mt-1.5 max-w-xl text-sm leading-6 text-muted">{props.copy.signOutDetail}</p>
        <button
          type="button"
          disabled={props.saving}
          onClick={props.onRevoke}
          className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg border border-error/50 px-3 text-sm font-bold text-error transition hover:bg-error/10 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          {props.confirmAll ? props.copy.confirmSignOutEverywhere : props.copy.signOutEverywhere}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-semibold text-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
function SaveButton({
  copy,
  saving,
  label,
}: {
  copy: SettingsCopy;
  saving: boolean;
  label: string;
}) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-hover disabled:opacity-60"
    >
      {saving ? copy.saving : label}
    </button>
  );
}
function messageFor(error: unknown, copy: SettingsCopy): string {
  return error instanceof ApiError ? error.message : copy.genericError;
}
function shortAgent(value: string): string {
  return value.length > 68 ? `${value.slice(0, 65)}…` : value;
}

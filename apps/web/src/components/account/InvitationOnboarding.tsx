'use client';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useLocale, LanguageSwitcher } from '../LocaleProvider';
import { AccountLoading, AccountRecovery } from './WorkspaceFrame';
import { PartnerTermsDialog } from '../terms/PartnerTermsDialog';
import { loadPartnerTerms, getTermsCopy, type PartnerTermsDocument } from '../../lib/partner-terms';
import {
  myInvitations,
  invitationDetail,
  accountTypeLabel,
  hasAcceptedMembership,
  invitationRole,
  type Invitation,
} from '../../lib/invitations-api';
import { SUPPORTED_MARKETS, findMarket } from '../../lib/markets';
import { apiJson, ApiError } from '../../lib/api';
const input =
  'mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
export function InvitationOnboarding({ redirectExisting = false }: { redirectExisting?: boolean }) {
  const router = useRouter(),
    {
      ready,
      profile,
      activeOrganization,
      refreshAccount,
      switchOrganization,
      signOut,
      sessionRecoveryError,
    } = useAuth(),
    { locale } = useLocale(),
    fr = locale === 'fr';
  const [items, setItems] = useState<Invitation[]>([]),
    [selected, setSelected] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [timezone, setTimezone] = useState('Africa/Lagos');
  const acceptanceUnresolved = useRef(false);
  const initializedProfile = useRef<string | null>(null);
  const [company, setCompany] = useState(''),
    [country, setCountry] = useState('Nigeria'),
    [currency, setCurrency] = useState('NGN');
  const [recoveryInvite, setRecoveryInvite] = useState<Invitation | null>(null);
  const [terms, setTerms] = useState<PartnerTermsDocument | null>(null),
    [termsFailed, setTermsFailed] = useState(false),
    [termsRetry, setTermsRetry] = useState(0),
    [accepted, setAccepted] = useState(false),
    [termsOpen, setTermsOpen] = useState(false);
  const invite = items.find((i) => i.id === selected),
    termsCopy = getTermsCopy(locale);
  useEffect(() => {
    if (ready && !profile && !sessionRecoveryError) router.replace('/sign-in');
  }, [ready, profile, sessionRecoveryError, router]);
  useEffect(() => {
    // A locale save refreshes the profile; keep the recipient's unfinished form intact.
    if (profile && initializedProfile.current !== profile.id) {
      initializedProfile.current = profile.id;
      setName(
        profile.name === profile.email || profile.name === profile.email.split('@')[0]
          ? ''
          : profile.name,
      );
      setPhone(profile.phone ?? '');
      setTimezone(profile.timezone);
    }
  }, [profile]);
  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const r = await myInvitations();
      setItems(r.items);
      setSelected((current) =>
        r.items.some((i) => i.id === current)
          ? current
          : (r.items.find((i) => i.status === 'pending')?.id ?? ''),
      );
      if (
        redirectExisting &&
        activeOrganization &&
        r.items.length === 0 &&
        !acceptanceUnresolved.current
      )
        router.replace('/dashboard');
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : fr
            ? 'Impossible de charger vos invitations.'
            : 'Could not load your invitations.',
      );
    } finally {
      setLoading(false);
    }
  }, [profile, redirectExisting, activeOrganization, router, fr]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setTerms(null);
    setAccepted(false);
    setTermsFailed(false);
    if (!invite?.initialOwner) return;
    const c = new AbortController();
    loadPartnerTerms(locale, c.signal)
      .then((d) => {
        if (!c.signal.aborted) setTerms(d);
      })
      .catch(() => {
        if (!c.signal.aborted) setTermsFailed(true);
      });
    return () => c.abort();
  }, [invite?.id, invite?.initialOwner, locale, termsRetry]);
  async function reconcile(invitation: Invitation) {
    const current = await invitationDetail(invitation.id);
    if (!current.organizationId) return false;
    const memberships =
      await apiJson<Array<{ organizationId: string; role: string }>>('/api/me/organizations');
    if (!hasAcceptedMembership(current, memberships)) return false;
    await refreshAccount();
    await switchOrganization(current.organizationId);
    router.replace('/dashboard');
    return true;
  }
  async function retryRecovery() {
    if (!recoveryInvite || busy) return;
    setBusy(true);
    setError('');
    try {
      if (await reconcile(recoveryInvite)) return;
      await load();
      setError(
        fr
          ? 'L’accès n’est pas encore confirmé. Vérifiez à nouveau ou réessayez l’acceptation.'
          : 'Workspace access is not confirmed yet. Check again or retry accepting the invitation.',
      );
    } catch {
      setError(
        fr
          ? 'Impossible de vérifier votre accès. Réessayez.'
          : 'Could not check workspace access. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function accept(e: FormEvent) {
    e.preventDefault();
    if (!invite || invite.status !== 'pending' || busy) return;
    if (invite.initialOwner && (!terms || (terms.acceptanceRequired && !accepted))) {
      setError(termsCopy.required);
      return;
    }
    acceptanceUnresolved.current = true;
    setBusy(true);
    setError('');
    try {
      if (invite.kind !== 'account')
        await apiJson('/api/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), phone: phone.trim(), locale, timezone }),
        });
      const result = await apiJson<{ organizationId: string }>(
        `/api/invitations/${invite.id}/accept`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            locale,
            ...(invite.kind === 'account'
              ? {
                  profile: { name: name.trim(), phone: phone.trim(), locale, timezone },
                  organization: {
                    name: company.trim(),
                    country,
                    defaultCurrency: currency,
                    defaultLocale: locale,
                  },
                }
              : {}),
            ...(invite.initialOwner && terms?.acceptanceRequired
              ? {
                  partnerTerms: {
                    version: terms.version,
                    locale: terms.locale,
                    expectedDigest: terms.digest,
                    accepted: true,
                    authorityConfirmed: true,
                  },
                }
              : {}),
          }),
        },
      );
      await refreshAccount();
      await switchOrganization(result.organizationId);
      router.replace('/dashboard');
    } catch (e) {
      // Preserve the intended membership while an uncertain acceptance is reconciled.
      setRecoveryInvite(invite);
      try {
        if (await reconcile(invite)) return;
        await load();
      } catch {
        /* Keep the target and show a read-only recovery action. */
      }
      setError(
        e instanceof ApiError
          ? e.message
          : fr
            ? 'Impossible d’accepter l’invitation.'
            : 'Could not accept the invitation.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (sessionRecoveryError)
    return <AccountRecovery locale={locale} onRetry={refreshAccount} onSignOut={signOut} />;
  if (!ready || !profile) return <AccountLoading locale={locale} />;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-black text-white shadow-lg shadow-primary/20">
              A
            </span>
            <span className="text-base font-extrabold uppercase tracking-tight">Abonten</span>
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label={fr ? 'Se déconnecter' : 'Sign out'}
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted transition hover:bg-surface hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              <LogOut aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">{fr ? 'Se déconnecter' : 'Sign out'}</span>
            </button>
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        <h1 className="text-3xl font-extrabold">{fr ? 'Vos invitations' : 'Your invitations'}</h1>
        <p className="mt-3 text-muted">
          {fr
            ? 'Rejoignez une organisation avec une invitation adressée à votre email.'
            : 'Join an organization using an invitation sent to your email.'}
        </p>
        {activeOrganization && (
          <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-primary">
            {fr ? 'Retour à votre espace' : 'Back to your workspace'}
          </Link>
        )}
        {error && (
          <p role="alert" className="mt-5 rounded-lg bg-error/10 p-3 text-error">
            {error}
          </p>
        )}
        {recoveryInvite && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void retryRecovery()}
            className="mt-4 min-h-11 rounded-lg border border-border px-4 font-semibold"
          >
            {fr ? 'Vérifier l’accès à mon espace' : 'Check workspace access'}
          </button>
        )}
        {loading ? (
          <p className="mt-8 text-muted">{fr ? 'Chargement…' : 'Loading…'}</p>
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-xl border border-border bg-surface p-6">
            <h2 className="font-bold">
              {fr ? 'Aucune invitation en attente' : 'No pending invitations'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {fr
                ? 'Demandez à votre contact Abonten de vous inviter avec cette adresse email. La création libre d’organisation n’est pas disponible.'
                : 'Ask your Abonten contact to invite this email address. Organizations are admitted by invitation.'}
            </p>
            <button
              onClick={() => void load()}
              className="mt-4 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold"
            >
              {fr ? 'Actualiser' : 'Refresh'}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(e) => void accept(e)}
            className="mt-8 grid items-start gap-6 lg:grid-cols-3 lg:gap-8"
          >
            <fieldset className="min-w-0 space-y-3">
              <legend className="mb-3 font-bold">{fr ? 'Invitation' : 'Invitation'}</legend>
              {items.map((i) => (
                <label
                  key={i.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${i.id === selected ? 'border-primary bg-primary/5' : 'border-border bg-surface'}`}
                >
                  <input
                    type="radio"
                    name="invitation"
                    value={i.id}
                    checked={selected === i.id}
                    disabled={i.status !== 'pending' || busy}
                    onChange={() => setSelected(i.id)}
                    className="mt-1 accent-primary"
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    <span className="block font-bold">
                      {i.kind === 'account'
                        ? accountTypeLabel(i.accountType ?? i.organizationType, fr)
                        : i.organizationName}
                    </span>
                    <span className="mt-1 block text-sm text-muted">
                      {i.kind === 'account'
                        ? fr
                          ? 'Nouveau compte'
                          : 'New account'
                        : invitationRole(i.role, fr)}{' '}
                      · {i.email}
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {i.status === 'expired'
                        ? fr
                          ? 'Expirée — demandez un nouvel envoi.'
                          : 'Expired — ask for a resend.'
                        : (fr ? 'Expire le ' : 'Expires ') +
                          new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', {
                            dateStyle: 'medium',
                            timeZone: 'UTC',
                          }).format(new Date(i.expiresAt))}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {invite && (
              <div className="min-w-0 space-y-6 lg:col-span-2">
                <section className="rounded-xl border border-border bg-surface p-5">
                  <h2 className="font-bold">{fr ? 'Votre profil' : 'Your profile'}</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold">
                      {fr ? 'Nom complet' : 'Full name'}
                      <input
                        className={input}
                        value={name}
                        required
                        maxLength={120}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      {fr ? 'Téléphone (facultatif)' : 'Phone (optional)'}
                      <input
                        className={input}
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </label>
                    <label className="text-sm font-semibold">
                      {fr ? 'Fuseau horaire' : 'Timezone'}
                      <input
                        className={input}
                        value={timezone}
                        required
                        onChange={(e) => setTimezone(e.target.value)}
                      />
                    </label>
                  </div>
                </section>
                {invite.kind === 'account' && (
                  <section className="rounded-xl border border-border bg-surface p-5">
                    <h2 className="font-bold">{fr ? 'Votre entreprise' : 'Your company'}</h2>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-semibold">
                        {fr ? 'Raison sociale' : 'Company name'}
                        <input
                          className={input}
                          value={company}
                          required
                          maxLength={160}
                          onChange={(e) => setCompany(e.target.value)}
                        />
                      </label>
                      <label className="text-sm font-semibold">
                        {fr ? 'Pays' : 'Country'}
                        <select
                          className={input}
                          value={country}
                          onChange={(e) => {
                            setCountry(e.target.value);
                            setCurrency(findMarket(e.target.value)?.currency ?? 'NGN');
                          }}
                        >
                          {SUPPORTED_MARKETS.map((m) => (
                            <option key={m.code} value={m.name}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-semibold">
                        {fr ? 'Devise' : 'Currency'}
                        <select
                          className={input}
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value)}
                        >
                          {['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'].map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </section>
                )}
                {invite.initialOwner && (
                  <section className="rounded-xl border border-border p-5">
                    <h2 className="font-bold">{termsCopy.heading}</h2>
                    {terms ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setTermsOpen(true)}
                          className="mt-2 min-h-11 text-sm font-semibold text-primary"
                        >
                          {termsCopy.read}
                        </button>
                        {terms.acceptanceRequired ? (
                          <label className="mt-3 flex items-start gap-3 text-sm">
                            <input
                              type="checkbox"
                              checked={accepted}
                              onChange={(e) => setAccepted(e.target.checked)}
                              className="mt-1 accent-primary"
                            />
                            {terms.acceptanceMode === 'preview'
                              ? termsCopy.previewAccept
                              : termsCopy.accept}
                          </label>
                        ) : (
                          <p className="text-sm text-muted">{termsCopy.disabled}</p>
                        )}
                        <PartnerTermsDialog
                          open={termsOpen}
                          document={terms}
                          onClose={() => setTermsOpen(false)}
                        />
                      </>
                    ) : termsFailed ? (
                      <>
                        <p role="alert" className="mt-2 text-sm text-error">
                          {termsCopy.loadError}
                        </p>
                        <button
                          type="button"
                          onClick={() => setTermsRetry((n) => n + 1)}
                          className="mt-2 min-h-11 text-sm font-semibold"
                        >
                          {termsCopy.retry}
                        </button>
                      </>
                    ) : (
                      <p className="mt-2 text-sm text-muted">{termsCopy.loading}</p>
                    )}
                  </section>
                )}
                <button
                  disabled={
                    busy ||
                    invite.status !== 'pending' ||
                    (invite.initialOwner && (!terms || (terms.acceptanceRequired && !accepted)))
                  }
                  className="min-h-11 rounded-lg bg-primary px-5 font-bold text-white disabled:opacity-50"
                >
                  {busy
                    ? fr
                      ? 'Ouverture de votre espace…'
                      : 'Opening your workspace…'
                    : fr
                      ? 'Accepter et continuer'
                      : 'Accept invitation and continue'}
                </button>
              </div>
            )}
          </form>
        )}
      </main>
    </div>
  );
}

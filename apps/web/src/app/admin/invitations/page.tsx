'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { WorkspaceFrame } from '../../../components/account/WorkspaceFrame';
import { useAuth } from '../../../components/auth/AuthProvider';
import { useLocale } from '../../../components/LocaleProvider';
import { apiJson, ApiError } from '../../../lib/api';
import {
  adminInvitations,
  accountTypeLabel,
  invitationRole,
  type Invitation,
} from '../../../lib/invitations-api';
const input =
  'mt-1 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';
export default function InvitationsPage() {
  const { capabilities, activeOrganization } = useAuth(),
    { locale } = useLocale(),
    fr = locale === 'fr',
    allowed = capabilities.includes('PLATFORM_ADMIN');
  const [items, setItems] = useState<Invitation[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false),
    [email, setEmail] = useState(''),
    [accountType, setAccountType] = useState('media_partner'),
    [pendingBody, setPendingBody] = useState<string | null>(null);
  const requestKey = useRef<string | null>(null);
  const inviteButton = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (formOpen) {
      form.current
        ?.querySelector<HTMLElement>('select:not(:disabled), button:not(:disabled)')
        ?.focus();
    }
  }, [formOpen]);
  function closeForm() {
    setFormOpen(false);
    inviteButton.current?.focus();
  }
  const load = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const result = await adminInvitations(page);
      setItems(result.items);
      setTotal(result.total);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : fr
            ? 'Impossible de charger les invitations.'
            : 'Could not load invitations.',
      );
    } finally {
      setLoading(false);
    }
  }, [allowed, page, fr]);
  useEffect(() => {
    void load();
  }, [load, activeOrganization?.organizationId]);
  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy('create');
    setError('');
    setNotice('');
    requestKey.current ??= crypto.randomUUID();
    const body =
      pendingBody ??
      JSON.stringify({
        email: email.trim(),
        accountType,
        locale: fr ? 'fr' : 'en',
        clientRequestId: requestKey.current,
      });
    setPendingBody(body);
    try {
      const row = await apiJson<Invitation>('/api/admin/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      setNotice(
        row.delivery === 'sent'
          ? fr
            ? 'Invitation envoyée.'
            : 'Invitation sent.'
          : fr
            ? 'Invitation enregistrée. Échec de l’envoi ; utilisez Renvoyer.'
            : 'Invitation saved. Email could not be sent; use Resend to retry.',
      );
      requestKey.current = null;
      setPendingBody(null);
      setEmail('');
      closeForm();
      await load();
    } catch (e) {
      if (e instanceof ApiError && [400, 403, 404, 409, 422].includes(e.status)) {
        requestKey.current = null;
        setPendingBody(null);
      }
      setError(
        e instanceof ApiError
          ? e.message
          : fr
            ? 'Impossible de créer l’invitation.'
            : 'Could not create the invitation.',
      );
    } finally {
      setBusy('');
    }
  }
  async function change(i: Invitation, action: 'resend' | 'revoke') {
    if (busy) return;
    if (
      action === 'revoke' &&
      !window.confirm(
        fr ? `Révoquer l’invitation de ${i.email} ?` : `Revoke the invitation for ${i.email}?`,
      )
    )
      return;
    setBusy(i.id);
    setError('');
    setNotice('');
    try {
      const row = await apiJson<Invitation>(`/api/admin/invitations/${i.id}/${action}`, {
        method: 'POST',
      });
      setNotice(
        action === 'revoke'
          ? fr
            ? 'Invitation révoquée.'
            : 'Invitation revoked.'
          : row.delivery === 'sent'
            ? fr
              ? 'Invitation renvoyée ; validité de sept jours.'
              : 'Invitation resent; valid for seven days.'
            : fr
              ? 'Invitation renouvelée, mais échec de l’envoi.'
              : 'Invitation renewed, but email could not be sent.',
      );
      await load();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : fr
            ? 'Impossible de modifier l’invitation.'
            : 'Could not update the invitation.',
      );
    } finally {
      setBusy('');
    }
  }
  const status: Record<string, string> = fr
    ? { pending: 'En attente', expired: 'Expirée', accepted: 'Acceptée', revoked: 'Révoquée' }
    : { pending: 'Pending', expired: 'Expired', accepted: 'Accepted', revoked: 'Revoked' };
  return (
    <WorkspaceFrame current="review">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">{fr ? 'Invitations' : 'Invitations'}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            {fr
              ? 'Invitez les partenaires et les équipes. L’accès commence après vérification de l’email et acceptation.'
              : 'Invite partners and team members. Access starts after email verification and acceptance.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/review"
            className="rounded-lg border border-border px-4 py-3 text-sm font-semibold"
          >
            {fr ? 'Examiner l’inventaire' : 'Inventory review'}
          </Link>
          {allowed && (
            <button
              ref={inviteButton}
              type="button"
              aria-expanded={formOpen}
              aria-controls="new-account-invitation"
              onClick={() => (formOpen ? closeForm() : setFormOpen(true))}
              className="min-h-11 rounded-lg bg-primary px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {formOpen
                ? fr
                  ? 'Masquer le formulaire'
                  : 'Hide form'
                : pendingBody || email
                  ? fr
                    ? 'Reprendre l’invitation'
                    : 'Resume invitation'
                  : fr
                    ? 'Inviter un compte'
                    : 'Invite account'}
            </button>
          )}
        </div>
      </div>
      {!allowed ? (
        <p role="alert">
          {fr
            ? 'Accès réservé aux administrateurs de la plateforme.'
            : 'Platform administrator access is required.'}
        </p>
      ) : (
        <>
          {error && (
            <p role="alert" className="mb-5 rounded-lg bg-error/10 p-3 text-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mb-5 rounded-lg bg-success/10 p-3 text-success">
              {notice}
            </p>
          )}
          <form
            ref={form}
            id="new-account-invitation"
            hidden={!formOpen}
            aria-labelledby="new-account-invitation-heading"
            onSubmit={(e) => void create(e)}
            className="rounded-xl border border-border bg-surface p-5"
          >
            <h2 id="new-account-invitation-heading" className="font-bold">
              {fr ? 'Inviter un nouveau compte' : 'Invite a new account'}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {fr
                ? 'Le destinataire renseigne son profil et son entreprise. L’invitation expire après sept jours.'
                : 'The recipient completes their profile and company details. Invitations expire after seven days.'}
            </p>
            {pendingBody && (
              <p role="status" className="mt-3 text-sm text-muted">
                {fr
                  ? 'Réessayez pour retrouver cette invitation avant d’en commencer une autre.'
                  : 'Retry to recover this invitation before starting another.'}
              </p>
            )}
            <fieldset
              disabled={Boolean(busy) || Boolean(pendingBody)}
              className="mt-5 grid max-w-3xl gap-4 sm:grid-cols-2"
            >
              <label className="text-sm font-semibold">
                {fr ? 'Type de compte' : 'Account type'}
                <select
                  className={input}
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                >
                  <option value="media_partner">{accountTypeLabel('media_partner', fr)}</option>
                  <option value="agency">{accountTypeLabel('agency', fr)}</option>
                  <option value="brand">{accountTypeLabel('brand', fr)}</option>
                </select>
              </label>
              <label className="text-sm font-semibold">
                {fr ? 'Email' : 'Email'}
                <input
                  className={input}
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nora@harbourline.example"
                />
              </label>
            </fieldset>
            <button
              disabled={Boolean(busy)}
              className="mt-5 min-h-11 rounded-lg bg-primary px-5 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === 'create'
                ? fr
                  ? 'Envoi…'
                  : 'Sending…'
                : pendingBody
                  ? fr
                    ? 'Réessayer cette invitation'
                    : 'Retry this invitation'
                  : fr
                    ? 'Envoyer l’invitation'
                    : 'Send invitation'}
            </button>
          </form>
          <section className={formOpen ? 'mt-8' : ''}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">
                {fr ? 'Invitations récentes' : 'Recent invitations'}
              </h2>
              <button onClick={() => void load()} className="min-h-11 px-3 text-sm font-semibold">
                {fr ? 'Actualiser' : 'Refresh'}
              </button>
            </div>
            {loading ? (
              <p className="py-6 text-muted">{fr ? 'Chargement…' : 'Loading…'}</p>
            ) : items.length === 0 ? (
              <p className="py-6 text-muted">
                {fr ? 'Aucune invitation pour le moment.' : 'No invitations yet.'}
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-surface">
                    <tr>
                      {(fr
                        ? [
                            'Personne',
                            'Compte / organisation',
                            'État',
                            'Expiration (UTC)',
                            'Email',
                            'Actions',
                          ]
                        : [
                            'Person',
                            'Account / organization',
                            'Status',
                            'Expires (UTC)',
                            'Email',
                            'Actions',
                          ]
                      ).map((x) => (
                        <th key={x} className="p-3 font-semibold">
                          {x}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => (
                      <tr key={i.id} className="border-t border-border">
                        <td className="p-3">
                          <p className="font-semibold">{i.name || i.email}</p>
                          {i.name && <p className="mt-1 text-xs text-muted">{i.email}</p>}
                        </td>
                        <td className="p-3">
                          <p>
                            {i.kind === 'account'
                              ? accountTypeLabel(i.accountType ?? i.organizationType, fr)
                              : i.organizationName}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {i.kind === 'account'
                              ? i.organizationName ||
                                (fr
                                  ? 'Détails à compléter par le destinataire'
                                  : 'Recipient completes details')
                              : invitationRole(i.role, fr)}
                          </p>
                        </td>
                        <td className="p-3">
                          <span
                            className={
                              i.status === 'accepted'
                                ? 'text-success'
                                : i.status === 'pending'
                                  ? 'text-warning'
                                  : 'text-muted'
                            }
                          >
                            {status[i.status]}
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {new Intl.DateTimeFormat(fr ? 'fr-FR' : 'en-GB', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                            timeZone: 'UTC',
                          }).format(new Date(i.expiresAt))}
                        </td>
                        <td className="p-3">
                          {i.delivery === 'sent'
                            ? fr
                              ? 'Envoyé'
                              : 'Sent'
                            : i.delivery === 'failed'
                              ? fr
                                ? 'Échec'
                                : 'Failed'
                              : fr
                                ? 'Non envoyé'
                                : 'Not sent'}
                        </td>
                        <td className="p-3">
                          {['pending', 'expired'].includes(i.status) && (
                            <div className="flex gap-2">
                              <button
                                disabled={Boolean(busy)}
                                onClick={() => void change(i, 'resend')}
                                className="min-h-11 rounded-lg border border-border px-3 font-semibold disabled:opacity-50"
                              >
                                {fr ? 'Renvoyer' : 'Resend'}
                              </button>
                              <button
                                disabled={Boolean(busy)}
                                onClick={() => void change(i, 'revoke')}
                                className="min-h-11 rounded-lg px-3 font-semibold text-error disabled:opacity-50"
                              >
                                {fr ? 'Révoquer' : 'Revoke'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex items-center gap-4">
              <button
                disabled={page === 1 || loading}
                onClick={() => setPage((p) => p - 1)}
                className="min-h-11 px-3 text-sm disabled:opacity-40"
              >
                {fr ? 'Précédent' : 'Previous'}
              </button>
              <span className="text-sm text-muted">
                {page} / {Math.max(1, Math.ceil(total / 50))}
              </span>
              <button
                disabled={page * 50 >= total || loading}
                onClick={() => setPage((p) => p + 1)}
                className="min-h-11 px-3 text-sm disabled:opacity-40"
              >
                {fr ? 'Suivant' : 'Next'}
              </button>
            </div>
          </section>
        </>
      )}
    </WorkspaceFrame>
  );
}

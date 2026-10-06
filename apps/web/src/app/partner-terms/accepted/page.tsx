'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FileCheck2 } from 'lucide-react';
import { useAuth } from '../../../components/auth/AuthProvider';
import { WorkspaceFrame } from '../../../components/account/WorkspaceFrame';
import { PartnerTermsDialog } from '../../../components/terms/PartnerTermsDialog';
import { ApiError, apiJson } from '../../../lib/api';
import {
  getTermsCopy,
  loadPartnerTerms,
  type PartnerTermsDocument,
} from '../../../lib/partner-terms';

interface AcceptanceRecord {
  id: string;
  organizationId: string;
  userId: string;
  organizationName: string;
  representativeName: string;
  version: string;
  locale: 'en' | 'fr';
  digest: string;
  eventKind: 'preview_acknowledgement' | 'approved_acceptance';
  acceptedAt: string;
  contentCopy: PartnerTermsDocument;
}
export default function AcceptedPartnerTermsPage() {
  const { activeOrganization, profile } = useAuth();
  const locale = profile?.locale ?? 'en';
  const french = locale === 'fr';
  const [records, setRecords] = useState<AcceptanceRecord[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [currentTerms, setCurrentTerms] = useState<PartnerTermsDocument | null>(null);
  const [currentTermsFailed, setCurrentTermsFailed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState('');
  const [readCurrent, setReadCurrent] = useState(false);
  const pendingRequest = useRef<AbortController | null>(null);
  const termsCopy = getTermsCopy(locale);
  const [selected, setSelected] = useState<AcceptanceRecord | null>(null);
  useEffect(() => {
    setRecords(null);
    setFailed(false);
    setSelected(null);
    setCurrentTerms(null);
    setCurrentTermsFailed(false);
    setAccepted(false);
    setAcceptError('');
    setReadCurrent(false);
    setAccepting(false);
    if (!activeOrganization || activeOrganization.type !== 'media_partner') return;
    const controller = new AbortController();
    apiJson<AcceptanceRecord[]>(`/api/orgs/${activeOrganization.organizationId}/partner-terms`, {
      signal: controller.signal,
      headers: { 'X-Org-Id': activeOrganization.organizationId },
    })
      .then((value) => {
        if (!controller.signal.aborted) setRecords(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    loadPartnerTerms(locale, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setCurrentTerms(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCurrentTermsFailed(true);
      });
    return () => {
      controller.abort();
      pendingRequest.current?.abort();
      pendingRequest.current = null;
    };
  }, [activeOrganization?.organizationId, activeOrganization?.type, locale, retry]);
  const acknowledge = async () => {
    if (!currentTerms || !accepted || !activeOrganization || pendingRequest.current) return;
    const controller = new AbortController();
    pendingRequest.current = controller;
    setAccepting(true);
    setAcceptError('');
    try {
      await apiJson(`/api/orgs/${activeOrganization.organizationId}/partner-terms`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Org-Id': activeOrganization.organizationId,
        },
        body: JSON.stringify({
          version: currentTerms.version,
          locale: currentTerms.locale,
          expectedDigest: currentTerms.digest,
          accepted: true,
          authorityConfirmed: true,
        }),
      });
      if (!controller.signal.aborted) setRetry((value) => value + 1);
    } catch (caught) {
      if (!controller.signal.aborted && caught instanceof ApiError && caught.status === 409) {
        setAccepted(false);
        setReadCurrent(false);
        setCurrentTerms(null);
        setAcceptError(caught.message);
        try {
          const latest = await loadPartnerTerms(locale, controller.signal);
          if (!controller.signal.aborted) setCurrentTerms(latest);
        } catch {
          if (!controller.signal.aborted) setCurrentTermsFailed(true);
        }
        return;
      }
      if (!controller.signal.aborted)
        setAcceptError(
          french
            ? 'La confirmation n’a pas pu être enregistrée. Réessayez ; elle ne sera pas dupliquée.'
            : 'Could not save your confirmation. Retry safely; it will not be duplicated.',
        );
    } finally {
      if (pendingRequest.current === controller) pendingRequest.current = null;
      if (!controller.signal.aborted) setAccepting(false);
    }
  };
  const needsCurrent =
    currentTerms?.acceptanceRequired &&
    records &&
    !records.some(
      (record) =>
        record.organizationId === activeOrganization?.organizationId &&
        record.version === currentTerms.version,
    );
  return (
    <WorkspaceFrame current="settings">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/settings"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          ← {french ? 'Paramètres de l’organisation' : 'Organization settings'}
        </Link>
        <h1 className="mt-5 text-2xl font-bold">
          {french ? 'Dossier des conditions partenaires' : 'Partner terms record'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          {french
            ? 'Les versions exactes et les confirmations de votre organisation restent accessibles ici. Les accusés de lecture du projet ne constituent pas une acceptation juridique.'
            : 'Your organization’s exact versions and affirmative records remain available here. Draft preview acknowledgements are not legal acceptance.'}
        </p>
        {acceptError && !needsCurrent && (
          <p role="alert" className="mt-4 text-sm text-error">
            {acceptError}
          </p>
        )}
        {currentTermsFailed && (
          <div role="alert" className="mt-5 rounded-lg border border-border bg-surface p-4 text-sm">
            <p>
              {termsCopy.readerLoadError}{' '}
              {french
                ? 'Les copies déjà enregistrées restent accessibles ci-dessous.'
                : 'Recorded copies remain available below.'}
            </p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="mt-2 min-h-11 rounded-lg px-2 font-semibold text-primary"
            >
              {termsCopy.retry}
            </button>
          </div>
        )}
        {needsCurrent && activeOrganization?.role === 'org_owner' && (
          <section
            className="mt-7 rounded-xl border border-border bg-surface-2 p-5"
            aria-label={termsCopy.heading}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">
                {french ? 'Version actuelle à consulter' : 'Current version to review'}
              </h2>
              <button
                type="button"
                onClick={() => setReadCurrent(true)}
                className="min-h-11 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/5"
              >
                {termsCopy.read}
              </button>
            </div>
            <p className="mt-2 break-words text-xs font-semibold text-muted">
              {currentTerms?.version}
            </p>
            {currentTerms?.status === 'review_draft' && (
              <p className="mt-3 text-sm leading-6 text-muted">{termsCopy.draftNotice}</p>
            )}
            {currentTerms?.translationStatus === 'translation_for_review' && (
              <p className="mt-2 text-xs leading-5 text-muted">{termsCopy.translationNotice}</p>
            )}
            <label className="mt-4 flex items-start gap-3 text-sm leading-6">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 accent-primary"
              />
              <span>
                {currentTerms?.acceptanceMode === 'preview'
                  ? termsCopy.previewAccept
                  : termsCopy.accept}
              </span>
            </label>
            {acceptError && (
              <p role="alert" className="mt-3 text-sm text-error">
                {acceptError}
              </p>
            )}
            <button
              type="button"
              onClick={() => void acknowledge()}
              disabled={!accepted || accepting}
              className="mt-4 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {accepting
                ? french
                  ? 'Enregistrement…'
                  : 'Saving…'
                : currentTerms?.acceptanceMode === 'preview'
                  ? french
                    ? 'Enregistrer l’accusé de lecture'
                    : 'Save preview acknowledgement'
                  : french
                    ? 'Accepter cette version'
                    : 'Accept this version'}
            </button>
          </section>
        )}
        {needsCurrent && activeOrganization?.role !== 'org_owner' && (
          <p className="mt-5 text-sm text-muted">
            {french
              ? 'Le propriétaire de l’organisation doit consulter et confirmer la version actuelle.'
              : 'An organization owner needs to review and affirm the current version.'}
          </p>
        )}
        {activeOrganization?.type !== 'media_partner' ? (
          <p className="mt-7 rounded-xl border border-border bg-surface p-5 text-sm text-muted">
            {french
              ? 'Les conditions partenaires concernent les organisations de partenaires médias.'
              : 'Partner terms apply to media partner organizations.'}
          </p>
        ) : failed ? (
          <div role="alert" className="mt-7 rounded-xl border border-border bg-surface p-5">
            <p className="text-sm">
              {french ? 'Impossible de charger le dossier.' : 'Could not load your record.'}
            </p>
            <button
              type="button"
              onClick={() => setRetry((value) => value + 1)}
              className="mt-3 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white"
            >
              {french ? 'Réessayer' : 'Retry'}
            </button>
          </div>
        ) : records === null ? (
          <p role="status" className="mt-7 text-sm text-muted">
            {french ? 'Chargement du dossier…' : 'Loading your record…'}
          </p>
        ) : records.length === 0 ? (
          <div className="mt-7 rounded-xl border border-border bg-surface p-5">
            <p className="text-sm text-muted">
              {french
                ? 'Aucune acceptation n’a été enregistrée pour cette organisation. Aucun consentement n’a été déduit de la création du compte.'
                : 'No acceptance has been recorded for this organization. Account creation was not treated as consent.'}
            </p>
            <Link
              href="/partner-terms"
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
            >
              {french ? 'Consulter le projet actuel' : 'Read the current draft'}
            </Link>
          </div>
        ) : (
          <ul className="mt-7 space-y-4">
            {records
              .filter((record) => record.organizationId === activeOrganization?.organizationId)
              .map((record) => (
                <li key={record.id} className="rounded-xl border border-border bg-surface-2 p-5">
                  <div className="flex items-start gap-3">
                    <FileCheck2
                      aria-hidden="true"
                      className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                    />
                    <div className="min-w-0">
                      <p className="break-words font-semibold">{record.version}</p>
                      <p className="mt-1 text-xs font-semibold text-muted">
                        {record.eventKind === 'preview_acknowledgement'
                          ? french
                            ? 'Accusé de lecture en prévisualisation · non contraignant'
                            : 'Preview acknowledgement · nonbinding'
                          : french
                            ? 'Acceptation enregistrée'
                            : 'Acceptance recorded'}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-muted">
                    {record.representativeName} · {record.organizationName}
                    <br />
                    {new Intl.DateTimeFormat(french ? 'fr-FR' : 'en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: profile?.timezone ?? 'UTC',
                    }).format(new Date(record.acceptedAt))}{' '}
                    · {record.locale === 'fr' ? 'Français' : 'English'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSelected(record)}
                    className="mt-3 min-h-11 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {french ? 'Lire la copie enregistrée' : 'Read the recorded copy'}
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
      {readCurrent && currentTerms && (
        <PartnerTermsDialog
          open
          document={currentTerms}
          onClose={() => setReadCurrent(false)}
          closeLabel={french ? 'Fermer' : 'Close'}
        />
      )}
      {selected && selected.organizationId === activeOrganization?.organizationId && (
        <PartnerTermsDialog
          open
          document={selected.contentCopy}
          onClose={() => setSelected(null)}
          closeLabel={french ? 'Fermer' : 'Close'}
        />
      )}
    </WorkspaceFrame>
  );
}

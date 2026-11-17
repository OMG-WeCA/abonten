'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { planningLastDay } from '../../lib/agency-planning';
import type { AgencyCampaignDetail } from '@abonten/contracts/agency-campaign';
import { useLocale } from '../LocaleProvider';
import { ApiError, apiFetch } from '../../lib/api';
import { getAgencyCampaign } from '../../lib/agency-campaigns-api';
import { displayDateOnly, displayUtcTimestamp } from '../../lib/locale-format';
import { formatMoney } from '../../lib/number-format';

export type CampaignSection = 'overview' | 'bookings' | 'proof' | 'issues';
/** Read-only facts from the same authorized campaign, with no simulated workflow writes. */
export function CampaignDetails({
  orgId,
  id,
  section,
  onClose,
}: {
  orgId: string;
  id: string;
  section: CampaignSection;
  onClose: () => void;
}) {
  const { locale } = useLocale();
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(section),
    [retry, setRetry] = useState(0);
  const [proofFocus, setProofFocus] = useState<string | null>(null);
  const [state, setState] = useState<{
    data?: AgencyCampaignDetail;
    error?: 'denied' | 'missing' | 'error';
  }>({});
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setState({});
    void getAgencyCampaign(orgId, id, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data });
      },
      (error) => {
        if (!controller.signal.aborted)
          setState({
            error:
              error instanceof ApiError && error.status === 403
                ? 'denied'
                : error instanceof ApiError && error.status === 404
                  ? 'missing'
                  : 'error',
          });
      },
    );
    return () => controller.abort();
  }, [orgId, id, retry]);
  const data = state.data,
    campaign = data?.campaign;
  const active = selected !== 'overview' && !data?.permissions[selected] ? 'overview' : selected;
  useEffect(() => {
    if (
      active !== 'proof' ||
      !proofFocus ||
      !data?.proofs?.some((proof) => proof.id === proofFocus)
    )
      return;
    const element = document.getElementById(`agency-check-${proofFocus}`);
    element?.scrollIntoView({ block: 'start' });
    element?.focus({ preventScroll: true });
  }, [active, proofFocus, data]);
  const labels: Record<CampaignSection, string> = {
    overview: t('Overview', 'Vue d’ensemble'),
    bookings: t('Bookings', 'Réservations'),
    proof: t('Proof', 'Preuves'),
    issues: t('Issues', 'Problèmes'),
  };
  const money = (amount: number | null, currency: string | null) =>
    amount == null || !currency
      ? t('Unavailable', 'Indisponible')
      : formatMoney(amount, currency, locale);
  const date = (value: string | null) =>
    value ? displayDateOnly(value.slice(0, 10), locale) : t('Unavailable', 'Indisponible');
  const status = (value: string) =>
    ({
      draft: t('Draft', 'Brouillon'),
      planned: t('Planned', 'Planifiée'),
      booking: t('Booking', 'Réservation'),
      live: t('Live', 'En cours'),
      completed: t('Completed', 'Terminée'),
      cancelled: t('Cancelled', 'Annulée'),
      held: t('Held', 'En attente'),
      confirmed: t('Confirmed', 'Confirmée'),
      active: t('Active', 'Active'),
      expired: t('Expired', 'Expirée'),
      synced: t('Synced', 'Synchronisée'),
      pending: t('Pending', 'En attente'),
      open: t('Open', 'Ouvert'),
      resolved: t('Resolved', 'Résolu'),
      requested: t('Requested', 'Demandée'),
      intact: t('Intact', 'Intact'),
      damaged: t('Damaged', 'Endommagé'),
      creative_missing: t('Creative missing', 'Visuel absent'),
      lighting_issue: t('Lighting issue', 'Problème d’éclairage'),
      wrong_creative: t('Wrong creative', 'Visuel incorrect'),
      obstructed: t('Obstructed', 'Masqué'),
      site_down: t('Site unavailable', 'Site indisponible'),
      acknowledged: t('Acknowledged', 'Pris en compte'),
      in_progress: t('In progress', 'En cours'),
      closed: t('Closed', 'Clos'),
      creative_visible: t('Creative visible', 'Visuel visible'),
      context: t('Context', 'Environnement'),
      front: t('Front', 'Face'),
    })[value] ?? value;
  const bookings =
    data?.items.flatMap((item) => (item.bookings ?? []).map((booking) => ({ item, booking }))) ??
    [];
  const proofs = (data?.proofs ?? []).map((proof) => ({
    proof,
    item: data!.items.find((item) => item.id === proof.campaignItemId),
  }));
  return (
    <dialog
      ref={dialog}
      className="agency-campaign-dialog"
      aria-labelledby="agency-campaign-title"
      onCancel={onClose}
    >
      <header className="agency-campaign-detail-header">
        <h2 id="agency-campaign-title">{campaign?.name ?? t('Campaign', 'Campagne')}</h2>
        <button
          type="button"
          className="agency-workspace-icon"
          onClick={onClose}
          aria-label={t('Close campaign', 'Fermer la campagne')}
        >
          <X size={20} aria-hidden />
        </button>
      </header>
      <div className="agency-campaign-detail-body">
        {state.error ? (
          <div role="alert">
            <p>
              {state.error === 'denied'
                ? t('Campaign access required.', 'Accès à la campagne requis.')
                : state.error === 'missing'
                  ? t(
                      'This campaign is no longer available.',
                      'Cette campagne n’est plus disponible.',
                    )
                  : t('Campaign could not load.', 'Impossible de charger la campagne.')}
            </p>
            {state.error === 'error' && (
              <button
                type="button"
                className="agency-home-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                {t('Try again', 'Réessayer')}
              </button>
            )}
          </div>
        ) : !campaign || !data ? (
          <p role="status">{t('Loading campaign…', 'Chargement de la campagne…')}</p>
        ) : (
          <>
            <nav
              className="agency-home-filters agency-campaign-detail-tabs"
              aria-label={t('Campaign details', 'Détails de la campagne')}
            >
              {(['overview', 'bookings', 'proof', 'issues'] as const)
                .filter((key) => key === 'overview' || data.permissions[key])
                .map((key) => (
                  <button
                    type="button"
                    key={key}
                    aria-pressed={active === key}
                    onClick={() => setSelected(key)}
                  >
                    {labels[key]}
                  </button>
                ))}
            </nav>
            {active === 'overview' && (
              <>
                <dl className="agency-campaign-facts">
                  <div>
                    <dt>{t('Client', 'Client')}</dt>
                    <dd>{campaign.clientName ?? t('Unavailable', 'Indisponible')}</dd>
                  </div>
                  <div>
                    <dt>{t('Status', 'Statut')}</dt>
                    <dd>{status(campaign.status)}</dd>
                  </div>
                  <div>
                    <dt>{t('Flight', 'Période')}</dt>
                    <dd>
                      {date(campaign.flightStart)} –{' '}
                      {date(
                        campaign.flightEnd
                          ? planningLastDay(campaign.flightEnd.slice(0, 10))
                          : null,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('Faces', 'Faces')}</dt>
                    <dd>{campaign.faceCount}</dd>
                  </div>
                  <div>
                    <dt>{t('Committed before tax', 'Engagé hors taxes')}</dt>
                    <dd>{money(campaign.committedBudget, campaign.currency)}</dd>
                  </div>
                  <div>
                    <dt>{t('Planning budget', 'Budget prévu')}</dt>
                    <dd>{money(campaign.planningBudget, campaign.currency)}</dd>
                  </div>
                  {data.objective && (
                    <div>
                      <dt>{t('Objective', 'Objectif')}</dt>
                      <dd>{data.objective}</dd>
                    </div>
                  )}
                  {data.targetAudience && (
                    <div>
                      <dt>{t('Audience', 'Audience')}</dt>
                      <dd>{data.targetAudience}</dd>
                    </div>
                  )}
                </dl>
                <section className="agency-campaign-detail-section">
                  <h3>{t('Campaign faces', 'Faces de la campagne')}</h3>
                  {!data.items.length ? (
                    <p>
                      {t(
                        'No campaign faces recorded.',
                        'Aucune face enregistrée pour cette campagne.',
                      )}
                    </p>
                  ) : (
                    <ul>
                      {data.items.map((item) => (
                        <li key={item.id}>
                          <p>
                            {item?.siteName ?? t('Site unavailable', 'Site indisponible')}
                            {item?.faceLabel ? ` · ${item.faceLabel}` : ''}
                          </p>
                          <p className="agency-home-muted">
                            {[item.city, item.country].filter(Boolean).join(' · ')}
                          </p>
                          <p>
                            {date(item.startDate)} –{' '}
                            {date(planningLastDay(item.endDate.slice(0, 10)))} ·{' '}
                            {status(item.status)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
            {active === 'bookings' && (
              <section className="agency-campaign-detail-section">
                <h3>{labels.bookings}</h3>
                {!bookings.length ? (
                  <p>{t('No bookings recorded.', 'Aucune réservation enregistrée.')}</p>
                ) : (
                  <ul>
                    {bookings.map(({ item, booking }) => (
                      <li key={booking.id}>
                        <p>
                          {item.siteName ?? t('Site unavailable', 'Site indisponible')}
                          {item.faceLabel ? ` · ${item.faceLabel}` : ''} · {status(booking.status)}
                        </p>
                        <p>
                          {date(booking.startDate)} –{' '}
                          {date(planningLastDay(booking.endDate.slice(0, 10)))}
                        </p>
                        <p>
                          {t('Committed before tax', 'Engagé hors taxes')}:{' '}
                          {money(booking.committedBudget, booking.committedCurrency)}
                        </p>
                        {booking.holdExpiresAt && (
                          <p>
                            {t('Hold expires', 'Fin de mise en attente')}:{' '}
                            {displayUtcTimestamp(booking.holdExpiresAt, locale)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {active === 'proof' && (
              <section className="agency-campaign-detail-section">
                <h3>{t('Recorded checks', 'Contrôles enregistrés')}</h3>
                {!proofs.length ? (
                  <p>{t('No synced proof recorded.', 'Aucune preuve synchronisée enregistrée.')}</p>
                ) : (
                  <ul>
                    {proofs.map(({ item, proof }) => {
                      return (
                        <li key={proof.id} id={`agency-check-${proof.id}`} tabIndex={-1}>
                          <p>
                            {item?.siteName ?? t('Site unavailable', 'Site indisponible')}
                            {item?.faceLabel ? ` · ${item.faceLabel}` : ''}
                          </p>
                          <p>
                            {date(proof.checkDate)} · {status(proof.status)}
                          </p>
                          {proof.capturedAt && (
                            <p>
                              {t('Captured', 'Capture')}:{' '}
                              {displayUtcTimestamp(proof.capturedAt, locale)}
                            </p>
                          )}
                          <p>
                            {proof.photoCount}{' '}
                            {proof.photoCount === 1 ? t('photo', 'photo') : t('photos', 'photos')} ·{' '}
                            {proof.creativeVisiblePhotoCount}{' '}
                            {t('with creative visible', 'avec visuel visible')}
                          </p>
                          {proof.conditionNotes && <p>{proof.conditionNotes}</p>}
                          {proof.photos.map((photo, index) => (
                            <CampaignProofPhoto
                              key={photo.id}
                              orgId={orgId}
                              campaignId={id}
                              proofId={proof.id}
                              photoId={photo.id}
                              label={`${t('Photo', 'Photo')} ${index + 1}${photo.kind ? ` · ${status(photo.kind)}` : ''}`}
                              locale={locale}
                            />
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
            {active === 'issues' && (
              <section className="agency-campaign-detail-section">
                <h3>{labels.issues}</h3>
                {!data.issues?.length ? (
                  <p>{t('No issues recorded.', 'Aucun problème enregistré.')}</p>
                ) : (
                  <ul>
                    {data.issues.map((issue) => (
                      <li key={issue.id}>
                        <p>{issue.summary ?? status(issue.type)}</p>
                        <p>
                          {status(issue.status)}
                          {issue.severity ? ` · ${status(issue.severity)}` : ''}
                        </p>
                        {data.permissions.proof &&
                          issue.popId &&
                          data.proofs?.some((proof) => proof.id === issue.popId) && (
                            <button
                              type="button"
                              className="agency-home-link"
                              onClick={() => {
                                setSelected('proof');
                                setProofFocus(issue.popId);
                              }}
                            >
                              {t('View check', 'Voir le contrôle')}
                            </button>
                          )}
                        {issue.dueAt && (
                          <p>
                            {t('Due', 'Échéance')}: {displayUtcTimestamp(issue.dueAt, locale)}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}

function CampaignProofPhoto({
  orgId,
  campaignId,
  proofId,
  photoId,
  label,
  locale,
}: {
  orgId: string;
  campaignId: string;
  proofId: string;
  photoId: string;
  label: string;
  locale: 'en' | 'fr';
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const [requested, setRequested] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [src, setSrc] = useState<string | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    void apiFetch(
      `/api/planning/v1/campaigns/${encodeURIComponent(campaignId)}/proofs/${encodeURIComponent(proofId)}/photos/${encodeURIComponent(photoId)}`,
      { headers: { 'X-Org-Id': orgId }, signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('Photo unavailable');
        const blob = await response.blob();
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [requested, attempt, orgId, campaignId, proofId, photoId]);
  return (
    <figure className="agency-campaign-photo">
      {src && !failed ? (
        <>
          <img src={src} alt={label} onError={() => setFailed(true)} />
          <figcaption>{label}</figcaption>
        </>
      ) : (
        <>
          {requested && !failed ? (
            <p role="status">{t('Loading photo…', 'Chargement de la photo…')}</p>
          ) : (
            <>
              {failed && (
                <p role="alert">{t('Photo could not load.', 'Impossible de charger la photo.')}</p>
              )}
              <button
                type="button"
                className="agency-home-button"
                onClick={() => {
                  setRequested(true);
                  setAttempt((value) => value + 1);
                }}
              >
                {failed ? t('Retry photo', 'Recharger la photo') : `${t('View', 'Voir')} ${label}`}
              </button>
            </>
          )}
        </>
      )}
    </figure>
  );
}

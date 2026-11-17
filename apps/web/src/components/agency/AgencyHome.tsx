'use client';

import { useEffect, useState } from 'react';
import { planningLastDay } from '../../lib/agency-planning';
import { useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, ChevronRight, FilePlus2, Loader2, RefreshCw } from 'lucide-react';
import type { SavedAgencyPlanningDraft } from '@abonten/contracts/planning-draft';
import type { AgencyCampaignList, AgencyCampaignSummary } from '@abonten/contracts/agency-campaign';
import { useAuth } from '../auth/AuthProvider';
import { useLocale } from '../LocaleProvider';
import { ApiError } from '../../lib/api';
import { loadAgencyDraft, type AgencyDraft } from '../../lib/agency-draft';
import {
  attentionDestination,
  hasRecoverableTabWork,
  planningAttention,
  planningDestination,
  type PlanAttention,
} from '../../lib/agency-home';
import { loadPlanningWorkSession, type PlanningWorkSession } from '../../lib/planning-work-session';
import { listPlanningDrafts } from '../../lib/planning-drafts-api';
import { listAgencyCampaigns } from '../../lib/agency-campaigns-api';
import { displayDateOnly, displayNumber, displayUtcTimestamp } from '../../lib/locale-format';
import { formatMoney, parseAmount } from '../../lib/number-format';
import { CampaignDetails, type CampaignSection } from './CampaignDetails';
import './agency-home.css';

type ReadState = 'loading' | 'ready' | 'error' | 'denied';
export function AgencyHome() {
  const router = useRouter();
  const { activeOrganization: org, profile, capabilities } = useAuth();
  const { locale } = useLocale();
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const orgId = org?.organizationId,
    userId = profile?.id,
    scope = `${userId}:${orgId}`;
  const canPlan =
    capabilities.includes('MARKETPLACE_VIEW') && capabilities.includes('CAMPAIGN_CREATE');
  const canRead = capabilities.includes('CAMPAIGN_VIEW');
  const [draftRetry, setDraftRetry] = useState(0),
    [campaignRetry, setCampaignRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [campaignView, setCampaignView] = useState({ scope, filter: '', offset: 0 });
  const { filter, offset } =
    campaignView.scope === scope ? campaignView : { filter: '', offset: 0 };
  const [summary, setSummary] = useState<{
    scope: string;
    data: Pick<AgencyCampaignList, 'statusCounts' | 'currencyTotals'>;
  } | null>(null);
  const [currency, setCurrency] = useState('');
  const [detail, setDetail] = useState<{ id: string; section: CampaignSection } | null>(null);
  const [tabDraft, setTabDraft] = useState<{
    scope: string;
    draft: AgencyDraft | null;
    meta: PlanningWorkSession | null;
  } | null>(null);
  const [saved, setSaved] = useState<{
    scope: string;
    status: ReadState;
    items: SavedAgencyPlanningDraft[];
  } | null>(null);
  const [campaigns, setCampaigns] = useState<{
    scope: string;
    filter: string;
    status: ReadState;
    data?: AgencyCampaignList;
  } | null>(null);
  useEffect(() => {
    if (!userId || !orgId) return;
    const refresh = () =>
      setTabDraft({
        scope,
        draft: loadAgencyDraft(userId, orgId),
        meta: loadPlanningWorkSession(userId, orgId),
      });
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [userId, orgId, scope]);
  useEffect(() => {
    if (!userId || !orgId || !canPlan) return;
    const controller = new AbortController();
    setSaved({ scope, status: 'loading', items: [] });
    setExpanded(false);
    void listPlanningDrafts(orgId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setSaved({ scope, status: 'ready', items: result.items });
      },
      (error) => {
        if (!controller.signal.aborted)
          setSaved({
            scope,
            status: error instanceof ApiError && error.status === 403 ? 'denied' : 'error',
            items: [],
          });
      },
    );
    return () => controller.abort();
  }, [orgId, userId, scope, canPlan, draftRetry]);
  useEffect(() => {
    if (!userId || !orgId || !canRead) return;
    const controller = new AbortController();
    setCampaigns((previous) => ({
      scope,
      filter,
      status: 'loading',
      ...(offset && previous?.scope === scope && previous.filter === filter
        ? { data: previous.data }
        : {}),
    }));
    void listAgencyCampaigns(orgId, { status: filter, offset, signal: controller.signal }).then(
      (result) => {
        if (!controller.signal.aborted) {
          setSummary({
            scope,
            data: { statusCounts: result.statusCounts, currencyTotals: result.currencyTotals },
          });
          setCampaigns((previous) => ({
            scope,
            filter,
            status: 'ready',
            data: {
              ...result,
              items:
                offset && previous?.scope === scope && previous.filter === filter
                  ? [...(previous.data?.items ?? []), ...result.items]
                  : result.items,
            },
          }));
        }
      },
      (error) => {
        if (!controller.signal.aborted) {
          const denied = error instanceof ApiError && error.status === 403;
          if (denied) setSummary((previous) => (previous?.scope === scope ? null : previous));
          setCampaigns((previous) => ({
            scope,
            filter,
            status: denied ? 'denied' : 'error',
            ...(offset && !denied ? { data: previous?.data } : {}),
          }));
        }
      },
    );
    return () => controller.abort();
  }, [orgId, userId, scope, canRead, filter, offset, campaignRetry]);
  const current = saved?.scope === scope ? saved : null;
  const plans =
    current?.status === 'ready'
      ? [...current.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : [];
  const tab = tabDraft?.scope === scope ? tabDraft : null;
  const local = tab && hasRecoverableTabWork(tab.draft, tab.meta) ? tab.draft : null;
  const pendingSave = Boolean(local && tab?.meta?.pendingCreate);
  const campaignState =
    campaigns?.scope === scope && campaigns.filter === filter ? campaigns : null;
  const data = campaignState?.data;
  const metadata = summary?.scope === scope ? summary.data : null;
  const campaignCount = metadata
    ? Object.values(metadata.statusCounts).reduce((sum, count) => sum + count, 0)
    : 0;
  const totals = metadata?.currencyTotals ?? [];
  const selectedCurrency = totals.some((row) => row.currency === currency)
    ? currency
    : (totals.find((row) => row.currency === org?.defaultCurrency)?.currency ??
      totals[0]?.currency ??
      '');
  const total = totals.find((row) => row.currency === selectedCurrency);
  const statuses = [
    '',
    'live',
    'booking',
    'planned',
    ...['draft', 'completed', 'cancelled'].filter(
      (status) => (metadata?.statusCounts[status] ?? 0) > 0,
    ),
  ];
  const statusCopy: Record<string, string> = {
    '': t('All', 'Toutes'),
    live: t('Live', 'En cours'),
    booking: t('Booking', 'Réservation'),
    planned: t('Planned', 'Planifiée'),
    draft: t('Draft', 'Brouillon'),
    completed: t('Completed', 'Terminée'),
    cancelled: t('Cancelled', 'Annulée'),
  };
  const selectFilter = (value: string) => {
    setCampaignView({ scope, offset: 0, filter: value });
  };
  const open = (path: string) => router.push(path);
  const attentionCopy: Record<PlanAttention, string> = {
    budget: t('Set budget', 'Définir le budget'),
    flight: t('Set dates', 'Définir les dates'),
    expired: t('Review dates', 'Revoir les dates'),
    selection: t('Find boards', 'Trouver des panneaux'),
  };
  const today = new Date().toISOString().slice(0, 10);
  const draftRow = (name: string, draft: AgencyDraft, id?: string, updatedAt?: string) => {
    const attention = planningAttention(draft, today);
    const amount = parseAmount(draft.budget);
    return (
      <li key={id ?? 'current'} className="agency-home-draft-row">
        <div>
          <h3>{name}</h3>
          <p>
            {id
              ? `${t('Updated', 'Mis à jour')} ${displayUtcTimestamp(updatedAt!, locale)}`
              : pendingSave
                ? t(
                    'Save unconfirmed · edits kept in this browser',
                    'Enregistrement non confirmé · modifications conservées dans ce navigateur',
                  )
                : t('Unsaved in this browser', 'Non enregistré dans ce navigateur')}
            {id && amount != null && amount > 0
              ? ` · ${formatMoney(amount, draft.currency, locale)}`
              : ''}
          </p>
          {attention.length > 0 && (
            <div className="agency-home-draft-checks">
              {attention.map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => open(attentionDestination(item, id))}
                  aria-label={`${attentionCopy[item]} · ${name}`}
                >
                  {attentionCopy[item]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="agency-home-link"
          onClick={() => open(planningDestination(id ? { draftId: id } : {}))}
          aria-label={`${id ? t('Resume', 'Reprendre') : t('Continue', 'Continuer')} ${name}`}
        >
          {id ? t('Resume', 'Reprendre') : t('Continue', 'Continuer')}
          <ArrowRight size={16} aria-hidden />
        </button>
      </li>
    );
  };
  return (
    <div className="agency-home" data-testid="agency-home">
      <header className="agency-home-heading">
        <div>
          <h1>{t('Campaigns', 'Campagnes')}</h1>
          <p className="agency-home-mobile-org">{org?.name}</p>
        </div>
        {canPlan && (
          <button
            type="button"
            className="agency-home-button is-primary"
            onClick={() => open(planningDestination({ newPlan: true }))}
          >
            <FilePlus2 size={18} aria-hidden />
            {t('New plan', 'Nouveau plan')}
            <ArrowRight size={17} className="agency-home-cta-arrow" aria-hidden />
          </button>
        )}
      </header>
      <section aria-label={t('Agency campaigns', 'Campagnes de l’agence')}>
        {canRead && metadata && campaignCount > 0 && (
          <div className="agency-home-toolbar">
            <div
              className="agency-home-filters"
              role="group"
              aria-label={t('Campaign status', 'Statut des campagnes')}
            >
              {statuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={filter === status}
                  onClick={() => selectFilter(status)}
                >
                  {statusCopy[status]}{' '}
                  {displayNumber(
                    status ? (metadata.statusCounts[status] ?? 0) : campaignCount,
                    locale,
                  )}
                </button>
              ))}
            </div>
            {total && (
              <div className="agency-home-totals">
                <label className="agency-home-select">
                  <span className="sr-only">
                    {t('Currency for agency totals', 'Devise des totaux de l’agence')}
                  </span>
                  <select
                    value={selectedCurrency}
                    onChange={(event) => setCurrency(event.target.value)}
                  >
                    {totals.map((row) => (
                      <option key={row.currency} value={row.currency}>
                        {row.currency} {t('totals', 'totaux')}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} aria-hidden />
                </label>
                <p>
                  {t('Committed', 'Engagé')}{' '}
                  {total.committedBudget == null
                    ? t('Unavailable', 'Indisponible')
                    : compactNumber(total.committedBudget, locale)}{' '}
                  · {t('Planning', 'Prévu')}{' '}
                  {total.planningBudget == null
                    ? t('Unavailable', 'Indisponible')
                    : compactNumber(total.planningBudget, locale)}
                </p>
              </div>
            )}
          </div>
        )}
        {!canRead || campaignState?.status === 'denied' ? (
          <HomeState
            title={t('Campaign access required', 'Accès aux campagnes requis')}
            detail={t(
              'Ask your workspace administrator for campaign access.',
              'Demandez l’accès aux campagnes à votre administrateur.',
            )}
          />
        ) : !campaignState || (campaignState.status === 'loading' && !data) ? (
          <HomeState title={t('Loading campaigns…', 'Chargement des campagnes…')} loading />
        ) : campaignState.status === 'error' && !data ? (
          <HomeState title={t('Campaigns could not load', 'Impossible de charger les campagnes')}>
            <Retry
              onClick={() => setCampaignRetry((value) => value + 1)}
              label={t('Try again', 'Réessayer')}
            />
          </HomeState>
        ) : (
          data && (
            <>
              {data.items.length ? (
                <>
                  <div className="agency-home-table-head" aria-hidden>
                    <span>{t('Campaign', 'Campagne')}</span>
                    <span>{t('Flight / faces', 'Période / faces')}</span>
                    <span>{t('Committed / planning', 'Engagé / prévu')}</span>
                    <span>{t('Status', 'Statut')}</span>
                    <span>{t('Follow-up', 'Suivi')}</span>
                    <span />
                  </div>
                  <ul className="agency-home-campaigns">
                    {data.items.map((campaign) => (
                      <CampaignRow
                        key={campaign.id}
                        campaign={campaign}
                        locale={locale}
                        statusLabel={statusCopy[campaign.status] ?? campaign.status}
                        onOpen={(section) => setDetail({ id: campaign.id, section })}
                      />
                    ))}
                  </ul>
                </>
              ) : (
                <HomeState
                  title={
                    filter
                      ? t('No campaigns with this status', 'Aucune campagne avec ce statut')
                      : t('No campaigns yet', 'Aucune campagne pour le moment')
                  }
                  detail={
                    !filter
                      ? t(
                          'Your personal planning drafts are below.',
                          'Vos brouillons personnels sont ci-dessous.',
                        )
                      : undefined
                  }
                />
              )}
              {data.items.length < data.total && (
                <div className="agency-home-more">
                  {campaignState.status === 'error' ? (
                    <Retry
                      onClick={() => setCampaignRetry((value) => value + 1)}
                      label={t('Try again', 'Réessayer')}
                    />
                  ) : (
                    <button
                      type="button"
                      className="agency-home-button"
                      disabled={campaignState.status === 'loading'}
                      onClick={() => setCampaignView({ scope, filter, offset: data.items.length })}
                    >
                      {campaignState.status === 'loading'
                        ? t('Loading…', 'Chargement…')
                        : t('Show more campaigns', 'Afficher plus de campagnes')}
                    </button>
                  )}
                </div>
              )}
            </>
          )
        )}
      </section>
      <section className="agency-home-drafts" aria-labelledby="agency-drafts-heading">
        <h2 id="agency-drafts-heading">{t('Your drafts', 'Vos brouillons')}</h2>
        {local && canPlan && (
          <ul className="agency-home-draft-list">
            {draftRow(
              tab?.meta?.pendingCreate?.name ||
                tab?.meta?.name ||
                t('Current plan', 'Plan en cours'),
              local,
            )}
          </ul>
        )}
        {!canPlan || current?.status === 'denied' ? (
          <HomeState title={t('Planning access required', 'Accès à la planification requis')} />
        ) : !current || current.status === 'loading' ? (
          <HomeState title={t('Loading your drafts…', 'Chargement de vos brouillons…')} loading />
        ) : current.status === 'error' ? (
          <HomeState
            title={t(
              'Saved drafts could not load',
              'Impossible de charger les brouillons enregistrés',
            )}
          >
            <Retry
              onClick={() => setDraftRetry((value) => value + 1)}
              label={t('Retry saved drafts', 'Recharger les brouillons')}
            />
          </HomeState>
        ) : plans.length ? (
          <>
            <ul className="agency-home-draft-list">
              {(expanded ? plans : plans.slice(0, 6)).map((plan) =>
                draftRow(plan.name, plan.draft, plan.id, plan.updatedAt),
              )}
            </ul>
            {plans.length > 6 && (
              <button
                type="button"
                className="agency-home-link"
                aria-expanded={expanded}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded
                  ? t('Show recent drafts', 'Afficher les brouillons récents')
                  : t('Show all drafts', 'Afficher tous les brouillons')}
              </button>
            )}
          </>
        ) : (
          <HomeState title={t('No saved drafts yet', 'Aucun brouillon enregistré')} />
        )}
      </section>
      {detail && orgId && (
        <CampaignDetails
          key={`${scope}:${detail.id}`}
          orgId={orgId}
          id={detail.id}
          section={detail.section}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
function compactNumber(amount: number, locale: 'en' | 'fr') {
  return new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);
}
function CampaignRow({
  campaign: c,
  locale,
  statusLabel,
  onOpen,
}: {
  campaign: AgencyCampaignSummary;
  locale: 'en' | 'fr';
  statusLabel: string;
  onOpen: (section: CampaignSection) => void;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const money = (value: number | null) =>
    value == null || !c.currency
      ? t('Unavailable', 'Indisponible')
      : formatMoney(value, c.currency, locale);
  const uncommitted = c.committedBudget === 0 && c.firmBookingCount === 0;
  const committed = uncommitted
    ? c.bookingCount === 0
      ? t('Not booked', 'Non réservée')
      : t('Not committed', 'Non engagé')
    : money(c.committedBudget);
  const ratio =
    c.committedBudget != null && c.planningBudget != null && c.planningBudget > 0
      ? Math.min(c.committedBudget / c.planningBudget, 1)
      : null;
  const followup =
    c.openIssueCount != null && c.openIssueCount > 0
      ? {
          label:
            c.openIssueCount === 1
              ? t('1 open issue', '1 problème ouvert')
              : t(`${c.openIssueCount} open issues`, `${c.openIssueCount} problèmes ouverts`),
          action: t('Review issues', 'Voir les problèmes'),
          section: 'issues' as const,
        }
      : c.pendingBookingCount != null && c.pendingBookingCount > 0
        ? {
            label:
              c.pendingBookingCount === 1
                ? t('1 booking pending', '1 réservation en attente')
                : t(
                    `${c.pendingBookingCount} bookings pending`,
                    `${c.pendingBookingCount} réservations en attente`,
                  ),
            action: t('Review bookings', 'Voir les réservations'),
            section: 'bookings' as const,
          }
        : c.latestProofAt
          ? {
              label: `${t('Latest check', 'Dernier contrôle')} · ${displayDateOnly(c.latestProofAt.slice(0, 10), locale)}`,
              action: t('Review proof', 'Voir les preuves'),
              section: 'proof' as const,
            }
          : null;
  return (
    <li className="agency-home-campaign-row">
      <div className="agency-home-campaign-name">
        <h3>
          <button type="button" onClick={() => onOpen('overview')}>
            {c.name}
            <span className="agency-home-row-chevron" aria-hidden>
              <ChevronRight size={18} />
            </span>
          </button>
        </h3>
        {c.clientName && <p>{c.clientName}</p>}
      </div>
      <div className="agency-home-flight">
        <p>
          {c.flightStart && c.flightEnd
            ? `${displayDateOnly(c.flightStart, locale)}–${displayDateOnly(planningLastDay(c.flightEnd.slice(0, 10)), locale)}`
            : t('Dates unavailable', 'Dates indisponibles')}
        </p>
        <p>
          {displayNumber(c.faceCount, locale)}{' '}
          {c.faceCount === 1 ? t('face', 'face') : t('faces', 'faces')}
        </p>
      </div>
      <div className="agency-home-budget">
        <p>
          <span>
            {committed}
            {!uncommitted && (
              <span className="agency-home-mobile-budget-label"> {t('committed', 'engagé')}</span>
            )}
          </span>
          <span className="agency-home-budget-divider"> / </span>
          <span>
            {money(c.planningBudget)}
            <span className="agency-home-mobile-budget-label"> {t('planning', 'prévu')}</span>
          </span>
        </p>
        {ratio != null && (
          <div className="agency-home-budget-track" aria-hidden>
            {ratio > 0 && <span style={{ width: `${ratio * 100}%` }} />}
          </div>
        )}
      </div>
      <span className={`agency-home-status is-${c.status}`}>{statusLabel}</span>
      <div className="agency-home-followup">
        {followup && (
          <>
            <p>{followup.label}</p>
            <button
              type="button"
              className="agency-home-link"
              onClick={() => onOpen(followup.section)}
              aria-label={`${followup.action} · ${c.name}`}
            >
              <span className="agency-home-wide-action">{followup.action}</span>
              <span className="agency-home-small-action">{t('Review', 'Voir')}</span>
              <ArrowRight size={16} aria-hidden />
            </button>
          </>
        )}
      </div>
    </li>
  );
}
function Retry({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="agency-home-button" onClick={onClick}>
      <RefreshCw size={16} aria-hidden />
      {label}
    </button>
  );
}
function HomeState({
  title,
  detail,
  loading,
  children,
}: {
  title: string;
  detail?: string;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="agency-home-state" role="status">
      {loading && <Loader2 size={18} className="animate-spin" aria-hidden />}
      <p>{title}</p>
      {detail && <p className="agency-home-muted">{detail}</p>}
      {children}
    </div>
  );
}

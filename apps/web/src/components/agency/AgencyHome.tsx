'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Check,
  CircleAlert,
  FilePlus2,
  Loader2,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import type { SavedAgencyPlanningDraft } from '@abonten/contracts/planning-draft';
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
import { displayDateOnly, displayNumber, displayUtcTimestamp } from '../../lib/locale-format';
import { formatMoney, parseAmount } from '../../lib/number-format';
import { marketLabel } from '../../lib/markets';
import './agency-home.css';

/** Workspace body. Routing/authentication chrome remains in WorkspaceFrame. */
export function AgencyHome() {
  const router = useRouter();
  const { activeOrganization: org, profile, capabilities } = useAuth();
  const { locale } = useLocale();
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const orgId = org?.organizationId;
  const userId = profile?.id;
  const scope = `${userId}:${orgId}`;
  const canBrowse = capabilities.includes('MARKETPLACE_VIEW');
  const canPlan = canBrowse && capabilities.includes('CAMPAIGN_CREATE');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [tabDraft, setTabDraft] = useState<{
    scope: string;
    draft: AgencyDraft | null;
    meta: PlanningWorkSession | null;
  } | null>(null);
  const [saved, setSaved] = useState<{
    scope: string;
    status: 'loading' | 'ready' | 'error' | 'denied';
    items: SavedAgencyPlanningDraft[];
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
      (error: unknown) => {
        if (!controller.signal.aborted)
          setSaved({
            scope,
            status: error instanceof ApiError && error.status === 403 ? 'denied' : 'error',
            items: [],
          });
      },
    );
    return () => controller.abort();
  }, [orgId, userId, scope, canPlan, retry]);
  const current = saved?.scope === scope ? saved : null;
  const loading = canPlan && (!current || current.status === 'loading');
  const plans =
    current?.status === 'ready'
      ? [...current.items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      : [];
  const tab = tabDraft?.scope === scope ? tabDraft : null;
  const local = tab && hasRecoverableTabWork(tab.draft, tab.meta) ? tab.draft : null;
  const pendingSave = Boolean(local && tab?.meta?.pendingCreate);
  const todayUtc = new Date().toISOString().slice(0, 10);
  const attention = [
    ...(local
      ? [{ name: t('This tab’s draft', 'Brouillon de cet onglet'), draft: local, id: undefined }]
      : []),
    ...plans.map((plan) => ({ name: plan.name, draft: plan.draft, id: plan.id })),
  ].flatMap((plan) => planningAttention(plan.draft, todayUtc).map((item) => ({ ...plan, item })));
  const attentionCopy: Record<PlanAttention, { title: string; action: string }> = {
    budget: {
      title: t('Set a media budget', 'Définir un budget média'),
      action: t('Set budget', 'Définir le budget'),
    },
    flight: {
      title: t('Choose campaign dates', 'Choisir les dates'),
      action: t('Set dates', 'Définir les dates'),
    },
    expired: {
      title: t('Review past flight dates', 'Revoir les dates passées'),
      action: t('Review dates', 'Revoir les dates'),
    },
    selection: {
      title: t('Find your first boards', 'Trouver les premiers panneaux'),
      action: t('Browse boards', 'Voir les panneaux'),
    },
  };
  const open = (path: string) => router.push(path);
  return (
    <div className="agency-home" data-testid="agency-home">
      <section className="agency-home-hero" aria-labelledby="agency-home-heading">
        <div className="agency-home-hero-copy">
          <h1 id="agency-home-heading">{t('Plan your campaign', 'Planifier une campagne')}</h1>
          <div className="agency-home-actions">
            <button
              type="button"
              className="agency-home-button is-primary"
              disabled={!canPlan}
              onClick={() => open(planningDestination({ newPlan: true }))}
            >
              <FilePlus2 size={18} aria-hidden />
              {t('Start a plan', 'Commencer un plan')}
              <ArrowRight size={17} aria-hidden />
            </button>
            <button
              type="button"
              className="agency-home-button"
              disabled={!canBrowse}
              onClick={() => open(planningDestination({ view: 'inventory' }))}
            >
              <MapPin size={18} aria-hidden />
              {t('Browse inventory', 'Explorer l’inventaire')}
            </button>
          </div>
          {!canPlan && (
            <p className="agency-home-access" role="status">
              {canBrowse
                ? t(
                    'Campaign planning access is needed to create or save plans.',
                    'L’accès à la planification est nécessaire pour créer ou enregistrer des plans.',
                  )
                : t(
                    'Marketplace access is needed to browse and plan.',
                    'L’accès au marché est nécessaire pour explorer et planifier.',
                  )}
            </p>
          )}
        </div>
      </section>

      {local && canPlan && (
        <section className="agency-home-tab" aria-labelledby="agency-tab-heading">
          <span className="agency-home-tab-icon">
            <RefreshCw size={21} aria-hidden />
          </span>
          <div>
            <h2 id="agency-tab-heading">
              {pendingSave
                ? t('Save status unconfirmed', 'Enregistrement non confirmé')
                : t('Resume work from this tab', 'Reprendre le travail de cet onglet')}
            </h2>
            <p>
              {pendingSave
                ? t(
                    'Save unconfirmed. Reopen to check and retry; your edits are kept.',
                    'Enregistrement non confirmé. Rouvrez pour vérifier et réessayer ; vos changements sont conservés.',
                  )
                : t(
                    'Reopening checks current boards and rates.',
                    'La reprise vérifie les panneaux et tarifs actuels.',
                  )}
            </p>
            <DraftControls draft={local} locale={locale} />
          </div>
          <button
            type="button"
            className="agency-home-button"
            onClick={() => open(planningDestination())}
          >
            {t('Resume tab draft', 'Reprendre le brouillon')}
            <ArrowRight size={16} aria-hidden />
          </button>
        </section>
      )}

      <div className="agency-home-columns">
        <section className="agency-home-work" aria-labelledby="agency-saved-heading">
          <header className="agency-home-section-heading">
            <div>
              <h2 id="agency-saved-heading">{t('Your saved plans', 'Vos plans enregistrés')}</h2>
            </div>
            <Bookmark size={22} aria-hidden />
          </header>
          {!canPlan || current?.status === 'denied' ? (
            <div className="agency-home-state" role="status">
              <CircleAlert size={25} aria-hidden />
              <h3>{t('Planning access required', 'Accès à la planification requis')}</h3>
              <p>
                {t(
                  'Saved plans are personal to your account and agency. Ask your workspace administrator for planning access.',
                  'Les plans enregistrés sont personnels à votre compte et agence. Demandez l’accès à la planification à votre administrateur.',
                )}
              </p>
            </div>
          ) : loading ? (
            <div className="agency-home-state" role="status">
              <Loader2 size={25} className="animate-spin" aria-hidden />
              <p>{t('Loading your saved work…', 'Chargement de vos plans…')}</p>
            </div>
          ) : current?.status === 'error' ? (
            <div className="agency-home-state is-error" role="alert">
              <CircleAlert size={25} aria-hidden />
              <h3>{t('Saved plans could not be loaded', 'Impossible de charger vos plans')}</h3>
              <p>
                {local
                  ? t(
                      'Check your connection and try again. Your tab draft is still available above.',
                      'Vérifiez votre connexion et réessayez. Le brouillon de cet onglet reste disponible ci-dessus.',
                    )
                  : t(
                      'Check your connection and try again. You can still browse inventory or start a plan.',
                      'Vérifiez votre connexion et réessayez. Vous pouvez toujours explorer l’inventaire ou commencer un plan.',
                    )}
              </p>
              <button
                type="button"
                className="agency-home-button"
                onClick={() => setRetry((value) => value + 1)}
              >
                <RefreshCw size={16} aria-hidden />
                {t('Retry saved plans', 'Recharger les plans')}
              </button>
            </div>
          ) : !plans.length ? (
            <div className="agency-home-state">
              <h3>{t('No saved plans yet', 'Aucun plan enregistré')}</h3>
              <p>
                {t(
                  'Choose boards and save a draft in the planner.',
                  'Sélectionnez des panneaux et enregistrez un brouillon dans le planificateur.',
                )}
              </p>
              <button
                type="button"
                className="agency-home-button is-primary"
                onClick={() => open(planningDestination({ newPlan: true }))}
              >
                {t('Create your first plan', 'Créer votre premier plan')}
                <ArrowRight size={16} aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <ul className="agency-home-plan-list">
                {(expanded ? plans : plans.slice(0, 6)).map((plan) => (
                  <li key={plan.id}>
                    <div className="agency-home-plan-heading">
                      <span className="agency-home-plan-icon">
                        <Bookmark size={18} aria-hidden />
                      </span>
                      <div>
                        <h3>
                          <button
                            type="button"
                            onClick={() => open(planningDestination({ draftId: plan.id }))}
                          >
                            {plan.name}
                            <ArrowUpRight size={15} aria-hidden />
                          </button>
                        </h3>
                        <p>
                          {t('Updated', 'Mis à jour')} {displayUtcTimestamp(plan.updatedAt, locale)}
                        </p>
                      </div>
                      <span className="agency-home-draft-label">{t('Draft', 'Brouillon')}</span>
                    </div>
                    <DraftControls draft={plan.draft} locale={locale} />
                    <div className="agency-home-plan-actions">
                      <button
                        type="button"
                        onClick={() => open(planningDestination({ draftId: plan.id }))}
                        aria-label={`${t('Resume', 'Reprendre')} ${plan.name}`}
                      >
                        {t('Resume plan', 'Reprendre le plan')}
                        <ArrowRight size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          open(planningDestination({ draftId: plan.id, view: 'shortlist' }))
                        }
                        aria-label={`${t('View shortlist for', 'Voir la sélection de')} ${plan.name}`}
                      >
                        {t('Shortlist', 'Sélection')}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          open(planningDestination({ draftId: plan.id, view: 'compare' }))
                        }
                        aria-label={`${t('Compare selected faces in', 'Comparer les faces de')} ${plan.name}`}
                      >
                        {t('Compare faces', 'Comparer les faces')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {plans.length > 6 && (
                <button
                  type="button"
                  className="agency-home-show-all"
                  onClick={() => setExpanded((value) => !value)}
                  aria-expanded={expanded}
                >
                  {expanded
                    ? t('Show recent plans only', 'Afficher uniquement les plans récents')
                    : t(
                        `Show all ${displayNumber(plans.length, locale)} saved plans`,
                        `Afficher les ${displayNumber(plans.length, locale)} plans enregistrés`,
                      )}
                </button>
              )}
            </>
          )}
        </section>

        <aside className="agency-home-attention" aria-labelledby="agency-attention-heading">
          <header className="agency-home-section-heading">
            <div>
              <h2 id="agency-attention-heading">{t('Next steps', 'Prochaines étapes')}</h2>
            </div>
            <CircleAlert size={21} aria-hidden />
          </header>
          {canPlan && attention.length > 0 ? (
            <ul className="agency-home-attention-list">
              {attention.slice(0, 5).map(({ name, id, item }) => (
                <li key={`${id ?? 'tab'}:${item}`}>
                  <div>
                    <p className="agency-home-attention-plan">{name}</p>
                    <h3>{attentionCopy[item].title}</h3>
                    <button
                      type="button"
                      onClick={() => open(attentionDestination(item, id))}
                      aria-label={`${attentionCopy[item].action} · ${name}`}
                    >
                      {attentionCopy[item].action}
                      <ArrowRight size={14} aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : loading ? (
            <p className="agency-home-attention-note" role="status">
              {t('Checking saved draft controls…', 'Vérification des réglages des brouillons…')}
            </p>
          ) : current?.status === 'error' || current?.status === 'denied' ? (
            <p className="agency-home-attention-note">
              {t(
                'Saved draft checks will appear after your plans load.',
                'Les vérifications des brouillons apparaîtront après leur chargement.',
              )}
            </p>
          ) : canPlan && plans.length > 0 ? (
            <div className="agency-home-attention-note">
              <Check size={21} className="text-success" aria-hidden />
              <h3>{t('Draft controls are complete', 'Réglages des brouillons complets')}</h3>
              <p>
                {t(
                  'Reopen to check rates and availability.',
                  'Rouvrez pour vérifier les tarifs et disponibilités.',
                )}
              </p>
            </div>
          ) : (
            <div className="agency-home-attention-note">
              <p>{t('No draft checks yet.', 'Aucune vérification de brouillon pour le moment.')}</p>
            </div>
          )}
          {attention.length > 5 && (
            <p className="agency-home-attention-limit">
              {t(
                'Showing the first five checks. Open each plan to review all its controls.',
                'Les cinq premières vérifications sont affichées. Ouvrez chaque plan pour revoir tous ses réglages.',
              )}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function DraftControls({ draft, locale }: { draft: AgencyDraft; locale: 'en' | 'fr' }) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const amount = parseAmount(draft.budget);
  return (
    <dl className="agency-home-controls">
      <div>
        <dt>
          <MapPin size={13} aria-hidden />
          {t('Market', 'Marché')}
        </dt>
        <dd>
          {draft.country
            ? marketLabel(draft.country, locale)
            : t('All markets', 'Tous les marchés')}
        </dd>
      </div>
      <div>
        <dt>
          <CalendarDays size={13} aria-hidden />
          {t('Flight', 'Période')}
        </dt>
        <dd>
          {draft.window.startDate && draft.window.endDate
            ? `${displayDateOnly(draft.window.startDate, locale)} → ${displayDateOnly(draft.window.endDate, locale)}`
            : t('Dates not set', 'Dates non définies')}
          <small>{t('End exclusive', 'Fin exclusive')}</small>
        </dd>
      </div>
      <div>
        <dt>{t('Media budget', 'Budget média')}</dt>
        <dd>
          {amount != null && amount > 0 && amount <= 1e12
            ? formatMoney(amount, draft.currency, locale)
            : draft.budget.trim()
              ? t('Needs correction', 'À corriger')
              : t('Not set', 'Non défini')}
        </dd>
      </div>
      <div>
        <dt>{t('Selected faces', 'Faces sélectionnées')}</dt>
        <dd>{displayNumber(draft.faces.length, locale)}</dd>
      </div>
    </dl>
  );
}

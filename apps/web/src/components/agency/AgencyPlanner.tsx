'use client';
import type { PlanningFitPreferences } from '@abonten/contracts/planning-draft';
import { BriefFitPreferences } from './BriefFitPreferences';
import { BriefFitScore } from './BriefFitScore';
import { useUnsavedNavigation } from '../../lib/unsaved-navigation';

import { useEffect, useRef, useState } from 'react';
import { Check, FileText, Loader2, Minus, Paperclip, Send, Sparkles, X } from 'lucide-react';
import {
  askPlanner,
  extractBrief,
  getAssistantStatus,
  type AssistantStatus,
  type BriefConstraints,
  type ExtractedBrief,
  type PlannerContext,
  type PlannerReply,
  type PlanningAssessment,
} from '../../lib/agency-api';
import {
  buildPlannerContext,
  buildPlannerRequest,
  isOpenAiReady,
  type PlanningMessage,
} from '../../lib/planner-conversation';
import {
  planningDays,
  summarizeResearchPrices,
  type FaceCostEstimate,
  type PlanningWindow,
  type selectionDistances,
  type summarizeBudget,
} from '../../lib/agency-planning';
import type { ShortlistFace } from './AgencyDashboard';
import { agencyEvidenceText } from '../../lib/agency-evidence-locale';
import { parseAmount } from '../../lib/number-format';
import { displayDateOnly, displayNumber, displayUtcTimestamp } from '../../lib/locale-format';
import { money } from './BoardDetail';
import { PlannerDataUseDialog } from './PlannerDataUseDialog';
import {
  ResearchBadge,
  ResearchPriceBaseline,
  ResearchReferenceFacts,
} from './ResearchReferenceFacts';
import { researchAskingPrice, researchFaceLabel } from '../../lib/research-reference';

interface PlannerProps {
  open: boolean;
  orgId: string;
  locale: 'en' | 'fr';
  canPlan: boolean;
  window: PlanningWindow;
  budget: string;
  onBudget: (value: string) => void;
  contextMayContainBrief: boolean;
  onBriefContext: () => void;
  currency: string;
  onCurrency: (value: string) => void;
  shortlist: ShortlistFace[];
  fitPreferences?: PlanningFitPreferences;
  onFitPreferences?: (value: PlanningFitPreferences) => void;
  assessment?: PlanningAssessment;
  assessmentState?: 'loading' | 'ready' | 'error';
  onRetryAssessment?: () => void;
  storedScoringVersion?: string;
  estimates: FaceCostEstimate[];
  summary: ReturnType<typeof summarizeBudget>;
  distances: ReturnType<typeof selectionDistances>;
  onSelect: (id: string, faceId?: string) => void;
  onRemove: (faceId: string) => void;
  onClear: () => void;
  onClose: () => void;
  onRecommend: () => void;
  recommending: boolean;
  onCancelRecommendation: () => void;
  canRecommend: boolean;
  notice: string;
  plannerContext?: Pick<
    PlannerContext,
    | 'filters'
    | 'selectedSiteIds'
    | 'selectedFaceIds'
    | 'faceCurrencies'
    | 'selectionTruncated'
    | 'fitPreferences'
  >;
  plannerSelectionOmittedFaces?: number;
}
interface Message extends PlanningMessage {
  reply?: PlannerReply;
}

export function AgencyPlanner(props: PlannerProps) {
  const {
    orgId,
    locale,
    budget,
    onBudget,
    currency,
    onCurrency,
    shortlist,
    estimates,
    summary,
    distances,
  } = props;
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const [dataUseOpen, setDataUseOpen] = useState(false);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [statusRetry, setStatusRetry] = useState(0);
  const [brief, setBrief] = useState<ExtractedBrief | null>(null);
  const [briefText, setBriefText] = useState('');
  const [briefConfirmed, setBriefConfirmed] = useState(false);
  const [briefConsentText, setBriefConsentText] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  useUnsavedNavigation(
    !!brief || !!message.trim() || messages.length > 0 || uploading,
    t(
      'Your document and conversation are only kept in this planner. Leave this page? Plan controls and selected faces stay in this tab; documents and conversation will be cleared.',
      'Votre document et votre conversation restent uniquement dans ce planificateur. Quitter cette page ? Les paramètres et faces restent dans cet onglet ; le document et la conversation seront effacés.',
    ),
  );
  const [chatting, setChatting] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<BriefConstraints | null>(null);
  const uploadRef = useRef<AbortController | null>(null);
  const chatRef = useRef<AbortController | null>(null);
  const statusRefreshRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const external = isOpenAiReady(status);
  const assistantUsable =
    !statusError &&
    (external || (status?.mode === 'local' && status.provider === null && !status.aiAvailable));
  const briefShared =
    external && briefConfirmed && briefConsentText === briefText && Boolean(briefText.trim());
  useEffect(() => {
    const controller = new AbortController();
    setStatus(null);
    setStatusError(false);
    void getAssistantStatus(orgId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setStatus(result);
      },
      () => {
        if (!controller.signal.aborted) setStatusError(true);
      },
    );
    return () => controller.abort();
  }, [orgId, statusRetry]);
  useEffect(() => {
    return () => {
      uploadRef.current?.abort();
      chatRef.current?.abort();
      statusRefreshRef.current?.abort();
    };
  }, [orgId]);
  useEffect(() => {
    const thread = threadRef.current;
    if (thread && (messages.length > 0 || chatting)) {
      const latest = chatting
        ? thread.querySelector<HTMLElement>('[role="status"]')
        : thread.querySelector<HTMLElement>('.agency-chat-message:last-child');
      // Scroll only the two content areas; scrolling all ancestors can move the
      // fixed panel header and composer when the panel has overflow:hidden.
      if (latest) {
        thread.scrollTo({
          top:
            thread.scrollTop +
            latest.getBoundingClientRect().top -
            thread.getBoundingClientRect().top,
          behavior: 'instant',
        });
        const content = thread.closest<HTMLElement>('.agency-planner-scroll');
        if (content)
          content.scrollTo({
            top:
              content.scrollTop +
              thread.getBoundingClientRect().top -
              content.getBoundingClientRect().top,
            behavior: 'instant',
          });
      }
    }
  }, [messages, chatting]);
  const cancelUpload = () => {
    uploadRef.current?.abort();
    setUploading(false);
  };
  const resetConversation = () => {
    chatRef.current?.abort();
    setChatting(false);
    setMessages([]);
    setSuggested(null);
    setFailedMessage(null);
    setError('');
  };
  const upload = async (file: File) => {
    resetConversation();
    setBriefConsentText(null);
    uploadRef.current?.abort();
    const controller = new AbortController();
    uploadRef.current = controller;
    setError('');
    const limit = status?.maxUploadBytes ?? 10 * 1024 * 1024;
    if (file.size > limit || file.size === 0) {
      setError(
        t(
          `Choose a non-empty brief up to ${Math.floor(limit / 1024 / 1024)} MB.`,
          `Choisissez un document non vide de ${Math.floor(limit / 1024 / 1024)} Mo maximum.`,
        ),
      );
      return;
    }
    setUploading(true);
    try {
      const result = await extractBrief(orgId, file, controller.signal);
      if (!controller.signal.aborted) {
        props.onBriefContext();
        setBrief(result);
        setBriefText(result.text);
        setBriefConfirmed(false);
        setSuggested(null);
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : t(
                'Brief could not be read. Try again.',
                'Le document n’a pas pu être lu. Réessayez.',
              ),
        );
    } finally {
      if (!controller.signal.aborted) setUploading(false);
    }
  };
  const apply = (constraints: BriefConstraints) => {
    if (constraints.budget != null && !constraints.currency) {
      setError(
        t(
          'The budget currency is unclear. Set the media budget and currency manually before finding boards.',
          'La devise du budget est incertaine. Définissez manuellement le budget média et la devise avant de rechercher des panneaux.',
        ),
      );
      setSuggested(null);
      return;
    }
    if (constraints.budget != null && constraints.budget > 0) onBudget(String(constraints.budget));
    if (
      constraints.currency &&
      ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'].includes(constraints.currency)
    )
      onCurrency(constraints.currency);
    // Dates and geography remain editable flight filters; extracted language does not establish inclusive/exclusive intent.
    setSuggested(null);
  };
  const send = async (retryText?: string) => {
    const submittedDraft = retryText ?? message;
    const text = submittedDraft.trim();
    if (!text || chatting || uploading || !props.canPlan || !assistantUsable) return;
    const controller = new AbortController();
    chatRef.current = controller;
    setChatting(true);
    setError('');
    setFailedMessage(null);
    try {
      const reply = await askPlanner(
        orgId,
        buildPlannerRequest({
          message: text,
          locale,
          status,
          messages,
          context: buildPlannerContext(props.plannerContext, props.window, budget, currency),
          briefText,
          briefConfirmed,
          briefConsentText,
          contextMayContainBrief: props.contextMayContainBrief,
        }),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (reply.mode !== status?.mode) {
        statusRefreshRef.current?.abort();
        const refreshController = new AbortController();
        statusRefreshRef.current = refreshController;
        void getAssistantStatus(orgId, refreshController.signal).then(
          (result) => {
            if (!refreshController.signal.aborted) {
              setStatus(result);
              setStatusError(false);
            }
          },
          () => {
            if (!refreshController.signal.aborted) setStatusError(true);
          },
        );
      }
      let response = reply.message;
      if (
        reply.mode === 'local' &&
        !shortlist.some((item) => item.site.isResearchReference) &&
        /distance|apart|spacing|éloign|écart/i.test(text) &&
        distances.length
      ) {
        response = t(
          'Straight-line distances from the registered WGS84 board coordinates:',
          'Distances à vol d’oiseau selon les coordonnées WGS84 enregistrées :',
        );
        response +=
          '\n\n' +
          distances
            .slice(0, 10)
            .map((pair) => {
              const a = shortlist.find((item) => item.site.id === pair.fromSiteId)?.site.name;
              const b = shortlist.find((item) => item.site.id === pair.toSiteId)?.site.name;
              return `${a} ↔ ${b}: ${pair.value == null ? t('Unavailable', 'Indisponible') : `${displayNumber(pair.value, locale, { maximumFractionDigits: 2 })} km`} (${t('straight-line', 'à vol d’oiseau')}).`;
            })
            .join('\n');
      }
      if (
        reply.mode === 'local' &&
        !shortlist.some((item) => item.site.isResearchReference) &&
        /budget|cost|price|coût|prix/i.test(text) &&
        shortlist.length
      ) {
        response = t(
          'Published media cost estimates for the current draft. Tax, production and installation are excluded; currencies are kept separate.',
          'Estimations média publiées pour la sélection actuelle. Hors taxes, production et installation ; les devises restent séparées.',
        );
        response +=
          '\n\n' +
          t('Current published media estimates: ', 'Estimations média publiées actuelles : ') +
          Object.entries(summary.totals)
            .map(([code, amount]) => money(amount, code, locale))
            .join(' + ') +
          '. ' +
          (summary.remaining != null
            ? `${money(Math.abs(summary.remaining), currency, locale)} ${summary.remaining < 0 ? t('over budget', 'de dépassement') : t('remaining', 'restants')}.`
            : t(
                'Budget fit cannot be confirmed until every face is priced and checked in the budget currency.',
                'Le budget ne peut être confirmé avant tarification et vérification de chaque face dans la devise du budget.',
              ));
      }
      setMessages((items) =>
        [
          ...items,
          { role: 'user' as const, text },
          { role: 'assistant' as const, text: response, reply },
        ].slice(-30),
      );
      setMessage((current) => (current === submittedDraft ? '' : current));
      if (reply.constraints.budget != null || reply.constraints.currency)
        setSuggested(reply.constraints);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setFailedMessage(submittedDraft);
        setError(
          failure instanceof Error &&
            (failure.name === 'AbortError' || failure.name === 'TimeoutError')
            ? t(
                'The planner timed out. Your message is preserved; retry when ready.',
                'L’assistant a dépassé le délai. Votre message est conservé ; réessayez.',
              )
            : failure instanceof Error
              ? failure.message
              : t(
                  'Planner unavailable. Your message is preserved.',
                  'Assistant indisponible. Votre message est conservé.',
                ),
        );
      }
    } finally {
      if (!controller.signal.aborted) setChatting(false);
    }
  };
  const hasDemo = shortlist.some(
    ({ site, faceId }) =>
      site.isDemo &&
      estimates.some(
        (estimate) =>
          estimate.siteId === site.id &&
          estimate.faceId === faceId &&
          estimate.status === 'ready' &&
          estimate.amount > 0 &&
          (summary.totals[estimate.currency] ?? 0) >= estimate.amount,
      ),
  );
  const subtotal = summary.totals[currency] ?? 0;
  const budgetAmount = parseAmount(budget) ?? NaN;
  const hasBudget =
    budget.trim() !== '' &&
    Number.isFinite(budgetAmount) &&
    budgetAmount > 0 &&
    budgetAmount <= 1e12;
  const researchBaseline = summarizeResearchPrices(
    shortlist.map(({ site }) => site),
    props.window,
    hasBudget && summary.selectedCount === shortlist.length
      ? { amount: budgetAmount, currency }
      : undefined,
  );
  return (
    <section
      className="agency-planner agency-panel"
      style={props.open ? undefined : { display: 'none' }}
      aria-labelledby="planner-heading"
      data-testid="agency-planner"
    >
      <header className="agency-panel-heading">
        <div className="agency-planner-title">
          <Sparkles size={20} className="text-primary" />
          <div>
            <h2 id="planner-heading">{t('Planning assistant', 'Assistant de planification')}</h2>
            {(statusError || !external) && (
              <p>
                {statusError || (status !== null && !assistantUsable)
                  ? t('Connection unavailable', 'Connexion indisponible')
                  : status === null
                    ? t('Connecting…', 'Connexion…')
                    : t('AI chat is not connected', 'La conversation IA n’est pas connectée')}
              </p>
            )}
          </div>
        </div>
        <button
          className="agency-icon-button"
          onClick={props.onClose}
          aria-label={t('Minimize planner', 'Réduire l’assistant')}
        >
          <Minus size={18} />
        </button>
      </header>
      <div className="agency-planner-scroll">
        {(statusError || (status !== null && !assistantUsable)) && (
          <div className="agency-form-error" role="alert">
            <p>
              {t(
                'Connection unavailable. Your draft is kept.',
                'Connexion indisponible. Votre brouillon est conservé.',
              )}
            </p>
            <button
              className="agency-text-button"
              onClick={() => setStatusRetry((value) => value + 1)}
            >
              {t('Retry connection', 'Réessayer la connexion')}
            </button>
          </div>
        )}
        {Boolean(props.plannerSelectionOmittedFaces && props.plannerSelectionOmittedFaces > 0) && (
          <p className="agency-assistant-disclosure" role="status">
            {t(
              `Chat includes up to 12 boards / 24 faces. ${props.plannerSelectionOmittedFaces} draft faces are outside this context; chat totals are partial.`,
              `Le chat inclut jusqu’à 12 panneaux / 24 faces. ${props.plannerSelectionOmittedFaces} faces du brouillon sont hors de ce contexte ; les totaux du chat sont partiels.`,
            )}
          </p>
        )}
        <div className="agency-budget-inputs">
          <label className="agency-field">
            <span>{t('Media budget', 'Budget média')}</span>
            <input
              type="text"
              inputMode="decimal"
              value={budget}
              onChange={(event) => onBudget(event.target.value)}
              placeholder={t('Enter budget', 'Saisir le budget')}
            />
          </label>
          <label className="agency-field">
            <span>{t('Currency', 'Devise')}</span>
            <select
              aria-label={t('Currency', 'Devise')}
              value={currency}
              onChange={(event) => onCurrency(event.target.value)}
            >
              {['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'].map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
        </div>
        {budget.trim() && !hasBudget && (
          <p role="alert" className="agency-form-error">
            {budgetAmount > 1e12
              ? t(
                  'The planner supports budgets up to 1,000,000,000,000. Enter a smaller amount.',
                  'L’assistant prend en charge les budgets jusqu’à 1 000 000 000 000. Saisissez un montant inférieur.',
                )
              : !Number.isFinite(budgetAmount)
                ? t(
                    'Enter an unambiguous amount, for example 3000000.50 or 3 000 000,50.',
                    'Saisissez un montant sans ambiguïté, par exemple 3000000.50 ou 3 000 000,50.',
                  )
                : t('Enter a budget greater than zero.', 'Saisissez un budget supérieur à zéro.')}
          </p>
        )}
        <p className="agency-flight-caption">
          {planningDays(props.window) === null
            ? t(
                'Choose valid flight dates in Flight & filters.',
                'Choisissez des dates valides dans Dates et filtres.',
              )
            : `${displayDateOnly(props.window.startDate, locale)} → ${displayDateOnly(props.window.endDate, locale)} · ${t('end exclusive', 'fin exclusive')}`}
        </p>
        {props.onFitPreferences && (
          <BriefFitPreferences
            value={props.fitPreferences}
            onChange={props.onFitPreferences}
            locale={locale}
            disabled={!props.canPlan}
          />
        )}
        <p className="agency-assumption-note">
          {t(
            'Uncalibrated planning indices · no measured exposure, audience or reach claim. Displayed scores are recalculated from current sources when controls change or saved plans reopen.',
            'Indices de planification non calibrés · aucune mesure d’exposition, d’audience ou de couverture. Les notes affichées sont recalculées selon les sources actuelles après modification des paramètres ou réouverture d’un plan enregistré.',
          )}
        </p>
        {props.assessmentState === 'loading' && (
          <p role="status" className="agency-assumption-note">
            {t('Updating brief fit…', 'Mise à jour de la pertinence…')}
          </p>
        )}
        {props.assessmentState === 'error' && (
          <p role="alert" className="agency-assumption-note">
            {t(
              'Brief fit unavailable. Your shortlist is kept.',
              'Pertinence indisponible. Votre sélection est conservée.',
            )}{' '}
            <button className="agency-text-button" onClick={props.onRetryAssessment}>
              {t('Retry scoring', 'Réessayer la notation')}
            </button>
          </p>
        )}
        {props.assessment && (
          <details className="agency-distance-list">
            <summary>
              {t('Scoring method', 'Méthode de notation')} · {props.assessment.version}
            </summary>
            <p>
              {t(
                'Uncalibrated product weights, pending local validation',
                'Poids produit non calibrés, avant validation locale',
              )}{' '}
              : {t('geography', 'géographie')}{' '}
              {displayNumber(props.assessment.config.weights.geography, locale)}%,{' '}
              {t('audience', 'audience')}{' '}
              {displayNumber(props.assessment.config.weights.audience, locale)}%,{' '}
              {t('campaign exposure', 'exposition de campagne')}{' '}
              {displayNumber(props.assessment.config.weights.visibility, locale)}%,{' '}
              {t('geographic contribution', 'apport géographique')}{' '}
              {displayNumber(props.assessment.config.weights.contribution, locale)}%,{' '}
              {t('value', 'valeur')} {displayNumber(props.assessment.config.weights.value, locale)}
              %.{' '}
              {t(
                'Unknown factors remain unknown; the supported contribution is never renormalized.',
                'Les critères inconnus restent inconnus ; la contribution étayée n’est jamais renormalisée.',
              )}
            </p>
            <p>
              {t(
                'Bounded portfolio search uses supported exposure before provisional interest. Unknown geographic overlap earns no novelty bonus. These uncalibrated indices do not establish deduplicated reach or improved effectiveness.',
                'La recherche bornée privilégie l’exposition étayée avant l’intérêt provisoire. Un chevauchement géographique inconnu ne reçoit aucun bonus de nouveauté. Ces indices non calibrés ne démontrent ni couverture dédupliquée ni meilleure efficacité.',
              )}
            </p>
            {props.storedScoringVersion &&
              props.storedScoringVersion !== props.assessment.version && (
                <p>
                  {t(
                    'Saved methodology changed; scores were recalculated.',
                    'La méthode enregistrée a changé ; les notes ont été recalculées.',
                  )}
                </p>
              )}
            {(props.assessment.portfolio.truncated ||
              (props.plannerSelectionOmittedFaces ?? 0) > 0) && (
              <p>
                {t(
                  'This assessment covers a bounded subset; unassessed faces have no score and whole-plan fit remains unconfirmed.',
                  'Cette évaluation couvre un sous-ensemble borné ; les autres faces n’ont pas de note et le budget global reste non confirmé.',
                )}
              </p>
            )}
          </details>
        )}
        {brief && (
          <div className="agency-brief">
            <div className="agency-brief-heading">
              <FileText size={20} className="text-info" />
              <div>
                <strong>{brief.fileName}</strong>
                <small>
                  {briefConfirmed
                    ? t('Brief confirmed', 'Document confirmé')
                    : t('Text extracted · review required', 'Texte extrait · à vérifier')}
                </small>
              </div>
              <button
                className="agency-icon-button"
                onClick={() => {
                  resetConversation();
                  uploadRef.current?.abort();
                  setBrief(null);
                  setBriefText('');
                  setBriefConfirmed(false);
                  setBriefConsentText(null);
                }}
                aria-label={t('Remove brief', 'Retirer le document')}
              >
                <X size={15} />
              </button>
            </div>
            <details open={!briefConfirmed}>
              <summary>{t('Review extracted text', 'Vérifier le texte extrait')}</summary>
              <label className="agency-field">
                <span>
                  {t('Extracted text · original language', 'Texte extrait · langue originale')}
                </span>
                <textarea
                  aria-label={t(
                    'Extracted text · original language',
                    'Texte extrait · langue originale',
                  )}
                  value={briefText}
                  maxLength={60000}
                  onChange={(event) => {
                    resetConversation();
                    setBriefText(event.target.value);
                    setBriefConfirmed(false);
                    setBriefConsentText(null);
                  }}
                  rows={5}
                />
              </label>
              {brief.warnings.map((warning) => (
                <p key={warning}>{agencyEvidenceText(warning, locale)}</p>
              ))}
              <p>
                {t(
                  'Check budget, currency, dates and locations.',
                  'Vérifiez le budget, la devise, les dates et les lieux.',
                )}
              </p>
              {briefText === brief.text && brief.constraints.budget != null && (
                <p>
                  <b>
                    {t('Detected budget', 'Budget détecté')}:{' '}
                    {displayNumber(brief.constraints.budget, locale)}{' '}
                    {brief.constraints.currency ??
                      t('· currency needs confirmation', '· devise à confirmer')}
                  </b>
                </p>
              )}
              {briefText === brief.text && brief.constraints.cities.length > 0 && (
                <p>
                  {t('Detected cities', 'Villes détectées')}: {brief.constraints.cities.join(', ')}
                </p>
              )}
              {briefText !== brief.text && (
                <p>
                  {t(
                    'Text edited. Set budget and currency manually.',
                    'Texte modifié. Saisissez le budget et la devise.',
                  )}
                </p>
              )}
              <button
                className="agency-secondary-button"
                disabled={!briefText.trim()}
                onClick={() => {
                  setBriefConfirmed(true);
                  if (briefText === brief.text) apply(brief.constraints);
                }}
              >
                <Check size={15} />
                {t('Confirm brief & budget', 'Confirmer le document et le budget')}
              </button>
            </details>
            {external && (
              <div className="agency-brief-sharing">
                <label>
                  <input
                    type="checkbox"
                    checked={briefShared}
                    disabled={!briefConfirmed}
                    onChange={(event) => {
                      if (!event.target.checked) resetConversation();
                      setBriefConsentText(
                        event.target.checked && briefConfirmed ? briefText : null,
                      );
                    }}
                  />
                  <span>
                    {t(
                      'Send confirmed brief text to OpenAI with my messages',
                      'Envoyer le texte confirmé à OpenAI avec mes messages',
                    )}
                  </span>
                </label>
                {!briefConfirmed && (
                  <p>{t('Confirm text first.', 'Confirmez d’abord le texte.')}</p>
                )}
                <button
                  type="button"
                  className="agency-text-button"
                  onClick={() => setDataUseOpen(true)}
                >
                  {t('Data use', 'Utilisation des données')}
                </button>
              </div>
            )}
          </div>
        )}
        {shortlist.length > 0 ? (
          <div className="agency-shortlist">
            <div className="agency-section-row">
              <h3>{t('Your shortlist', 'Votre sélection')}</h3>
              <button className="agency-text-button" onClick={props.onClear}>
                {t('Clear', 'Effacer')}
              </button>
            </div>
            {shortlist.map((item, index) => {
              const estimate = estimates[index];
              return (
                <div className="agency-shortlist-row" key={item.faceId}>
                  <button
                    className="agency-shortlist-board"
                    onClick={() => props.onSelect(item.site.id, item.faceId)}
                  >
                    <b className="agency-number-pin">{index + 1}</b>
                    <span>
                      <strong>{item.site.name}</strong>
                      <small>
                        {item.site.isDemo && (
                          <>
                            <span className="agency-data-badge">DEMO</span>{' '}
                          </>
                        )}
                        {item.site.isResearchReference && (
                          <>
                            <ResearchBadge locale={locale} />{' '}
                          </>
                        )}
                        {researchFaceLabel(
                          item.site.faces.find((face) => face.id === item.faceId)?.faceLabel,
                          item.site.isResearchReference,
                          locale,
                        )}{' '}
                        · {item.site.city}
                      </small>
                    </span>
                    <em>
                      {item.site.isResearchReference
                        ? (researchAskingPrice(item.site.researchProvenance, locale) ??
                          t('Price unknown', 'Tarif inconnu'))
                        : estimate?.status === 'ready'
                          ? money(estimate.amount, estimate.currency, locale)
                          : t('Check quote', 'Vérifier le devis')}
                    </em>
                  </button>
                  <button
                    className="agency-icon-button"
                    onClick={() => props.onRemove(item.faceId)}
                    aria-label={`${t('Remove', 'Retirer')} ${item.site.name}`}
                  >
                    <X size={14} />
                  </button>
                  <BriefFitScore
                    assessment={
                      props.assessment &&
                      [
                        ...props.assessment.portfolio.selectedAssessments,
                        ...props.assessment.assessments,
                      ].find((face) => face.faceId === item.faceId && face.siteId === item.site.id)
                    }
                    locale={locale}
                  />
                  {item.site.isResearchReference ? (
                    <p role="status" className="text-muted">
                      {t(
                        'Advertised rate · quote and availability unconfirmed',
                        'Tarif public · devis et disponibilité non confirmés',
                      )}
                    </p>
                  ) : (
                    estimate?.status === 'unavailable' && (
                      <p role="status" className="agency-form-error">
                        {agencyEvidenceText(estimate.reason, locale)}
                      </p>
                    )
                  )}
                </div>
              );
            })}
            <div className="agency-budget-summary">
              <strong>
                {Object.entries(summary.totals)
                  .map(([code, amount]) => money(amount, code, locale))
                  .join(' + ') || '—'}
              </strong>
              <span>
                {hasDemo && <>{t('Includes DEMO costs', 'Comprend des coûts DEMO')} · </>}
                {hasBudget
                  ? `${t('of', 'sur')} ${money(budgetAmount, currency, locale)}`
                  : t('media estimate', 'estimation média')}
              </span>
              <small className={summary.fit === 'over' ? 'text-error' : 'text-muted'}>
                {summary.remaining != null
                  ? `${money(Math.abs(summary.remaining), currency, locale)} ${summary.remaining < 0 ? t('over budget', 'de dépassement') : t('remaining', 'restants')}`
                  : t('Budget fit unconfirmed', 'Budget non confirmé')}
              </small>
              {hasBudget && (
                <progress
                  aria-label={t('Media budget used', 'Budget média utilisé')}
                  max={budgetAmount}
                  value={Math.min(subtotal, budgetAmount)}
                />
              )}
            </div>
            <ResearchPriceBaseline
              baseline={researchBaseline}
              locale={locale}
              currency={currency}
            />
          </div>
        ) : (
          <div className="agency-empty-shortlist">
            <p>{t('No faces selected', 'Aucune face sélectionnée')}</p>
            <span>
              {t(
                'Open a board on the map or in Boards, then add a face to your shortlist.',
                'Ouvrez un panneau sur la carte ou dans Panneaux, puis ajoutez une face à votre sélection.',
              )}
            </span>
          </div>
        )}
        <button
          className="agency-primary-button agency-recommend"
          disabled={!props.canPlan || !props.canRecommend || props.recommending || uploading}
          onClick={props.onRecommend}
        >
          {props.recommending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {props.recommending
            ? t('Checking boards…', 'Vérification des panneaux…')
            : shortlist.length
              ? t('Rebuild for brief & budget', 'Recréer selon brief et budget')
              : t('Build for brief & budget', 'Créer selon brief et budget')}
        </button>
        {props.recommending && (
          <button
            className="agency-text-button agency-cancel"
            onClick={props.onCancelRecommendation}
          >
            {t('Cancel search', 'Annuler la recherche')}
          </button>
        )}
        <p className="agency-assumption-note">
          {t(
            'Replaces shortlist · supported brief fit under budget · no reservation.',
            'Remplace la sélection · pertinence étayée selon le budget · aucune réservation.',
          )}
        </p>
        {props.notice && (
          <p className="agency-plan-notice" role="status">
            {props.notice}
          </p>
        )}
        <div className="agency-ots">
          <div className="agency-section-row">
            <span>{t('Opportunity to see', 'Occasions de voir')}</span>
            <span className="agency-data-badge">{t('Not estimated', 'Non estimé')}</span>
          </div>
          <p>
            {t(
              'Suitable traffic data and an exposure model are required.',
              'Des données de trafic adaptées et un modèle d’exposition sont nécessaires.',
            )}
          </p>
          <details>
            <summary>{t('View assumptions', 'Voir les hypothèses')}</summary>
            <p>
              {t(
                'Gross estimated impressions include repeat opportunities. Deduplicated reach needs a separate audience model. Residential population describes the surrounding area and is never added to traffic.',
                'Les impressions brutes incluent les expositions répétées. La couverture dédupliquée exige un modèle d’audience distinct. La population résidentielle décrit le quartier et n’est jamais ajoutée au trafic.',
              )}
            </p>
            <p>
              {t(
                'No traffic, reach or impressions are inferred from demo data, road class, population or short counts.',
                'Aucun trafic, couverture ou impression n’est déduit de données de démonstration, du type de route, de la population ou de comptages courts.',
              )}
            </p>
          </details>
        </div>
        {distances.length > 0 && (
          <details className="agency-distance-list">
            <summary>{t('Board spacing', 'Distances entre panneaux')} · km</summary>
            <p>
              {t(
                'Straight-line distance · WGS84 / Haversine, not road distance.',
                'Distance à vol d’oiseau · WGS84 / Haversine, hors trajet routier.',
              )}
            </p>
            {researchBaseline.referenceCount > 0 && (
              <p>
                {t(
                  'Published points are not field verified; distances are approximate and accuracy is unknown.',
                  'Les positions publiées ne sont pas vérifiées sur place ; les distances sont approximatives et leur précision est inconnue.',
                )}
              </p>
            )}
            {distances.slice(0, 50).map((pair) => (
              <div key={`${pair.fromSiteId}:${pair.toSiteId}`}>
                <span>
                  {shortlist.find((item) => item.site.id === pair.fromSiteId)?.site.name} ↔{' '}
                  {shortlist.find((item) => item.site.id === pair.toSiteId)?.site.name}
                </span>
                <b>
                  {pair.value == null
                    ? '—'
                    : `${shortlist.some(({ site }) => site.isResearchReference && (site.id === pair.fromSiteId || site.id === pair.toSiteId)) ? '≈ ' : ''}${displayNumber(pair.value, locale, { maximumFractionDigits: shortlist.some(({ site }) => site.isResearchReference && (site.id === pair.fromSiteId || site.id === pair.toSiteId)) ? 1 : 2 })}`}{' '}
                  km
                </b>
              </div>
            ))}
            {distances.length > 50 && (
              <p>{t('First 50 pairs shown.', 'Les 50 premières paires sont affichées.')}</p>
            )}
          </details>
        )}
        {shortlist.length > 0 && (
          <details className="agency-distance-list">
            <summary>{t('Cost sources & assumptions', 'Sources de coûts et hypothèses')}</summary>
            <p>
              {t(
                'Media only: taxes, installation, production and negotiated discounts are excluded. Each face uses its published rate in its original currency. No FX conversion is applied.',
                'Média uniquement : hors taxes, installation, production et remises négociées. Chaque face conserve la devise de son tarif publié. Aucune conversion de devise.',
              )}
            </p>
            {estimates.map(
              (estimate) =>
                estimate.status === 'ready' && (
                  <div key={estimate.faceId}>
                    <p>
                      {agencyEvidenceText(estimate.provenance, locale)}{' '}
                      {money(estimate.unitRate, estimate.currency, locale)} ×{' '}
                      {displayNumber(estimate.quantity, locale)}{' '}
                      {estimate.basis === 'perDay' ? t('days', 'jours') : t('weeks', 'semaines')}.
                      {estimate.availabilityCheckedAt && (
                        <>
                          {' '}
                          {t('Availability checked', 'Disponibilité vérifiée')}:{' '}
                          {displayUtcTimestamp(estimate.availabilityCheckedAt, locale)}.
                        </>
                      )}
                    </p>
                    {estimate.assumptions.map((assumption) => (
                      <p key={assumption}>{agencyEvidenceText(assumption, locale)}</p>
                    ))}
                  </div>
                ),
            )}
            {summary.uncheckedCount > 0 && (
              <p>
                {displayNumber(summary.uncheckedCount, locale)}{' '}
                {t(
                  'faces still require an availability check.',
                  'faces nécessitent un contrôle de disponibilité.',
                )}
              </p>
            )}
          </details>
        )}
        {(messages.length > 0 || chatting || failedMessage !== null) && (
          <div className="agency-section-row agency-chat-heading">
            <h3>{t('Conversation', 'Conversation')}</h3>
            <button
              className="agency-text-button"
              onClick={resetConversation}
              aria-label={t('Clear conversation', 'Effacer la conversation')}
            >
              {t('Clear conversation', 'Effacer')}
            </button>
          </div>
        )}
        <div
          className="agency-chat-thread"
          ref={threadRef}
          aria-label={t('Planning conversation', 'Conversation de planification')}
          aria-live="polite"
        >
          {messages.map((item, index) => (
            <div className={`agency-chat-message ${item.role}`} key={index}>
              <span className="sr-only">
                {item.role === 'user' ? t('You', 'Vous') : t('Planner', 'Assistant')}
              </span>
              {item.reply && (
                <small className="agency-chat-source">
                  {item.reply.mode === 'openai'
                    ? t('AI reply', 'Réponse IA')
                    : t('Local planning help', 'Aide locale')}
                  {item.reply.briefShared ? ` · ${t('brief shared', 'document partagé')}` : ''}
                </small>
              )}
              {item.text}
              {item.reply && (
                <ReplyFacts reply={item.reply} locale={locale} onSelect={props.onSelect} />
              )}
            </div>
          ))}
          {chatting && (
            <p role="status">
              <Loader2 size={15} className="animate-spin" />
              {t('Checking your request…', 'Vérification de votre demande…')}
              <button
                onClick={() => {
                  chatRef.current?.abort();
                  setChatting(false);
                }}
                className="agency-text-button"
              >
                {t('Cancel', 'Annuler')}
              </button>
            </p>
          )}
        </div>
        {suggested && (
          <div className="agency-constraint-confirm">
            <p>
              {t(
                'Detected constraints — confirm before applying:',
                'Contraintes détectées — confirmer avant application :',
              )}{' '}
              {suggested.budget != null ? displayNumber(suggested.budget, locale) : '—'}{' '}
              {suggested.currency ?? ''}
            </p>
            <button className="agency-secondary-button" onClick={() => apply(suggested)}>
              {t('Apply budget & currency', 'Appliquer budget et devise')}
            </button>
            <button className="agency-text-button" onClick={() => setSuggested(null)}>
              {t('Dismiss', 'Ignorer')}
            </button>
          </div>
        )}
        {error && (
          <div className="agency-form-error" role="alert">
            <p>{agencyEvidenceText(error, locale)}</p>
            {failedMessage !== null && (
              <>
                <p>
                  {t(
                    'Message kept. Retry with the current plan and sharing choice.',
                    'Message conservé. Réessayez avec le plan et le choix de partage actuels.',
                  )}
                </p>
                <button
                  className="agency-secondary-button"
                  disabled={chatting || uploading || !assistantUsable}
                  onClick={() => void send(failedMessage)}
                >
                  {t('Retry last message', 'Réessayer le dernier message')}
                </button>
              </>
            )}
            <button className="agency-text-button" onClick={() => setError('')}>
              {t('Dismiss', 'Fermer')}
            </button>
          </div>
        )}
      </div>
      <footer className="agency-chat-compose">
        {uploading && (
          <p role="status">
            <Loader2 size={14} className="animate-spin" />
            {t('Reading brief…', 'Lecture du document…')}
            <button onClick={cancelUpload} className="agency-text-button">
              {t('Cancel upload', 'Annuler l’import')}
            </button>
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            tabIndex={-1}
            accept=".pdf,.pptx,.xlsx,.docx,.txt,.csv,.tsv,.md"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            className="agency-icon-button"
            onClick={() => fileRef.current?.click()}
            disabled={!props.canPlan || uploading || chatting}
            aria-label={t('Attach campaign brief', 'Joindre un document de campagne')}
          >
            <Paperclip size={21} />
          </button>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t(
              'Ask about budget or board spacing…',
              'Budget ou distances entre panneaux…',
            )}
            aria-label={t('Ask about this plan', 'Poser une question sur cette sélection')}
            maxLength={4000}
            disabled={!props.canPlan}
          />
          <button
            type="submit"
            className="agency-send"
            disabled={
              !message.trim() || chatting || uploading || !props.canPlan || !assistantUsable
            }
            aria-label={t('Send planning message', 'Envoyer la demande')}
          >
            <Send size={18} />
          </button>
        </form>
        <button
          type="button"
          className="agency-text-button agency-data-use"
          onClick={() => setDataUseOpen(true)}
        >
          {t('Data use', 'Utilisation des données')}
        </button>
        {!props.canPlan && (
          <p>
            {t(
              'Campaign creation access is required to plan or upload.',
              'L’autorisation de créer une campagne est requise.',
            )}
          </p>
        )}
      </footer>
      {dataUseOpen && (
        <PlannerDataUseDialog
          locale={locale}
          connected={external}
          onClose={() => setDataUseOpen(false)}
        />
      )}
    </section>
  );
}

export function ReplyFacts({
  reply,
  locale,
  onSelect,
}: {
  reply: PlannerReply;
  locale: 'en' | 'fr';
  onSelect: (id: string, faceId?: string) => void;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const facts = reply.facts;
  const references = (reply.recommendations ?? []).flatMap((reference) => {
    const site = facts?.sites.find((candidate) => candidate.siteId === reference.siteId);
    const face = site?.faces.find((candidate) => candidate.faceId === reference.faceId);
    return site && face ? [{ reference, site, face }] : [];
  });
  const availabilityLabel = (
    value: 'available' | 'unavailable' | 'unknown' | null,
    demo = false,
    research = false,
  ) =>
    research
      ? t('Availability unconfirmed · no booking', 'Disponibilité non confirmée · sans réservation')
      : demo
        ? value === 'available'
          ? t('Available in sample · no booking', 'Disponible dans l’exemple · aucune réservation')
          : value === 'unavailable'
            ? t(
                'Unavailable in sample · no booking',
                'Indisponible dans l’exemple · aucune réservation',
              )
            : t(
                'Sample availability unconfirmed · no booking',
                'Disponibilité fictive non confirmée · aucune réservation',
              )
        : value === 'available'
          ? t(
              'Available at the check time · no reservation',
              'Disponible lors du contrôle · sans réservation',
            )
          : value === 'unavailable'
            ? t('Unavailable for this flight', 'Indisponible pour ces dates')
            : t('Availability needs checking', 'Disponibilité à vérifier');
  const faceSources =
    facts?.sites.flatMap((site) =>
      site.faces.filter((face) => face.selected).map((face) => ({ site, face })),
    ) ?? [];
  return (
    <div className="agency-reply-facts">
      {reply.recommendationSummary && (
        <RecommendationFacts summary={reply.recommendationSummary} locale={locale} />
      )}
      {references.length > 0 && (
        <div className="agency-reply-boards">
          {!reply.recommendationSummary && (
            <strong>{t('Recommended portfolio', 'Portefeuille recommandé')}</strong>
          )}
          {references.map(({ reference, site, face }) => (
            <div key={`${site.siteId}:${face.faceId}`}>
              <button
                type="button"
                className="agency-text-button"
                onClick={() => onSelect(site.siteId, face.faceId)}
                aria-label={`${t('View board', 'Voir le panneau')} ${site.name}${face.faceLabel ? ` · ${t('Face', 'Face')} ${researchFaceLabel(face.faceLabel, site.isResearchReference, locale)}` : ''}`}
              >
                <strong>
                  {site.name} {site.isDemo && <span className="agency-data-badge">DEMO</span>}
                  {site.isResearchReference && <ResearchBadge locale={locale} />}
                </strong>
              </button>
              <p>{[site.city, site.country].filter(Boolean).join(' · ')}</p>
              {(reply.mode === 'local' || reply.recommendationSummary) && (
                <p>
                  {reply.mode === 'local'
                    ? agencyEvidenceText(reference.reason, locale)
                    : reference.reason}
                </p>
              )}
              {reply.assessment && (
                <BriefFitScore
                  assessment={
                    reply.assessment.portfolio.selectedAssessments.find(
                      (item) => item.faceId === face.faceId && item.siteId === site.siteId,
                    ) ??
                    reply.assessment.assessments.find(
                      (item) => item.faceId === face.faceId && item.siteId === site.siteId,
                    )
                  }
                  locale={locale}
                />
              )}
              {face.faceLabel && (
                <p>
                  {t('Face', 'Face')}{' '}
                  {researchFaceLabel(face.faceLabel, site.isResearchReference, locale)}
                </p>
              )}
              <p
                className={
                  site.isResearchReference
                    ? 'text-muted'
                    : face.availability === 'available'
                      ? 'text-success'
                      : face.availability === 'unavailable'
                        ? 'text-error'
                        : 'text-muted'
                }
              >
                {availabilityLabel(face.availability, site.isDemo, site.isResearchReference)}
              </p>
              {site.isResearchReference && (
                <ResearchReferenceFacts provenance={site.researchProvenance} locale={locale} />
              )}
              {!site.isResearchReference && face.estimate.status === 'ready' && (
                <small>
                  {money(face.estimate.amount, face.estimate.currency, locale)} /{' '}
                  {displayNumber(face.estimate.days, locale)} {t('days', 'jours')}
                </small>
              )}
              {!site.isResearchReference && face.estimate.status === 'unavailable' && (
                <p>
                  {t('Price unavailable', 'Tarif indisponible')} :{' '}
                  {agencyEvidenceText(face.estimate.reason, locale)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {(reply.mode === 'local' || reply.recommendationSummary) &&
        Boolean(reply.questions?.length) && (
          <div className="agency-reply-questions">
            <strong>{t('To clarify', 'À préciser')}</strong>
            <ul>
              {reply.questions!.map((question, index) => (
                <li key={index}>
                  {reply.mode === 'local' ? agencyEvidenceText(question, locale) : question}
                </li>
              ))}
            </ul>
          </div>
        )}
      {facts && (
        <details data-testid="current-draft-facts">
          <summary>{t('Current draft facts', 'Données du brouillon actuel')}</summary>
          <p>
            {t('Checked', 'Vérifiées')} : {displayUtcTimestamp(facts.checkedAt, locale)}
          </p>
          {facts.window && (
            <p>
              {displayDateOnly(facts.window.startDate, locale)} →{' '}
              {displayDateOnly(facts.window.endDate, locale)} ·{' '}
              {t('end exclusive', 'fin exclusive')}
            </p>
          )}
          {facts.selectionTruncated && (
            <p>
              {t(
                'Partial selection: these chat totals cannot establish the full draft’s budget fit.',
                'Sélection partielle : ces totaux du chat ne permettent pas de vérifier le budget du brouillon complet.',
              )}
            </p>
          )}
          <p>
            {t('Current draft media cost', 'Coût média du brouillon actuel')}
            {facts.sites.some(
              (site) =>
                site.isDemo &&
                site.faces.some(
                  (face) =>
                    face.selected &&
                    face.estimate.status === 'ready' &&
                    face.estimate.amount > 0 &&
                    (facts.budget.totals[face.estimate.currency] ?? 0) >= face.estimate.amount,
                ),
            ) && <> · {t('Includes DEMO costs', 'Comprend des coûts DEMO')}</>}{' '}
            :{' '}
            {Object.entries(facts.budget.totals)
              .map(([code, amount]) => money(amount, code, locale))
              .join(' + ') || '—'}
          </p>
          <p>
            {facts.budget.fit === 'within'
              ? t(
                  'Current draft within the stated budget.',
                  'Brouillon actuel dans le budget indiqué.',
                )
              : facts.budget.fit === 'over'
                ? t(
                    'Current draft above the stated budget.',
                    'Brouillon actuel au-dessus du budget indiqué.',
                  )
                : t(
                    'Current draft budget fit remains unconfirmed.',
                    'Le budget du brouillon actuel reste à confirmer.',
                  )}
          </p>
          {facts.researchPrices && (
            <ResearchPriceBaseline
              baseline={facts.researchPrices}
              locale={locale}
              currency={
                facts.requestedBudget?.currency ??
                facts.researchPrices.sources[0]?.currency ??
                'NGN'
              }
            />
          )}
          {faceSources.map(({ site, face }) => (
            <div key={`${site.siteId}:${face.faceId}`}>
              <p>
                <strong>
                  {site.name} {site.isDemo && <span className="agency-data-badge">DEMO</span>}
                  {site.isResearchReference && <ResearchBadge locale={locale} />}
                  {face.faceLabel
                    ? ` · ${t('Face', 'Face')} ${researchFaceLabel(face.faceLabel, site.isResearchReference, locale)}`
                    : ''}
                </strong>
              </p>
              <p>{availabilityLabel(face.availability, site.isDemo, site.isResearchReference)}</p>
              {site.isDemo && site.demoProvenance && (
                <p>{agencyEvidenceText(site.demoProvenance, locale)}</p>
              )}
              {site.isResearchReference ? (
                <ResearchReferenceFacts provenance={site.researchProvenance} locale={locale} />
              ) : face.estimate.status === 'ready' ? (
                <>
                  <p>
                    {money(face.estimate.amount, face.estimate.currency, locale)} /{' '}
                    {displayNumber(face.estimate.days, locale)} {t('days', 'jours')} ·{' '}
                    {money(face.estimate.unitRate, face.estimate.currency, locale)} ×{' '}
                    {displayNumber(face.estimate.quantity, locale)}{' '}
                    {face.estimate.basis === 'perDay' ? t('days', 'jours') : t('weeks', 'semaines')}
                  </p>
                  <p>{agencyEvidenceText(face.estimate.provenance, locale)}</p>
                  {face.estimate.assumptions.map((assumption, index) => (
                    <p key={index}>{agencyEvidenceText(assumption, locale)}</p>
                  ))}
                </>
              ) : (
                <p>
                  {t('Price unavailable', 'Tarif indisponible')} :{' '}
                  {agencyEvidenceText(face.estimate.reason, locale)}
                </p>
              )}
            </div>
          ))}
          {facts.distances.length > 0 && (
            <strong>{t('Current draft spacing', 'Distances du brouillon actuel')}</strong>
          )}
          {facts.distances.slice(0, 10).map((pair) => (
            <p key={`${pair.fromSiteId}:${pair.toSiteId}`}>
              {facts.sites.find((site) => site.siteId === pair.fromSiteId)?.name ??
                t('Board', 'Panneau')}{' '}
              ↔{' '}
              {facts.sites.find((site) => site.siteId === pair.toSiteId)?.name ??
                t('Board', 'Panneau')}{' '}
              :{' '}
              {pair.value == null
                ? '—'
                : `${facts.sites.some((site) => site.isResearchReference && (site.siteId === pair.fromSiteId || site.siteId === pair.toSiteId)) ? '≈ ' : ''}${new Intl.NumberFormat(locale, { maximumFractionDigits: facts.sites.some((site) => site.isResearchReference && (site.siteId === pair.fromSiteId || site.siteId === pair.toSiteId)) ? 1 : 2 }).format(pair.value)}`}{' '}
              km · {t('straight-line', 'à vol d’oiseau')}
              {facts.sites.some(
                (site) =>
                  site.isResearchReference &&
                  (site.siteId === pair.fromSiteId || site.siteId === pair.toSiteId),
              ) && (
                <>
                  {' '}
                  ·{' '}
                  {t(
                    'published points · accuracy unknown',
                    'positions publiées · précision inconnue',
                  )}
                </>
              )}
            </p>
          ))}
          <p>
            {t(
              'OTS and deduplicated reach are unavailable. Residential population is geographic context.',
              'Les occasions de voir et la couverture dédupliquée sont indisponibles. La population résidentielle est un contexte géographique.',
            )}
          </p>
          {facts.assumptions.map((assumption, index) => (
            <p key={index}>{agencyEvidenceText(assumption, locale)}</p>
          ))}
        </details>
      )}
    </div>
  );
}

function RecommendationFacts({
  summary,
  locale,
}: {
  summary: NonNullable<PlannerReply['recommendationSummary']>;
  locale: 'en' | 'fr';
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const accepted = summary.status === 'planning_interest' && summary.faceIds.length > 0;
  return (
    <section
      aria-label={t('Recommended portfolio', 'Portefeuille recommandé')}
      data-testid="recommended-portfolio-facts"
    >
      <strong>{t('Recommended portfolio', 'Portefeuille recommandé')}</strong>
      {!accepted ? (
        <p role="status">
          {summary.status === 'budget_exceeded'
            ? t(
                'Proposal exceeds the comparable media budget. Clarify priorities or budget.',
                'La proposition dépasse le budget média comparable. Précisez les priorités ou le budget.',
              )
            : t(
                'No recommendations accepted. Clarify planning priorities.',
                'Aucune recommandation retenue. Précisez les priorités de planification.',
              )}
        </p>
      ) : (
        <>
          <p>
            {displayNumber(summary.sites.length, locale)} {t('boards', 'panneaux')} ·{' '}
            {summary.coverage.cities.concat(summary.coverage.countries).join(' · ') ||
              t('Market unknown', 'Marché inconnu')}
          </p>
          {summary.window ? (
            <p>
              {displayDateOnly(summary.window.startDate, locale)} →{' '}
              {displayDateOnly(summary.window.endDate, locale)} ·{' '}
              {t('end exclusive', 'fin exclusive')}
            </p>
          ) : (
            <p>{t('Dates unconfirmed', 'Dates non confirmées')}</p>
          )}
          <ResearchPriceBaseline
            baseline={summary.researchPrices}
            locale={locale}
            currency={
              summary.requestedBudget?.currency ??
              summary.researchPrices.sources[0]?.currency ??
              'NGN'
            }
          />
          {Object.keys(summary.budget.totals).length > 0 && (
            <p>
              {t(
                'Recommended portfolio media subtotal',
                'Sous-total média du portefeuille recommandé',
              )}{' '}
              :{' '}
              {Object.entries(summary.budget.totals)
                .map(([currency, amount]) => money(amount, currency, locale))
                .join(' + ')}
            </p>
          )}
          {!summary.researchPrices.referenceCount && (
            <p>
              {summary.budget.fit === 'over'
                ? t('Above the media budget.', 'Au-dessus du budget média.')
                : summary.budget.fit === 'within'
                  ? t(
                      'Published media subtotal within budget; final charges unconfirmed.',
                      'Sous-total média publié dans le budget ; frais définitifs non confirmés.',
                    )
                  : t(
                      'Recommended portfolio budget fit unconfirmed.',
                      'Budget du portefeuille recommandé non confirmé.',
                    )}
            </p>
          )}
          <p>
            {summary.availability === 'indicative'
              ? t(
                  'Availability indicative · no reservation',
                  'Disponibilité indicative · sans réservation',
                )
              : t(
                  'Availability unconfirmed · no reservation',
                  'Disponibilité non confirmée · sans réservation',
                )}
          </p>
          <p>
            {t(
              'Subarea coverage unknown. Confirm required neighborhoods with location evidence.',
              'Couverture des sous-zones inconnue. Confirmez les quartiers requis avec des preuves de localisation.',
            )}
          </p>
          {summary.distances.length > 0 && (
            <details data-testid="recommended-portfolio-spacing">
              <summary>
                {t('Recommended portfolio spacing', 'Distances du portefeuille recommandé')} · km
              </summary>
              {summary.distances.slice(0, 10).map((pair) => {
                const from = summary.sites.find((site) => site.siteId === pair.fromSiteId);
                const to = summary.sites.find((site) => site.siteId === pair.toSiteId);
                const research = from?.isResearchReference || to?.isResearchReference;
                return (
                  <p key={`${pair.fromSiteId}:${pair.toSiteId}`}>
                    {from?.name ?? t('Board', 'Panneau')} ↔ {to?.name ?? t('Board', 'Panneau')} :{' '}
                    {pair.value === null
                      ? t('Unavailable', 'Indisponible')
                      : `${research ? '≈ ' : ''}${displayNumber(pair.value, locale, { maximumFractionDigits: research ? 1 : 2 })} km`}{' '}
                    · {t('straight-line', 'à vol d’oiseau')}
                    {research && (
                      <>
                        {' '}
                        ·{' '}
                        {t(
                          'published points · accuracy unknown',
                          'positions publiées · précision inconnue',
                        )}
                      </>
                    )}
                  </p>
                );
              })}
            </details>
          )}
        </>
      )}
    </section>
  );
}

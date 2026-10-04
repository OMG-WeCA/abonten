'use client';

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
} from '../../lib/agency-api';
import {
  buildPlannerContext,
  buildPlannerRequest,
  isOpenAiReady,
  type PlanningMessage,
} from '../../lib/planner-conversation';
import type {
  FaceCostEstimate,
  PlanningWindow,
  selectionDistances,
  summarizeBudget,
} from '../../lib/agency-planning';
import type { ShortlistFace } from './AgencyDashboard';
import { money } from './BoardDetail';

interface PlannerProps {
  open: boolean;
  orgId: string;
  locale: 'en' | 'fr';
  canPlan: boolean;
  window: PlanningWindow;
  budget: string;
  onBudget: (value: string) => void;
  currency: string;
  onCurrency: (value: string) => void;
  shortlist: ShortlistFace[];
  estimates: FaceCostEstimate[];
  summary: ReturnType<typeof summarizeBudget>;
  distances: ReturnType<typeof selectionDistances>;
  onSelect: (id: string) => void;
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
    'filters' | 'selectedSiteIds' | 'selectedFaceIds' | 'faceCurrencies' | 'selectionTruncated'
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
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'instant' });
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
              return `${a} ↔ ${b}: ${pair.value == null ? t('Unavailable', 'Indisponible') : `${pair.value.toFixed(2)} km`} (${t('straight-line', 'à vol d’oiseau')}).`;
            })
            .join('\n');
      }
      if (reply.mode === 'local' && /budget|cost|price|coût|prix/i.test(text) && shortlist.length) {
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
  const subtotal = summary.totals[currency] ?? 0;
  const budgetAmount = Number(budget);
  const hasBudget =
    budget.trim() !== '' &&
    Number.isFinite(budgetAmount) &&
    budgetAmount > 0 &&
    budgetAmount <= 1e12;
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
            <h2 id="planner-heading">{t('Plan with Abonten', 'Planifier avec Abonten')}</h2>
            <p>
              {statusError || (status !== null && !assistantUsable)
                ? t('Planner connection unavailable', 'Connexion à l’assistant indisponible')
                : external
                  ? `${t('OpenAI configured', 'OpenAI configuré')} · gpt-6-luna`
                  : status === null
                    ? t('Checking planner connection…', 'Vérification de la connexion…')
                    : t('Local planning help · AI not connected', 'Aide locale · IA non connectée')}
            </p>
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
                'Check the planner connection before sending. Your draft is preserved.',
                'Vérifiez la connexion avant l’envoi. Votre brouillon est conservé.',
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
        {external && (
          <p className="agency-assistant-disclosure">
            {t(
              'Chat messages, recent conversation and current planning context are sent to OpenAI. Uploaded briefs stay local unless you allow sharing below.',
              'Les messages, la conversation récente et le contexte de planification sont envoyés à OpenAI. Les documents restent locaux sauf autorisation ci-dessous.',
            )}
          </p>
        )}
        {Boolean(props.plannerSelectionOmittedFaces && props.plannerSelectionOmittedFaces > 0) && (
          <p className="agency-assistant-disclosure" role="status">
            {t(
              `Chat includes up to 12 boards / 24 faces. ${props.plannerSelectionOmittedFaces} draft faces are outside this context; chat totals are partial.`,
              `Le chat inclut jusqu’à 12 panneaux / 24 faces. ${props.plannerSelectionOmittedFaces} faces du brouillon sont hors de ce contexte ; les totaux du chat sont partiels.`,
            )}
          </p>
        )}
        <div className="agency-planner-intro">
          <p>
            {t(
              'A better view of your next campaign.',
              'Une meilleure vue de votre prochaine campagne.',
            )}
          </p>
          <span>
            {t(
              'Explore boards, set your constraints, and build a defensible shortlist.',
              'Explorez les panneaux, définissez vos contraintes et construisez votre sélection.',
            )}
          </span>
        </div>
        <div className="agency-budget-inputs">
          <label className="agency-field">
            <span>{t('Media budget', 'Budget média')}</span>
            <input
              type="number"
              min="1"
              max="1000000000000"
              step="any"
              inputMode="decimal"
              value={budget}
              onChange={(event) => onBudget(event.target.value)}
              placeholder={t('Enter budget', 'Saisir le budget')}
            />
          </label>
          <label className="agency-field">
            <span>{t('Currency', 'Devise')}</span>
            <select value={currency} onChange={(event) => onCurrency(event.target.value)}>
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
              : t('Enter a budget greater than zero.', 'Saisissez un budget supérieur à zéro.')}
          </p>
        )}
        <p className="agency-flight-caption">
          {props.window.startDate} → {props.window.endDate} · {t('end exclusive', 'fin exclusive')}
        </p>
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
                <span className="sr-only">{t('Extracted brief text', 'Texte extrait')}</span>
                <textarea
                  aria-label={t('Extracted brief text', 'Texte extrait')}
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
                <p key={warning}>{warning}</p>
              ))}
              <p>
                {t(
                  'Check budget and currency below. Confirm dates and locations in the map filters.',
                  'Vérifiez le budget et la devise ci-dessous. Confirmez les dates et lieux dans les filtres.',
                )}
              </p>
              {briefText === brief.text && brief.constraints.budget != null && (
                <p>
                  <b>
                    {t('Detected budget', 'Budget détecté')}: {brief.constraints.budget}{' '}
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
                    'Edited text will be confirmed. Set the media budget and currency manually; original detected values are not applied.',
                    'Le texte modifié sera confirmé. Définissez manuellement le budget et la devise ; les valeurs détectées d’origine ne seront pas appliquées.',
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
                      'Include this confirmed brief in OpenAI chat',
                      'Inclure ce document confirmé dans le chat OpenAI',
                    )}
                  </span>
                </label>
                <p>
                  {briefConfirmed
                    ? t(
                        'Only the confirmed text is shared when you send a message. The original file stays local. Editing, replacing or removing the brief clears consent and the conversation.',
                        'Seul le texte confirmé est partagé à l’envoi d’un message. Le fichier original reste local. Modifier, remplacer ou retirer le document réinitialise l’autorisation et la conversation.',
                      )
                    : t(
                        'Confirm the extracted text before allowing sharing with OpenAI.',
                        'Confirmez le texte extrait avant d’autoriser le partage avec OpenAI.',
                      )}
                </p>
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
                    onClick={() => props.onSelect(item.site.id)}
                  >
                    <b className="agency-number-pin">{index + 1}</b>
                    <span>
                      <strong>{item.site.name}</strong>
                      <small>
                        {item.site.faces.find((face) => face.id === item.faceId)?.faceLabel} ·{' '}
                        {item.site.city}
                      </small>
                    </span>
                    <em>
                      {estimate.status === 'ready'
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
                  {estimate.status === 'unavailable' && (
                    <p role="status" className="agency-form-error">
                      {estimate.reason}
                    </p>
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
          </div>
        ) : (
          <div className="agency-empty-shortlist">
            <MapPinIcon />
            <p>
              {t(
                'Start with a place. Build a plan.',
                'Commencez par un lieu. Construisez un plan.',
              )}
            </p>
            <span>
              {t(
                'Select a board on the map to inspect its faces and published rates.',
                'Sélectionnez un panneau sur la carte pour voir ses faces et tarifs.',
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
              ? t('Rebuild shortlist within budget', 'Recréer une sélection selon le budget')
              : t('Find boards within budget', 'Trouver des panneaux selon le budget')}
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
            'Uses the current map filters. Selects one available face per board by lowest published media cost. Replaces your draft; no audience optimization or reservation.',
            'Utilise les filtres actuels. Sélectionne une face disponible par panneau selon le coût média croissant. Remplace le brouillon ; sans optimisation d’audience ni réservation.',
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
            <span className="agency-data-badge">{t('Data needed', 'Données requises')}</span>
          </div>
          <strong>—</strong>
          <p>
            {t(
              'Validated traffic and an approved exposure model are unavailable for this flight.',
              'Le trafic validé et un modèle d’exposition approuvé ne sont pas disponibles pour ces dates.',
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
                'Straight-line distances from registered WGS84 coordinates, using Haversine. These are not road distances or travel times.',
                'Distances à vol d’oiseau selon les coordonnées WGS84 et Haversine. Elles ne représentent pas des trajets ou temps de déplacement.',
              )}
            </p>
            {distances.slice(0, 50).map((pair) => (
              <div key={`${pair.fromSiteId}:${pair.toSiteId}`}>
                <span>
                  {shortlist.find((item) => item.site.id === pair.fromSiteId)?.site.name} ↔{' '}
                  {shortlist.find((item) => item.site.id === pair.toSiteId)?.site.name}
                </span>
                <b>{pair.value == null ? '—' : pair.value.toFixed(2)} km</b>
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
                  <p key={estimate.faceId}>
                    {estimate.provenance} {money(estimate.unitRate, estimate.currency, locale)} ×{' '}
                    {estimate.quantity}{' '}
                    {estimate.basis === 'perDay' ? t('days', 'jours') : t('weeks', 'semaines')}.
                    {estimate.availabilityCheckedAt && (
                      <>
                        {' '}
                        {t('Availability checked', 'Disponibilité vérifiée')}:{' '}
                        {new Date(estimate.availabilityCheckedAt).toLocaleString(locale, {
                          timeZone: 'UTC',
                        })}{' '}
                        UTC.
                      </>
                    )}
                  </p>
                ),
            )}
            {summary.uncheckedCount > 0 && (
              <p>
                {summary.uncheckedCount}{' '}
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
            <button className="agency-text-button" onClick={resetConversation}>
              {t('Clear conversation', 'Effacer la conversation')}
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
                    ? `OpenAI · ${item.reply.model}`
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
              {suggested.budget ?? '—'} {suggested.currency ?? ''}
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
            <p>{error}</p>
            {failedMessage !== null && (
              <>
                <p>
                  {t(
                    'Your message is preserved. Retrying uses the current flight, filters, shortlist and brief-sharing choice.',
                    'Votre message est conservé. La nouvelle tentative utilise les dates, filtres, sélection et choix de partage actuels.',
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
            {t('Reading brief locally…', 'Lecture locale du document…')}
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
        <p>
          {external
            ? t(
                'Messages and planning context sent to OpenAI · briefs require permission',
                'Messages et contexte envoyés à OpenAI · documents avec autorisation',
              )
            : t(
                'Briefs: PDF, PPTX, XLSX, DOCX, text · extracted locally',
                'Documents : PDF, PPTX, XLSX, DOCX, texte · extraction locale',
              )}
        </p>
        {!props.canPlan && (
          <p>
            {t(
              'Campaign creation access is required to plan or upload.',
              'L’autorisation de créer une campagne est requise.',
            )}
          </p>
        )}
      </footer>
    </section>
  );
}

function ReplyFacts({
  reply,
  locale,
  onSelect,
}: {
  reply: PlannerReply;
  locale: 'en' | 'fr';
  onSelect: (id: string) => void;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const facts = reply.facts;
  const references = (reply.recommendations ?? []).flatMap((reference) => {
    const site = facts?.sites.find((candidate) => candidate.siteId === reference.siteId);
    const face = site?.faces.find((candidate) => candidate.faceId === reference.faceId);
    return site && face ? [{ reference, site, face }] : [];
  });
  const availabilityLabel = (value: 'available' | 'unavailable' | 'unknown') =>
    value === 'available'
      ? t(
          'Available at the check time · no reservation',
          'Disponible lors du contrôle · sans réservation',
        )
      : value === 'unavailable'
        ? t('Unavailable for this flight', 'Indisponible pour ces dates')
        : t('Availability needs checking', 'Disponibilité à vérifier');
  const faceSources =
    facts?.sites.flatMap((site) =>
      site.faces
        .filter(
          (face) =>
            face.selected ||
            references.some(
              (candidate) =>
                candidate.site.siteId === site.siteId && candidate.face.faceId === face.faceId,
            ),
        )
        .map((face) => ({ site, face })),
    ) ?? [];
  return (
    <div className="agency-reply-facts">
      {references.length > 0 && (
        <div className="agency-reply-boards">
          {references.map(({ reference, site, face }) => (
            <div key={`${site.siteId}:${face.faceId}`}>
              <button
                type="button"
                className="agency-text-button"
                onClick={() => onSelect(site.siteId)}
                aria-label={`${t('View board', 'Voir le panneau')} ${site.name}`}
              >
                <strong>{site.name}</strong>
              </button>
              <p>{reference.reason}</p>
              {face.faceLabel && (
                <p>
                  {t('Face', 'Face')} {face.faceLabel}
                </p>
              )}
              <p
                className={
                  face.availability === 'available'
                    ? 'text-success'
                    : face.availability === 'unavailable'
                      ? 'text-error'
                      : 'text-muted'
                }
              >
                {availabilityLabel(face.availability)}
              </p>
              {face.estimate.status === 'ready' && (
                <small>
                  {money(face.estimate.amount, face.estimate.currency, locale)} /{' '}
                  {face.estimate.days} {t('days', 'jours')}
                </small>
              )}
              {face.estimate.status === 'unavailable' && (
                <p>
                  {t('Price unavailable', 'Tarif indisponible')} : {face.estimate.reason}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {Boolean(reply.questions?.length) && (
        <div className="agency-reply-questions">
          <strong>{t('To clarify', 'À préciser')}</strong>
          <ul>
            {reply.questions!.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </div>
      )}
      {facts && (
        <details>
          <summary>{t('Checked planning facts', 'Données de planification vérifiées')}</summary>
          <p>
            {t('Checked', 'Vérifiées')} :{' '}
            {new Date(facts.checkedAt).toLocaleString(locale, { timeZone: 'UTC' })} UTC
          </p>
          {facts.window && (
            <p>
              {facts.window.startDate} → {facts.window.endDate} ·{' '}
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
            {t('Published media cost', 'Coût média publié')} :{' '}
            {Object.entries(facts.budget.totals)
              .map(([code, amount]) => money(amount, code, locale))
              .join(' + ') || '—'}
          </p>
          <p>
            {facts.budget.fit === 'within'
              ? t('Within the stated budget.', 'Dans le budget indiqué.')
              : facts.budget.fit === 'over'
                ? t('Above the stated budget.', 'Au-dessus du budget indiqué.')
                : t('Budget fit remains unconfirmed.', 'Le budget reste à confirmer.')}
          </p>
          {faceSources.map(({ site, face }) => (
            <div key={`${site.siteId}:${face.faceId}`}>
              <p>
                <strong>
                  {site.name}
                  {face.faceLabel ? ` · ${t('Face', 'Face')} ${face.faceLabel}` : ''}
                </strong>
              </p>
              <p>{availabilityLabel(face.availability)}</p>
              {face.estimate.status === 'ready' ? (
                <>
                  <p>
                    {money(face.estimate.amount, face.estimate.currency, locale)} /{' '}
                    {face.estimate.days} {t('days', 'jours')} ·{' '}
                    {money(face.estimate.unitRate, face.estimate.currency, locale)} ×{' '}
                    {face.estimate.quantity}{' '}
                    {face.estimate.basis === 'perDay' ? t('days', 'jours') : t('weeks', 'semaines')}
                  </p>
                  <p>{face.estimate.provenance}</p>
                  {face.estimate.assumptions.map((assumption, index) => (
                    <p key={index}>{assumption}</p>
                  ))}
                </>
              ) : (
                <p>
                  {t('Price unavailable', 'Tarif indisponible')} : {face.estimate.reason}
                </p>
              )}
            </div>
          ))}
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
                : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
                    pair.value,
                  )}{' '}
              km · {t('straight-line', 'à vol d’oiseau')}
            </p>
          ))}
          <p>
            {t(
              'OTS and deduplicated reach are unavailable. Residential population is geographic context.',
              'Les occasions de voir et la couverture dédupliquée sont indisponibles. La population résidentielle est un contexte géographique.',
            )}
          </p>
          {facts.assumptions.map((assumption, index) => (
            <p key={index}>{assumption}</p>
          ))}
        </details>
      )}
    </div>
  );
}

function MapPinIcon() {
  return (
    <span className="agency-empty-icon">
      <Sparkles size={24} />
    </span>
  );
}

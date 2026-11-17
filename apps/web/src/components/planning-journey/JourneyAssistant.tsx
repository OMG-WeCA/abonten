'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Send, Sparkles } from 'lucide-react';
import type {
  PlanningAgentRecovery,
  PlanningAgentStudy,
  PlanningAgentTurnRequest,
  PlanningAgentTurnResult,
} from '@abonten/contracts/planning-agent';
import type { AgencyDraft } from '../../lib/agency-draft';
import { apiFetch, apiJson, ApiError } from '../../lib/api';
import { planningInputSignature } from '../../lib/planning-work-session';
import { formatMoney } from '../../lib/number-format';

type Turn = {
  request: PlanningAgentTurnRequest;
  result?: PlanningAgentTurnResult;
  recovery?: PlanningAgentRecovery;
  error?: string;
  stale?: boolean;
  uncertain?: boolean;
};
export function JourneyAssistant({
  orgId,
  locale,
  draft,
  draftName,
  savedDraft,
  replacementVersion,
  visible,
  minimumOpportunities,
  savePending,
  onApply,
  onOpenPlan,
  onEditCampaign,
  onRecoverSave,
}: {
  orgId: string;
  locale: 'en' | 'fr';
  draft: AgencyDraft;
  draftName: string;
  savedDraft?: { id: string; revision: number };
  replacementVersion: number;
  visible: boolean;
  minimumOpportunities: string;
  savePending: boolean;
  onApply: (result: PlanningAgentTurnResult) => void;
  onOpenPlan: (id: string) => void;
  onEditCampaign: () => void;
  onRecoverSave: () => void;
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const [message, setMessage] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [inspected, setInspected] = useState<
    Record<string, { status: string; completed?: number; total?: number }>
  >({});
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const active = useRef<AbortController | null>(null);
  const signature = planningInputSignature([draft, draftName, savedDraft, minimumOpportunities]);
  const identity = useRef({ signature: '', key: '' });
  if (identity.current.signature !== signature)
    identity.current = { signature, key: crypto.randomUUID() };
  const contextKey = identity.current.key;
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  useEffect(() => {
    if (!visible || available !== null) return;
    const controller = new AbortController();
    void apiJson<{ available: boolean }>('/api/planning/v1/agent/status', {
      headers: { 'X-Org-Id': orgId },
      signal: controller.signal,
    }).then(
      (value) => setAvailable(value.available),
      () => setAvailable(false),
    );
    return () => controller.abort();
  }, [orgId, visible, available]);
  useEffect(() => {
    setAvailable(null);
    active.current?.abort();
    setTurns([]);
    setMessage('');
    setBusy(false);
    return () => active.current?.abort();
  }, [orgId]);
  useEffect(() => {
    setMessage('');
  }, [replacementVersion]);

  async function send(request?: PlanningAgentTurnRequest) {
    if (busy || savePending || available !== true || (!request && !message.trim())) return;
    const input: PlanningAgentTurnRequest = request ?? {
      requestId: crypto.randomUUID(),
      contextKey,
      message: message.trim(),
      locale,
      draft: {
        ...draft,
        audiencePlan: {
          targetAudience: '',
          objective: 'reach',
          ...draft.audiencePlan,
          minimumOpportunities,
        },
      },
      draftName,
      ...(savedDraft ? { savedDraft } : {}),
      ...(draft.modelControls?.studyId ? { studyId: draft.modelControls.studyId } : {}),
      history: turns
        .flatMap((turn) =>
          turn.result
            ? [
                { role: 'user' as const, content: turn.request.message },
                { role: 'assistant' as const, content: turn.result.message.slice(0, 4000) },
              ]
            : [],
        )
        .slice(-12),
    };
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    if (!request) setMessage('');
    if (!request) setTurns((rows) => [...rows, { request: input }]);
    const complete = (change: Partial<Turn>) =>
      setTurns((rows) =>
        rows.map((row) =>
          row.request.requestId === input.requestId ? { ...row, ...change } : row,
        ),
      );
    try {
      const response = await apiFetch('/api/planning/v1/agent/turns', {
        method: 'POST',
        headers: { 'X-Org-Id': orgId, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
        timeoutMs: 105_000,
      });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        if (response.status === 409 && body.recovery) {
          complete({ recovery: body as PlanningAgentRecovery, error: undefined });
          return;
        }
        throw new ApiError(
          typeof body.message === 'string'
            ? body.message
            : t('Request failed.', 'La demande a échoué.'),
          response.status,
        );
      }
      const result = body as PlanningAgentTurnResult;
      if (result.requestId !== input.requestId || result.contextKey !== input.contextKey)
        throw new Error(
          t(
            'This reply does not match your request.',
            'Cette réponse ne correspond pas à votre demande.',
          ),
        );
      const stale = currentContext.current !== input.contextKey;
      complete({ result, stale, error: undefined });
      if (!stale) onApply(result);
    } catch (error) {
      if (!controller.signal.aborted)
        complete({
          uncertain: !(error instanceof ApiError) || error.status >= 500,
          error:
            error instanceof TypeError ||
            error instanceof SyntaxError ||
            (error instanceof Error && error.name === 'AbortError')
              ? t(
                  'Connection interrupted. Check the request before sending it again.',
                  'Connexion interrompue. Vérifiez la demande avant de la renvoyer.',
                )
              : error instanceof Error
                ? error.message
                : t(
                    'Request failed. Your plan is kept.',
                    'La demande a échoué. Votre plan est conservé.',
                  ),
        });
      if (error instanceof ApiError && error.status < 500)
        setMessage((value) => value || input.message);
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }
  const unresolved = [...turns]
    .reverse()
    .find((turn) => turn.uncertain && !turn.result && !turn.recovery);
  function studyMetrics(study: PlanningAgentStudy) {
    return (
      <div className="journey-chat-study">
        <span className="journey-role-tag">{study.status}</span>
        <dl className="journey-metric-grid">
          {[
            [t('Primary reach', 'Couverture principale'), study.reach1Plus],
            ...(study.secondary
              ? [[t('Secondary reach', 'Couverture secondaire'), study.secondary.reach1Plus]]
              : []),
          ].map(([label, value]) => (
            <div key={String(label)}>
              <dt>{String(label)}</dt>
              <dd>
                {value == null
                  ? '—'
                  : new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
                      Number(value),
                    )}
              </dd>
            </div>
          ))}
        </dl>
        {study.reasons?.length ? (
          <details>
            <summary>{t('Sources & scope', 'Sources et périmètre')}</summary>
            {study.reasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </details>
        ) : null}
      </div>
    );
  }
  async function inspectStudy(id: string) {
    try {
      const job = await apiJson<{
        status: string;
        progress?: { completed: number; total: number };
      }>(`/api/planning/v1/studies/${encodeURIComponent(id)}`, {
        headers: { 'X-Org-Id': orgId },
        timeoutMs: 60000,
      });
      setInspected((values) => ({ ...values, [id]: { status: job.status, ...job.progress } }));
    } catch {
      setInspected((values) => ({
        ...values,
        [id]: {
          status: t(
            'Could not load calculation. Try again.',
            'Impossible de charger le calcul. Réessayez.',
          ),
        },
      }));
    }
  }
  const name =
    draftName || draft.planning?.brief.summary.slice(0, 70) || t('Current plan', 'Plan actuel');
  return (
    <section
      className="journey-chat"
      aria-label={t('Platform assistant', 'Assistant de la plateforme')}
    >
      <div className="journey-chat-context">
        <strong>{name}</strong>
        <div className="journey-tags">
          <span>
            {draft.faces.length} {t('faces', 'faces')}
          </span>
          {draft.budget && (
            <span>
              {draft.currency} {draft.budget}
            </span>
          )}
          <button type="button" onClick={onEditCampaign}>
            {t('Edit campaign', 'Modifier la campagne')}
          </button>
        </div>
      </div>
      <div className="journey-chat-turns" aria-live="polite">
        {available === false && (
          <div className="journey-chat-result">
            <p>
              {t(
                'Assistant unavailable. You can edit the campaign yourself.',
                'Assistant indisponible. Vous pouvez modifier la campagne.',
              )}
            </p>
            <button className="journey-button" type="button" onClick={onEditCampaign}>
              {t('Edit campaign', 'Modifier la campagne')}
            </button>
          </div>
        )}
        {!turns.length && available === true && (
          <div className="journey-tags">
            {[
              t('Find faces within my budget', 'Trouver des faces dans mon budget'),
              t('Compare my shortlist', 'Comparer ma sélection'),
              t('Update my target audience', 'Modifier ma cible'),
            ].map((prompt) => (
              <button key={prompt} type="button" onClick={() => setMessage(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        )}
        {turns.map((turn) => (
          <article className="journey-chat-exchange" key={turn.request.requestId}>
            <p className="journey-chat-user">{turn.request.message}</p>
            {(turn.result || turn.recovery) && (
              <div className="journey-chat-result">
                <div className="journey-tags">
                  {(turn.result?.events ?? turn.recovery?.events ?? []).map((event) => (
                    <span key={event.id} className={event.status === 'failed' ? 'text-error' : ''}>
                      {event.status === 'succeeded' && <Check size={13} aria-hidden="true" />}
                      {event.label}
                    </span>
                  ))}
                </div>
                <p>{turn.result?.message ?? turn.recovery?.message}</p>
                {turn.result?.study && studyMetrics(turn.result.study)}
                {(turn.result?.events ?? [])
                  .filter((event) => event.error)
                  .map((event) => (
                    <p className="text-error" key={event.id}>
                      {event.error!.message}
                    </p>
                  ))}
                {turn.recovery?.studyId && (
                  <div>
                    <button
                      type="button"
                      className="journey-button"
                      onClick={() => void inspectStudy(turn.recovery!.studyId!)}
                    >
                      {t('Check calculation', 'Vérifier le calcul')}
                    </button>
                    {inspected[turn.recovery.studyId] && (
                      <span className="journey-role-tag">
                        {inspected[turn.recovery.studyId].status}
                      </span>
                    )}
                  </div>
                )}
                {turn.recovery?.code === 'AGENT_REQUEST_IN_PROGRESS' && (
                  <button
                    type="button"
                    className="journey-button"
                    disabled={busy}
                    onClick={() => void send(turn.request)}
                  >
                    {t('Check request', 'Vérifier la demande')}
                  </button>
                )}
                {turn.stale && (
                  <p className="text-warning">
                    {t(
                      'Your plan changed while this request ran. Review its actions before opening a saved result.',
                      'Votre plan a changé pendant la demande. Examinez les actions avant d’ouvrir un résultat enregistré.',
                    )}
                  </p>
                )}
                {turn.result?.faces?.length ? (
                  <div className="journey-chat-faces">
                    {turn.result.faces.map((face) => (
                      <div key={face.faceId}>
                        <div className="journey-chat-face-heading">
                          <strong>
                            {face.siteName} · {face.faceLabel}
                          </strong>
                          <span>
                            {face.cost === null
                              ? '—'
                              : formatMoney(face.cost, face.currency, locale)}
                          </span>
                        </div>
                        <div className="journey-tags">
                          <span
                            title={t(
                              'Distance from campaign centre',
                              'Distance du centre de campagne',
                            )}
                          >
                            {face.distanceFromStudyCenterKm == null
                              ? t('Distance unknown', 'Distance inconnue')
                              : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(face.distanceFromStudyCenterKm)} km ${t('from centre', 'du centre')}`}
                          </span>
                          <span>
                            {face.insideStudyArea === true
                              ? t('In target area', 'Dans la zone ciblée')
                              : face.insideStudyArea === false
                                ? t('Outside target area', 'Hors zone ciblée')
                                : t('Area unconfirmed', 'Zone non confirmée')}
                          </span>
                          <span>
                            {face.availability === 'unavailable'
                              ? t('Unavailable', 'Indisponible')
                              : face.researchReference || face.availability !== 'available'
                                ? t('Confirm availability', 'Disponibilité à confirmer')
                                : t('Available', 'Disponible')}
                          </span>
                          {face.researchReference && (
                            <span>{t('Research estimate', 'Estimation de recherche')}</span>
                          )}
                        </div>
                        {face.costReason && (
                          <details>
                            <summary>{t('Price basis', 'Base du prix')}</summary>
                            <p>{face.costReason}</p>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
                {(turn.result?.alternatives ?? []).map((record) => (
                  <button
                    className="journey-button"
                    type="button"
                    key={record.id}
                    onClick={() => onOpenPlan(record.id)}
                  >
                    {record.name}
                  </button>
                ))}
                {turn.result?.savedDraft && (
                  <button
                    className="journey-button"
                    type="button"
                    onClick={() => onOpenPlan(turn.result!.savedDraft!.id)}
                  >
                    {turn.result.savedDraft.name}
                  </button>
                )}
                {turn.recovery?.savedDraftId && (
                  <button
                    className="journey-button"
                    type="button"
                    onClick={() => onOpenPlan(turn.recovery!.savedDraftId!)}
                  >
                    {t('Open saved plan', 'Ouvrir le plan enregistré')}
                  </button>
                )}
                {turn.recovery?.alternativeIds?.map((id, index) => (
                  <button
                    className="journey-button"
                    type="button"
                    key={id}
                    onClick={() => onOpenPlan(id)}
                  >
                    {t(`Open alternative ${index + 1}`, `Ouvrir la variante ${index + 1}`)}
                  </button>
                ))}
              </div>
            )}
            {turn.error && (
              <div role="alert">
                <p className="text-error">{turn.error}</p>
                <button
                  type="button"
                  className="journey-button"
                  hidden={!turn.uncertain}
                  disabled={busy || savePending}
                  onClick={() => void send(turn.request)}
                >
                  {t('Check request', 'Vérifier la demande')}
                </button>
              </div>
            )}
          </article>
        ))}
        {busy && (
          <p role="status" className="journey-chat-pending">
            <Sparkles size={15} />
            {t('Working on your plan…', 'Traitement de votre plan…')}
          </p>
        )}
      </div>
      {savePending && (
        <button type="button" className="journey-button" onClick={onRecoverSave}>
          {t('Finish pending save', 'Terminer l’enregistrement')}
        </button>
      )}
      <form
        className="journey-chat-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="planning-chat-message">
          {t('Message', 'Message')}
        </label>
        <textarea
          id="planning-chat-message"
          rows={2}
          maxLength={4000}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t('Ask about this plan…', 'Posez une question sur ce plan…')}
        />
        <button
          className="journey-primary"
          type="submit"
          disabled={
            busy || savePending || available !== true || Boolean(unresolved) || !message.trim()
          }
        >
          <Send size={15} />
          {t('Send', 'Envoyer')}
        </button>
      </form>
    </section>
  );
}

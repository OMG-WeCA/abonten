import { parsePlanningFitPreferences } from './planning-fit-preferences';
import type { AssistantStatus, PlannerContext, PlannerReply, PlannerRequest } from './agency-api';
import { planningDays, type PlanningWindow } from './agency-planning';
import { parseAmount } from './number-format';

export interface PlanningMessage {
  role: 'user' | 'assistant';
  text: string;
  reply?: Pick<PlannerReply, 'recommendations' | 'questions'>;
}
const CURRENCIES = new Set(['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR']);
const FORMATS = new Set(['static', 'digital_led', '3d']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const boundedText = (value: string, length: number) => Array.from(value).slice(0, length).join('');

/** Carry the displayed order and references, never the reply's fact/price/brief payloads.
 * Shrink text fields before serialization so the 4,000-character envelope remains
 * complete JSON, even when quotes, control characters or Unicode expand its size. */
function historyContent(item: PlanningMessage): string {
  const recommendations =
    item.role === 'assistant'
      ? (item.reply?.recommendations ?? [])
          .filter((reference) => UUID.test(reference.siteId) && UUID.test(reference.faceId))
          .slice(0, 12)
      : [];
  const questions = item.role === 'assistant' ? (item.reply?.questions ?? []).slice(0, 5) : [];
  if (!recommendations.length && !questions.length) return boundedText(item.text, 4000);
  let messageLimit = 2000;
  let reasonLimit = 240;
  let questionLimit = 200;
  const serialize = () =>
    JSON.stringify({
      message: boundedText(item.text, messageLimit),
      recommendations: recommendations.map((reference, index) => ({
        position: index + 1,
        siteId: reference.siteId,
        faceId: reference.faceId,
        reason: boundedText(reference.reason, reasonLimit),
      })),
      questions: questions.map((question) => boundedText(question, questionLimit)),
    });
  let content = serialize();
  while (content.length > 4000) {
    messageLimit = Math.floor(messageLimit * 0.75);
    reasonLimit = Math.floor(reasonLimit * 0.75);
    questionLimit = Math.floor(questionLimit * 0.75);
    content = serialize();
  }
  return content;
}

export function isOpenAiReady(status: AssistantStatus | null): boolean {
  return (
    status?.mode === 'openai' &&
    status.provider === 'openai' &&
    status.model === 'gpt-6-luna' &&
    status.aiAvailable === true
  );
}

/** Send only the declared context fields; client prices never become provider facts. */
export function buildPlannerContext(
  input:
    | Pick<
        PlannerContext,
        | 'selectedSiteIds'
        | 'selectedFaceIds'
        | 'faceCurrencies'
        | 'selectionTruncated'
        | 'filters'
        | 'fitPreferences'
      >
    | undefined,
  window: PlanningWindow,
  budget: string,
  currency: string,
): PlannerContext {
  const ids = (values: string[] | undefined, limit: number) =>
    [...new Set(values?.filter((value) => UUID.test(value)) ?? [])].slice(0, limit);
  const filters: NonNullable<PlannerContext['filters']> = {};
  for (const key of ['country', 'city', 'format', 'search'] as const) {
    const value = input?.filters?.[key]?.trim();
    if (value && (key !== 'format' || FORMATS.has(value)))
      filters[key] = boundedText(value, key === 'search' ? 160 : 80);
  }
  const amount = parseAmount(budget) ?? NaN;
  const days = planningDays(window);
  const selectedFaceIds = ids(input?.selectedFaceIds, 24);
  const faceCurrencies = [
    ...new Map(
      (input?.faceCurrencies ?? [])
        .filter((item) => selectedFaceIds.includes(item.faceId) && CURRENCIES.has(item.currency))
        .map((item) => [item.faceId, { faceId: item.faceId, currency: item.currency }]),
    ).values(),
  ].slice(0, 24);
  const fitPreferences = parsePlanningFitPreferences(input?.fitPreferences);
  return {
    ...(fitPreferences ? { fitPreferences } : {}),
    selectedSiteIds: ids(input?.selectedSiteIds, 12),
    selectedFaceIds,
    ...(faceCurrencies.length ? { faceCurrencies } : {}),
    ...(input?.selectionTruncated ? { selectionTruncated: true } : {}),
    ...(Object.keys(filters).length ? { filters } : {}),
    ...(days !== null && days <= 366
      ? { window: { startDate: window.startDate, endDate: window.endDate } }
      : {}),
    ...(budget.trim() &&
    Number.isFinite(amount) &&
    amount > 0 &&
    amount <= 1e12 &&
    CURRENCIES.has(currency)
      ? { budget: { amount, currency } }
      : {}),
  };
}

export function buildPlannerRequest(input: {
  message: string;
  locale: 'en' | 'fr';
  status: AssistantStatus | null;
  messages: PlanningMessage[];
  context: PlannerContext;
  briefText: string;
  briefConfirmed: boolean;
  briefConsentText: string | null;
  contextMayContainBrief?: boolean;
}): PlannerRequest {
  const external = isOpenAiReady(input.status);
  const shared =
    external &&
    input.briefConfirmed &&
    input.briefText.trim().length > 0 &&
    input.briefConsentText === input.briefText;
  const localBrief = input.status?.mode === 'local' && input.briefConfirmed;
  // Removing or editing a document does not erase its influence on controls/history.
  // Withhold both until consent to the current confirmed text is present.
  const withholdDerived =
    input.contextMayContainBrief === true && !shared && input.status?.mode !== 'local';
  return {
    message: boundedText(input.message.trim(), 4000),
    locale: input.locale,
    ...(withholdDerived ? {} : { context: input.context }),
    history: (withholdDerived ? [] : input.messages)
      .slice(-8)
      .map((item) => ({ role: item.role, content: historyContent(item) })),
    shareBriefWithProvider: shared,
    ...(input.contextMayContainBrief ? { contextRequiresBriefConsent: true } : {}),
    ...(shared || localBrief ? { briefText: boundedText(input.briefText, 60000) } : {}),
  };
}

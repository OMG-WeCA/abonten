import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import type {
  PlanningAgentEvent,
  PlanningAgentRecovery,
  PlanningAgentTurnRequest,
  PlanningAgentTurnResult,
} from '@abonten/contracts/planning-agent';
import { RedisService } from '../common/redis.service';
import { localizedErrorMessage } from '../common/localized-exception.filter';
import type { PlanningDraftActor } from './planning-drafts.service';
import { normalizePlanningDraft } from './planning-drafts.validation';
import { PlanningAgentProvider } from './planning-agent.provider';
import {
  compactAgentStudy,
  PlanningAgentTools,
  PLANNING_AGENT_TOOLS,
  type PlanningAgentState,
} from './planning-agent.tools';
import { PLANNER_MODEL } from './openai-planner.provider';

interface Receipt {
  fingerprint: string;
  status: 'running' | 'completed' | 'interrupted';
  at: number;
  events: PlanningAgentEvent[];
  savedDraftId?: string;
  alternativeIds?: string[];
  studyId?: string;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Provide a chat request and current working plan.');
  return value as Record<string, unknown>;
}
function text(value: unknown, maximum: number, empty = false) {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    value.includes('\0') ||
    (!empty && !value.trim())
  )
    throw new BadRequestException('The chat request contains an invalid text field.');
  return value;
}
export function normalizeAgentTurn(value: unknown): PlanningAgentTurnRequest {
  const row = object(value);
  if (
    Object.keys(row).some(
      (key) =>
        ![
          'requestId',
          'contextKey',
          'message',
          'locale',
          'history',
          'draft',
          'draftName',
          'savedDraft',
          'studyId',
        ].includes(key),
    ) ||
    !isUUID(row.requestId, '4')
  )
    throw new BadRequestException('Provide a unique chat request identifier and current context.');
  if (row.locale !== 'en' && row.locale !== 'fr')
    throw new BadRequestException('Choose English or French.');
  const history = row.history ?? [];
  if (!Array.isArray(history) || history.length > 12)
    throw new BadRequestException('Keep at most twelve chat messages in context.');
  const normalizedHistory = history.map((value) => {
    const message = object(value);
    if (
      (message.role !== 'user' && message.role !== 'assistant') ||
      Object.keys(message).some((key) => !['role', 'content'].includes(key))
    )
      throw new BadRequestException('Chat history supports user and assistant text only.');
    return { role: message.role as 'user' | 'assistant', content: text(message.content, 4000) };
  });
  let savedDraft: PlanningAgentTurnRequest['savedDraft'];
  if (row.savedDraft !== undefined) {
    const saved = object(row.savedDraft);
    if (
      Object.keys(saved).some((key) => !['id', 'revision'].includes(key)) ||
      !isUUID(saved.id) ||
      !Number.isInteger(saved.revision) ||
      Number(saved.revision) < 1
    )
      throw new BadRequestException('Provide the saved plan identifier and current revision.');
    savedDraft = { id: String(saved.id).toLowerCase(), revision: Number(saved.revision) };
  }
  if (row.studyId !== undefined && !isUUID(row.studyId))
    throw new BadRequestException('Choose a valid study identifier.');
  return {
    requestId: String(row.requestId).toLowerCase(),
    contextKey: text(row.contextKey, 20000),
    message: text(row.message, 8000),
    locale: row.locale,
    history: normalizedHistory,
    draft: normalizePlanningDraft(row.draft),
    draftName: text(row.draftName, 80, true),
    ...(savedDraft ? { savedDraft } : {}),
    ...(row.studyId ? { studyId: String(row.studyId).toLowerCase() } : {}),
  };
}
function errorInfo(error: unknown, locale: 'en' | 'fr') {
  const response = error instanceof HttpException ? error.getResponse() : null;
  const value =
    response && typeof response === 'object' ? (response as Record<string, unknown>) : null;
  const message =
    typeof response === 'string'
      ? response
      : typeof value?.message === 'string'
        ? value.message
        : 'The action could not finish. Retry the remaining work manually.';
  return {
    code:
      typeof value?.code === 'string'
        ? value.code
        : `HTTP_${error instanceof HttpException ? error.getStatus() : 502}`,
    message: (locale === 'fr'
      ? localizedErrorMessage(message, error instanceof HttpException ? error.getStatus() : 502)
      : message
    ).slice(0, 500),
  };
}
/** Deliberate-send agent turns. Only safe action receipts, never chat or unsaved briefs, enter Redis. */
@Injectable()
export class PlanningAgentService {
  constructor(
    private readonly provider: PlanningAgentProvider,
    private readonly tools: PlanningAgentTools,
    private readonly redis: RedisService,
  ) {}
  status() {
    return {
      available: this.provider.configured,
      model: this.provider.configured ? PLANNER_MODEL : null,
    };
  }
  private key(actor: PlanningDraftActor, requestId: string) {
    return `planning-agent:v1:${actor.organizationId}:${actor.userId}:${requestId}`;
  }
  private receipt(
    state: PlanningAgentState,
    fingerprint: string,
    status: Receipt['status'],
  ): Receipt {
    const safe = new Set(['savedDraftId', 'alternativeId', 'revision', 'studyId', 'status']);
    return {
      fingerprint,
      status,
      at: Date.now(),
      events: state.events.map((event) => ({
        id: event.id,
        tool: event.tool,
        status: event.status,
        applied: event.applied,
        label: event.label,
        ...(event.facts
          ? {
              facts: Object.fromEntries(
                Object.entries(event.facts).filter(([key]) => safe.has(key)),
              ),
            }
          : {}),
        ...(event.error
          ? { error: { code: event.error.code, message: 'The action did not complete.' } }
          : {}),
      })),
      ...(state.savedDraft ? { savedDraftId: state.savedDraft.id } : {}),
      alternativeIds: state.alternatives.map((plan) => plan.id),
      ...(state.study ? { studyId: state.study.id } : {}),
    };
  }
  async turn(
    actor: PlanningDraftActor,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<PlanningAgentTurnResult> {
    const request = normalizeAgentTurn(body);
    await this.tools.authorize(actor);
    if (!this.provider.configured)
      throw new ServiceUnavailableException(
        'The assistant is unavailable. You can continue editing and saving the plan manually.',
      );
    signal?.throwIfAborted();
    const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const key = this.key(actor, request.requestId);
    const admitted = await this.redis.instance.set(
      key,
      JSON.stringify({ fingerprint, status: 'running', at: Date.now(), events: [] }),
      'EX',
      86400,
      'NX',
    );
    if (!admitted) {
      const existing = await this.redis.instance.get(key);
      const previous: Receipt | null = existing ? JSON.parse(existing) : null;
      const running = previous?.status === 'running' && Date.now() - previous.at < 120000;
      const recovery: PlanningAgentRecovery = {
        code:
          previous?.fingerprint !== fingerprint
            ? 'AGENT_REQUEST_CONFLICT'
            : running
              ? 'AGENT_REQUEST_IN_PROGRESS'
              : 'AGENT_REQUEST_ALREADY_PROCESSED',
        message: running
          ? 'This request is still running. Check the completed actions before retrying.'
          : 'This request was already handled or interrupted. Open the saved plan or alternatives below before starting another request. Unsaved edits cannot be recovered from this receipt.',
        recovery: previous?.savedDraftId
          ? 'reload_saved_plan'
          : previous?.alternativeIds?.length
            ? 'inspect_saved_alternatives'
            : 'retry_later',
        events: previous?.events ?? [],
        ...(previous?.savedDraftId ? { savedDraftId: previous.savedDraftId } : {}),
        alternativeIds: previous?.alternativeIds ?? [],
        ...(previous?.studyId ? { studyId: previous.studyId } : {}),
      };
      throw new ConflictException(recovery);
    }
    let state: PlanningAgentState;
    try {
      state = await this.tools.initialize(request, actor);
    } catch (error) {
      await this.redis.instance.set(
        key,
        JSON.stringify({ fingerprint, status: 'interrupted', at: Date.now(), events: [] }),
        'EX',
        86400,
      );
      throw error;
    }
    const record = async (status: Receipt['status']) => {
      await this.redis.instance.set(
        key,
        JSON.stringify(this.receipt(state, fingerprint, status)),
        'EX',
        86400,
      );
    };
    let message: string, failure: ReturnType<typeof errorInfo> | undefined;
    try {
      message = await this.provider.run(
        request,
        this.tools.context(state),
        PLANNING_AGENT_TOOLS,
        async (name, args, callId, toolSignal) => {
          let result: Awaited<ReturnType<PlanningAgentTools['execute']>>;
          try {
            result = await this.tools.execute(state, name, args, toolSignal);
          } catch (error) {
            const info = errorInfo(error, request.locale);
            state.events.push({
              id: callId,
              tool: name,
              status: 'failed',
              applied: false,
              label: 'Action not completed',
              error: info,
            });
            await record('running');
            if (
              toolSignal.aborted ||
              !(error instanceof HttpException) ||
              error.getStatus() >= 500 ||
              error.getStatus() === 403
            )
              throw error;
            return { status: 'failed', error: info };
          }
          state.events.push({
            id: callId,
            tool: name,
            status: 'succeeded',
            applied: result.applied ?? false,
            label: result.label,
            ...(result.facts ? { facts: result.facts } : {}),
          });
          // Journal failure must never relabel an already completed domain action as failed.
          await record('running');
          return { status: 'succeeded', ...result };
        },
        actor,
        signal,
      );
      await record('completed');
    } catch (error) {
      failure = errorInfo(error, request.locale);
      message = failure.message;
      try {
        await record('interrupted');
      } catch {
        failure = {
          code: 'AGENT_RECEIPT_UNAVAILABLE',
          message:
            'Completed actions are shown below, but the recovery receipt could not be stored. Open the saved plan before starting another request.',
        };
        message = failure.message;
      }
    }
    return {
      requestId: request.requestId,
      contextKey: request.contextKey,
      status: failure
        ? state.events.some((event) => event.applied)
          ? 'partial'
          : 'failed'
        : 'completed',
      message,
      events: state.events,
      draft: state.draft,
      draftName: state.draftName,
      ...(state.savedDraft ? { savedDraft: state.savedDraft } : {}),
      ...(state.study ? { study: compactAgentStudy(state.study) } : {}),
      ...(state.faces.size ? { faces: [...state.faces.values()] } : {}),
      ...(state.alternatives.length ? { alternatives: state.alternatives } : {}),
      ...(failure ? { error: failure } : {}),
    };
  }
}

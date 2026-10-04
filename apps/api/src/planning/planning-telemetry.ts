import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export const SAFE_PROVIDER_CODES = [
  'model_not_found',
  'insufficient_quota',
  'rate_limit_exceeded',
  'invalid_api_key',
  'unsupported_parameter',
  'permission_denied',
] as const;
export type PlanningOutcome =
  | 'success'
  | 'local_success'
  | 'rate_limited'
  | 'timeout'
  | 'cancelled'
  | 'provider_error'
  | 'invalid_response'
  | 'invalid_reference'
  | 'grounding_error'
  | 'validation_error';
export interface PlanningTelemetryInput {
  event: 'agency_planner.provider' | 'agency_planner.plan';
  requestId: string;
  providerRequestId?: unknown;
  model: 'gpt-6-luna' | null;
  mode: 'openai' | 'local';
  outcome: PlanningOutcome;
  status: number;
  latencyMs: number;
  usage?: unknown;
  providerCode?: unknown;
  grounding?: unknown;
}
export interface PlanningTelemetryRecord {
  event: PlanningTelemetryInput['event'];
  requestId: string | null;
  providerRequestId: string | null;
  model: PlanningTelemetryInput['model'];
  mode: PlanningTelemetryInput['mode'];
  outcome: PlanningOutcome;
  status: number | null;
  latencyMs: number | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  } | null;
  grounding?: {
    pagesRead: number | null;
    candidatesDiscovered: number | null;
    enrichmentReads: number | null;
    enrichmentFailures: number | null;
  };
  providerCode: (typeof SAFE_PROVIDER_CODES)[number] | null;
}
export type PlanningTelemetrySink = (record: PlanningTelemetryRecord) => void;
export const PLANNING_TELEMETRY_SINK = Symbol('PLANNING_TELEMETRY_SINK');
export const planningRequestId = () => randomUUID();
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const outcomes = new Set<PlanningOutcome>([
  'success',
  'local_success',
  'rate_limited',
  'timeout',
  'cancelled',
  'provider_error',
  'invalid_response',
  'invalid_reference',
  'grounding_error',
  'validation_error',
]);
function integer(value: unknown, maximum: number): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
    ? value
    : null;
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function safeProviderCode(value: unknown): PlanningTelemetryRecord['providerCode'] {
  return typeof value === 'string' && SAFE_PROVIDER_CODES.some((code) => code === value)
    ? (value as PlanningTelemetryRecord['providerCode'])
    : null;
}

/** Explicit allowlist; never spread a request, response, error or arbitrary log object. */
export function planningTelemetry(input: PlanningTelemetryInput): PlanningTelemetryRecord {
  const usage = object(input.usage)
    ? {
        inputTokens: integer(input.usage.input_tokens, 10000000),
        outputTokens: integer(input.usage.output_tokens, 10000000),
        totalTokens: integer(input.usage.total_tokens, 10000000),
      }
    : null;
  return {
    event: input.event === 'agency_planner.provider' ? input.event : 'agency_planner.plan',
    requestId:
      typeof input.requestId === 'string' && uuid.test(input.requestId) ? input.requestId : null,
    providerRequestId:
      typeof input.providerRequestId === 'string' &&
      /^req_[A-Za-z0-9_-]{1,96}$/.test(input.providerRequestId)
        ? input.providerRequestId
        : null,
    model: input.model === 'gpt-6-luna' ? input.model : null,
    mode: input.mode === 'openai' ? 'openai' : 'local',
    outcome: outcomes.has(input.outcome) ? input.outcome : 'provider_error',
    status: integer(input.status, 599) !== null && input.status >= 100 ? input.status : null,
    latencyMs: integer(Math.round(input.latencyMs), 86400000),
    usage: usage && Object.values(usage).some((value) => value !== null) ? usage : null,
    providerCode: safeProviderCode(input.providerCode),
    ...(object(input.grounding)
      ? {
          grounding: {
            pagesRead: integer(input.grounding.pagesRead, 3),
            candidatesDiscovered: integer(input.grounding.candidatesDiscovered, 24),
            enrichmentReads: integer(input.grounding.enrichmentReads, 6),
            enrichmentFailures: integer(input.grounding.enrichmentFailures, 6),
          },
        }
      : {}),
  };
}
export function emitPlanningTelemetry(
  input: PlanningTelemetryInput,
  sink?: PlanningTelemetrySink,
): void {
  const record = planningTelemetry(input);
  try {
    if (sink) sink(record);
    else Logger.log(JSON.stringify(record), 'AgencyPlanner');
  } catch {
    /* Telemetry delivery must never change a planning result or trigger a retry. */
  }
}

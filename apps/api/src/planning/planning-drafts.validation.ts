import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type {
  AgencyPlanningDraftV1,
  PlanningFitPreferences,
} from '@abonten/contracts/planning-draft';
import { PLANNING_CURRENCIES, planningDays } from './planning-math';

const invalid = () => new BadRequestException('Invalid personal planning draft.');
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) throw invalid();
  return result;
}
function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length > limit || value.includes('\u0000'))
    throw invalid();
  return value;
}
function currency(value: unknown): string {
  if (typeof value !== 'string' || !(PLANNING_CURRENCIES as readonly string[]).includes(value))
    throw invalid();
  return value;
}
export function normalizeFitPreferences(value: unknown): PlanningFitPreferences {
  const input = object(value, [
    'version',
    'targetAreas',
    'targetCorridors',
    'audienceTags',
    'approachDirection',
    'daypart',
    'goal',
  ]);
  if (input.version !== 1) throw invalid();
  const result: PlanningFitPreferences = { version: 1 };
  for (const key of ['targetAreas', 'targetCorridors', 'audienceTags'] as const) {
    if (input[key] === undefined) continue;
    if (!Array.isArray(input[key]) || input[key].length > 8) throw invalid();
    const values = input[key].map((value) => text(value, 80).trim());
    if (
      values.some((value) => !value) ||
      new Set(values.map((value) => value.toLocaleLowerCase('en'))).size !== values.length
    )
      throw invalid();
    result[key] = values;
  }
  if (input.approachDirection !== undefined) {
    if (!['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].includes(String(input.approachDirection)))
      throw invalid();
    result.approachDirection =
      input.approachDirection as PlanningFitPreferences['approachDirection'];
  }
  if (input.daypart !== undefined) {
    if (!['any', 'day', 'night'].includes(String(input.daypart))) throw invalid();
    result.daypart = input.daypart as PlanningFitPreferences['daypart'];
  }
  if (input.goal !== undefined) {
    if (!['balanced', 'coverage', 'value'].includes(String(input.goal))) throw invalid();
    result.goal = input.goal as PlanningFitPreferences['goal'];
  }
  return result;
}
export function normalizePlanningDraft(value: unknown): AgencyPlanningDraftV1 {
  const input = object(value, [
    'version',
    'briefDerivedContext',
    'fitPreferences',
    'scoringVersion',
    'window',
    'country',
    'query',
    'format',
    'budget',
    'currency',
    'faces',
  ]);
  if (input.version !== 1 || !Array.isArray(input.faces) || input.faces.length > 100)
    throw invalid();
  const rawWindow = object(input.window, ['startDate', 'endDate']);
  const window = { startDate: text(rawWindow.startDate, 10), endDate: text(rawWindow.endDate, 10) };
  if (planningDays(window) === null) throw invalid();
  const ids = new Set<string>();
  const faces = input.faces.map((value: unknown) => {
    const face = object(value, ['siteId', 'faceId', 'pricingCurrency']);
    if (
      typeof face.siteId !== 'string' ||
      !isUUID(face.siteId) ||
      typeof face.faceId !== 'string' ||
      !isUUID(face.faceId)
    )
      throw invalid();
    const siteId = face.siteId.toLowerCase(),
      faceId = face.faceId.toLowerCase();
    if (ids.has(faceId)) throw invalid();
    ids.add(faceId);
    return {
      siteId,
      faceId,
      ...(face.pricingCurrency === undefined
        ? {}
        : { pricingCurrency: currency(face.pricingCurrency) }),
    };
  });
  return {
    version: 1,
    ...(input.briefDerivedContext === true ? { briefDerivedContext: true as const } : {}),
    ...(input.fitPreferences === undefined
      ? {}
      : { fitPreferences: normalizeFitPreferences(input.fitPreferences) }),
    ...(input.scoringVersion === undefined
      ? {}
      : { scoringVersion: text(input.scoringVersion, 64) }),
    window,
    country: text(input.country, 80),
    query: text(input.query, 200),
    format: text(input.format, 40),
    budget: text(input.budget, 40),
    currency: currency(input.currency),
    faces,
  };
}
export function normalizeDraftWrite(value: unknown, mode: 'create' | 'update') {
  const input = object(value, [
    'name',
    'draft',
    mode === 'create' ? 'clientRequestId' : 'revision',
  ]);
  const name = text(input.name, 80).trim();
  if (!name) throw invalid();
  const draft = normalizePlanningDraft(input.draft);
  if (mode === 'create') {
    if (typeof input.clientRequestId !== 'string' || !isUUID(input.clientRequestId, '4'))
      throw invalid();
    return {
      name,
      draft,
      clientRequestId: input.clientRequestId.toLowerCase(),
      revision: undefined,
    };
  }
  if (
    !Number.isInteger(input.revision) ||
    Number(input.revision) < 1 ||
    Number(input.revision) >= 2147483647
  )
    throw invalid();
  return { name, draft, revision: Number(input.revision), clientRequestId: undefined };
}

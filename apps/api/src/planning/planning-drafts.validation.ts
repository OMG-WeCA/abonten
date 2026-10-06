import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { AgencyPlanningDraftV1 } from '@abonten/contracts/planning-draft';
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
export function normalizePlanningDraft(value: unknown): AgencyPlanningDraftV1 {
  const input = object(value, [
    'version',
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

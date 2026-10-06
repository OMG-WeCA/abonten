import { parseAgencyDraft, type AgencyDraft } from './agency-draft';

export interface PlanningWorkSession {
  recordId?: string;
  revision?: number;
  name: string;
  clientRequestId: string;
  savedSignature?: string;
  initialSignature?: string;
  pendingCreate?: { name: string; draft: AgencyDraft };
}
const prefix = 'abonten.agency-draft.v1.meta.';
/** Retrying an earlier missing face must preserve the saved selection order. */
export function orderPlanningFaces<T extends { faceId: string }>(
  faces: T[],
  order: readonly string[],
): T[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...faces].sort(
    (a, b) =>
      (positions.get(a.faceId) ?? Number.MAX_SAFE_INTEGER) -
      (positions.get(b.faceId) ?? Number.MAX_SAFE_INTEGER),
  );
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function key(userId: string, orgId: string): string | null {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(userId) && /^[a-zA-Z0-9_-]{1,128}$/.test(orgId)
    ? `${prefix}${userId}.${orgId}`
    : null;
}
export function planningDraftSignature(draft: AgencyDraft): string {
  const safe = parseAgencyDraft(JSON.stringify(draft));
  return safe ? JSON.stringify(safe) : '';
}
export function parsePlanningWorkSession(raw: string | null): PlanningWorkSession | null {
  if (!raw || raw.length > 90000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    if (!uuid(row.clientRequestId) || typeof row.name !== 'string' || row.name.length > 80)
      return null;
    if (row.recordId !== undefined && !uuid(row.recordId)) return null;
    if (
      row.recordId !== undefined &&
      (!Number.isSafeInteger(row.revision) || Number(row.revision) < 1)
    )
      return null;
    if (
      row.savedSignature !== undefined &&
      (typeof row.savedSignature !== 'string' || !parseAgencyDraft(row.savedSignature))
    )
      return null;
    if (
      row.initialSignature !== undefined &&
      (typeof row.initialSignature !== 'string' || !parseAgencyDraft(row.initialSignature))
    )
      return null;
    let pendingCreate: PlanningWorkSession['pendingCreate'];
    if (row.pendingCreate !== undefined) {
      const pending = row.pendingCreate as Record<string, unknown>;
      const draft =
        pending && typeof pending === 'object'
          ? parseAgencyDraft(JSON.stringify(pending.draft))
          : null;
      if (
        !draft ||
        typeof pending.name !== 'string' ||
        !pending.name.trim() ||
        pending.name.length > 80
      )
        return null;
      pendingCreate = { name: pending.name, draft };
    }
    return {
      name: row.name,
      clientRequestId: row.clientRequestId,
      ...(row.recordId ? { recordId: row.recordId, revision: Number(row.revision) } : {}),
      ...(typeof row.savedSignature === 'string'
        ? { savedSignature: planningDraftSignature(parseAgencyDraft(row.savedSignature)!) }
        : {}),
      ...(typeof row.initialSignature === 'string'
        ? { initialSignature: planningDraftSignature(parseAgencyDraft(row.initialSignature)!) }
        : {}),
      ...(pendingCreate ? { pendingCreate } : {}),
    };
  } catch {
    return null;
  }
}
export function loadPlanningWorkSession(userId: string, orgId: string): PlanningWorkSession | null {
  try {
    const storageKey = key(userId, orgId);
    return storageKey ? parsePlanningWorkSession(sessionStorage.getItem(storageKey)) : null;
  } catch {
    return null;
  }
}
export function savePlanningWorkSession(
  userId: string,
  orgId: string,
  value: PlanningWorkSession,
): boolean {
  try {
    const storageKey = key(userId, orgId),
      safe = parsePlanningWorkSession(JSON.stringify(value));
    if (!storageKey || !safe) return false;
    sessionStorage.setItem(storageKey, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

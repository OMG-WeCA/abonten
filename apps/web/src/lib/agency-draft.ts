import {
  faceFlightEligibility,
  planningDays,
  PLANNING_CURRENCIES,
  summarizeBudget,
  type FaceCostEstimate,
  type PlanningBudget,
  type PlanningAvailability,
  type PlanningWindow,
} from './agency-planning';
import type { SiteDetail, SiteFace } from './sites-api';

/** A shortlist expresses interest only. Unknown commercial facts must not become
 * a reservation, confirmed availability or a complete budget estimate. */
export function draftFaceEligibility(
  site: Pick<SiteDetail, 'id' | 'status' | 'format' | 'permitExpiresAt' | 'isResearchReference'>,
  face: SiteFace | undefined,
  window: PlanningWindow,
  availability: PlanningAvailability,
) {
  if (site.status !== 'listed' || !face)
    return { eligible: false, reason: 'This listed face is no longer available.' };
  const eligibility = faceFlightEligibility(site, face, window);
  if (!eligibility.eligible) return eligibility;
  const matching =
    availability.window?.startDate === window.startDate &&
    availability.window.endDate === window.endDate;
  return matching && availability.status === 'unavailable'
    ? { eligible: false, reason: 'This face is unavailable for the selected flight.' }
    : eligibility;
}

export interface AgencyDraftFace {
  siteId: string;
  faceId: string;
  pricingCurrency?: string;
}
/** Preserve loaded subtotals while every unresolved stored face contributes an
 * unknown estimate. A partial restore cannot claim the whole draft fits. */
export function summarizeDraftBudget(
  estimates: FaceCostEstimate[],
  unresolved: readonly AgencyDraftFace[],
  budget?: PlanningBudget,
) {
  return summarizeBudget(
    [
      ...estimates,
      ...unresolved.map((face): FaceCostEstimate => ({
        status: 'unavailable',
        siteId: face.siteId,
        faceId: face.faceId,
        reason: 'Fresh board facts have not been loaded for this draft face.',
      })),
    ],
    budget,
  );
}
export interface AgencyDraft {
  version: 1;
  window: PlanningWindow;
  country: string;
  query: string;
  format: string;
  budget: string;
  currency: string;
  faces: AgencyDraftFace[];
  /** Local provenance flag only; never stores document content or sharing consent. */
  briefDerivedContext?: true;
}
const PREFIX = 'abonten.agency-draft.v1.';
const MAX_BYTES = 40_000;
export const MAX_DRAFT_FACES = 100;
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const currency = (value: unknown): value is string =>
  typeof value === 'string' && PLANNING_CURRENCIES.some((code) => code === value);
const bounded = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
function key(userId: string, orgId: string): string | null {
  return id(userId) && id(orgId) ? `${PREFIX}${userId}.${orgId}` : null;
}
/** Reconstruct an allowlisted shape, never spreading stored untrusted objects. */
export function parseAgencyDraft(raw: string | null): AgencyDraft | null {
  if (!raw || raw.length > MAX_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const row = value as Record<string, unknown>;
    const dates = row.window as PlanningWindow | undefined;
    if (
      row.version !== 1 ||
      !dates ||
      planningDays(dates) === null ||
      !bounded(row.country, 80) ||
      !bounded(row.query, 200) ||
      !bounded(row.format, 40) ||
      !bounded(row.budget, 40) ||
      !currency(row.currency) ||
      !Array.isArray(row.faces) ||
      row.faces.length > MAX_DRAFT_FACES
    )
      return null;
    const faces: AgencyDraftFace[] = [];
    const seen = new Set<string>();
    for (const input of row.faces) {
      if (!input || typeof input !== 'object') return null;
      const face = input as Record<string, unknown>;
      if (
        !id(face.siteId) ||
        !id(face.faceId) ||
        (face.pricingCurrency !== undefined && !currency(face.pricingCurrency))
      )
        return null;
      if (seen.has(face.faceId)) continue;
      seen.add(face.faceId);
      faces.push({
        siteId: face.siteId,
        faceId: face.faceId,
        ...(face.pricingCurrency ? { pricingCurrency: face.pricingCurrency as string } : {}),
      });
    }
    return {
      version: 1,
      window: { startDate: dates.startDate, endDate: dates.endDate },
      country: row.country,
      query: row.query,
      format: row.format,
      budget: row.budget,
      currency: row.currency,
      faces,
      ...(row.briefDerivedContext === true ? { briefDerivedContext: true as const } : {}),
    };
  } catch {
    return null;
  }
}
export function loadAgencyDraft(userId: string, orgId: string): AgencyDraft | null {
  try {
    const storageKey = key(userId, orgId);
    return storageKey ? parseAgencyDraft(sessionStorage.getItem(storageKey)) : null;
  } catch {
    return null;
  }
}
export function saveAgencyDraft(userId: string, orgId: string, draft: AgencyDraft): boolean {
  try {
    const storageKey = key(userId, orgId);
    const safe = parseAgencyDraft(JSON.stringify(draft));
    if (!storageKey || !safe) return false;
    sessionStorage.setItem(storageKey, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}
/** Called at the authentication boundary, including signout outside the dashboard.
 * No tokens, brief content, model replies or full inventory are stored here. */
export function clearAgencyDrafts(): void {
  try {
    const keys: string[] = [];
    for (let index = 0; index < sessionStorage.length; index++) {
      const storageKey = sessionStorage.key(index);
      if (storageKey?.startsWith(PREFIX)) keys.push(storageKey);
    }
    for (const storageKey of keys) sessionStorage.removeItem(storageKey);
  } catch {
    /* Storage denial must not prevent logout. */
  }
}

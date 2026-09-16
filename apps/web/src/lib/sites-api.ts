// Typed client for the inventory API (apps/api/src/inventory). All calls carry the
// tenant context via the X-Org-Id header, matching the controller's orgContext().
import { apiJson, apiUrl, ApiError } from './api';

export type SiteStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'listed'
  | 'rejected'
  | 'suspended'
  | 'decommissioned';

export interface GeoPoint {
  longitude: number;
  latitude: number;
}

export interface SiteSummary {
  id: string;
  organizationId: string;
  code: string;
  name: string;
  type: string;
  format: string;
  subFormat?: string | null;
  latitude: number;
  longitude: number;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country: string;
  width?: number | null;
  height?: number | null;
  area?: number | null;
  units?: string | null;
  orientationDeg?: number | null;
  viewingDistance?: number | null;
  elevation?: number | null;
  illuminationType: string;
  illuminationHours?: string | null;
  description?: string | null;
  status: SiteStatus;
  rejectionReason?: string | null;
  permitRef?: string | null;
  permitExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on list responses: newest front photo, for thumbnails. Seeded
  * placeholders store an external URL (render directly); uploads store a local
  * ref served through the authenticated /file endpoint. */
  frontAssetId?: string | null;
  frontAssetRef?: string | null;
}

export interface AssetDisplay {
  /** Directly loadable URL (external http(s) ref or resolved object URL). */
  plain: string | null;
  /** Endpoint URL requiring the bearer token, when the ref is stored locally. */
  authUrl: string | null;
}

export interface SiteDetail extends SiteSummary {
  geoPolygon?: GeoPoint[] | null;
  marketId?: string | null;
  faces: SiteFace[];
  assets: SiteAsset[];
  metadata: SiteMetadata[];
  rateCards: RateCard[];
}

export interface SiteFace {
  id: string;
  siteId: string;
  faceLabel: string;
  width: number;
  height: number;
  area: number;
  units: string;
  printableArea?: string | null;
  bookable: boolean;
}

export interface SiteAsset {
  id: string;
  siteId: string;
  faceId?: string | null;
  kind: string; // front | context | night | diagram
  storageRef: string;
  capturedAt?: string | null;
  createdAt: string;
}

export interface SiteMetadata {
  id: string;
  siteId: string;
  dimension: string;
  payload: Record<string, unknown>;
  source?: string | null;
  method?: string | null;
  confidence?: number | null;
  collectedAt?: string | null;
  expiresAt?: string | null;
}

export interface RateCard {
  id: string;
  siteId: string;
  faceId?: string | null;
  currency: string;
  rates: { perDay?: number; perWeek?: number; perMonth?: number };
  seasonalRules?: Record<string, unknown> | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface SiteDraftInput {
  name: string;
  code?: string;
  type?: string;
  format: string;
  latitude: number;
  longitude: number;
  address?: string;
  city: string;
  region?: string;
  country: string;
  width: number;
  height: number;
  units?: string;
  orientationDeg?: number;
  illuminationType: string;
  illuminationHours?: string;
  description?: string;
}

function orgHeaders(orgId: string | undefined): Record<string, string> {
  return orgId ? { 'X-Org-Id': orgId } : {};
}

export class SiteApiError extends ApiError {
  // Re-exported so callers can catch a domain-flavoured error without importing api.ts.
}

function path(p: string): string {
  return `/api/inventory${p}`;
}

async function request<T>(p: string, init: Parameters<typeof apiJson<T>>[1], orgId?: string): Promise<T> {
  const jsonBody = typeof init?.body === 'string';
  return apiJson<T>(path(p), {
    ...init,
    headers: {
      ...(jsonBody ? { 'Content-Type': 'application/json' } : {}),
      ...orgHeaders(orgId),
      ...(init?.headers as Record<string, string>),
    },
  });
}

export function assetFileUrl(asset: Pick<SiteAsset, 'siteId' | 'id'>): string {
  return apiUrl(path(`/sites/${asset.siteId}/assets/${asset.id}/file`));
}

/** Thumbnail source for a list row's front photo (see frontAssetId/frontAssetRef). */
export function siteThumbUrl(site: Pick<SiteSummary, 'id' | 'frontAssetId' | 'frontAssetRef'>): AssetDisplay {
  if (site.frontAssetRef && /^https?:\/\//i.test(site.frontAssetRef)) {
    return { plain: site.frontAssetRef, authUrl: null };
  }
  return site.frontAssetId
    ? { plain: null, authUrl: assetFileUrl({ siteId: site.id, id: site.frontAssetId }) }
    : { plain: null, authUrl: null };
}

export function assetDisplay(asset: SiteAsset): AssetDisplay {
  if (/^https?:\/\//i.test(asset.storageRef)) return { plain: asset.storageRef, authUrl: null };
  return { plain: null, authUrl: assetFileUrl(asset) };
}

// ------------------------------------------------------------------- sites
export type ListSitesParams = { status?: string; page?: number; limit?: number };

export function listSites(
  orgId: string | undefined,
  params: ListSitesParams = {},
): Promise<{ items: SiteSummary[]; total: number }> {
  const query = new URLSearchParams({ limit: String(params.limit ?? 100) });
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  const qs = query.toString();
  return request(`/sites?${qs}`, { method: 'GET' }, orgId);
}

export function getSite(orgId: string | undefined, siteId: string): Promise<SiteDetail> {
  return request(`/sites/${siteId}`, { method: 'GET' }, orgId);
}

export function createSite(
  orgId: string | undefined,
  draft: SiteDraftInput & { clientRequestId?: string },
): Promise<SiteSummary> {
  return request('/sites', { method: 'POST', body: JSON.stringify(draft) }, orgId);
}

export type SitePatch = Omit<
  Partial<SiteDraftInput>,
  'orientationDeg' | 'illuminationHours' | 'address' | 'region' | 'description'
> & {
  orientationDeg?: number | null;
  illuminationHours?: string | null;
  address?: string | null;
  region?: string | null;
  description?: string | null;
};

export function updateSite(
  orgId: string | undefined,
  siteId: string,
  patch: SitePatch,
): Promise<SiteDetail> {
  return request(`/sites/${siteId}`, { method: 'PATCH', body: JSON.stringify(patch) }, orgId);
}

export function submitSite(orgId: string | undefined, siteId: string): Promise<{ status: string }> {
  return request(`/sites/${siteId}/submit`, { method: 'POST' }, orgId);
}

// ------------------------------------------------- platform review actions
export function approveSite(orgId: string | undefined, siteId: string): Promise<{ status: string }> {
  return request(`/sites/${siteId}/approve`, { method: 'POST' }, orgId);
}

export function rejectSite(
  orgId: string | undefined,
  siteId: string,
  reason: string,
): Promise<{ status: string }> {
  return request(`/sites/${siteId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }, orgId);
}

// ------------------------------------------------------------------- faces
export function addFace(
  orgId: string | undefined,
  siteId: string,
  face: { faceLabel: string; width: number; height: number; area: number; units: string; bookable: boolean },
): Promise<SiteFace> {
  return request(`/sites/${siteId}/faces`, { method: 'POST', body: JSON.stringify(face) }, orgId);
}

export function removeFace(orgId: string | undefined, faceId: string): Promise<void> {
  return request(`/faces/${faceId}`, { method: 'DELETE' }, orgId);
}

// ------------------------------------------------------------------ assets
export function uploadAsset(
  orgId: string | undefined,
  siteId: string,
  kind: string,
  file: File,
  signal?: AbortSignal,
): Promise<SiteAsset> {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);
  // Photos up to PHOTO_MAX_BYTES ride on mobile uplinks; give them a long budget.
  return request(
    `/sites/${siteId}/assets`,
    { method: 'POST', body: form, timeoutMs: 120_000, signal },
    orgId,
  );
}

export function deleteAsset(orgId: string | undefined, siteId: string, assetId: string): Promise<void> {
  return request(`/sites/${siteId}/assets/${assetId}`, { method: 'DELETE' }, orgId);
}

// -------------------------------------------------------------- rate cards
export function addRateCard(
  orgId: string | undefined,
  siteId: string,
  card: {
    currency: string;
    rates: { perDay?: number; perWeek?: number; perMonth?: number };
    effectiveFrom: string;
  },
): Promise<RateCard> {
  return request(`/sites/${siteId}/rate-cards`, { method: 'POST', body: JSON.stringify(card) }, orgId);
}

export function endRateCard(
  orgId: string | undefined,
  rateCardId: string,
  effectiveTo: string,
): Promise<RateCard> {
  return request(`/rate-cards/${rateCardId}`, { method: 'PATCH', body: JSON.stringify({ effectiveTo }) }, orgId);
}

export function listSiteRateCards(orgId: string, siteId: string): Promise<RateCard[]> {
  return request(`/sites/${encodeURIComponent(siteId)}/rate-cards`, { method: 'GET' }, orgId);
}

export interface ExchangeSnapshot { source: string; asOf: string; rates: Record<string, number> }
export function getExchangeRates(orgId: string): Promise<ExchangeSnapshot> {
  return request('/exchange-rates', { method: 'GET' }, orgId);
}

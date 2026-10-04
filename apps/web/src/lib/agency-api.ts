import { apiJson } from './api';
import type { SiteDetail } from './sites-api';
import type {
  FaceCostEstimate,
  PlanningWindow,
  selectionDistances,
  summarizeBudget,
} from './agency-planning';

export interface BriefConstraints {
  budget: number | null;
  currency: string | null;
  cities: string[];
  startDate: string | null;
  endDate: string | null;
  evidence: string[];
}

export interface AssistantStatus {
  mode: 'local' | 'openai';
  provider: null | 'openai';
  model: null | 'gpt-6-luna';
  aiAvailable: boolean;
  message: string;
  documentFormats: string[];
  maxUploadBytes: number;
  documentsRetained: false;
  externalTransfer: boolean;
}

export interface ExtractedBrief {
  text: string;
  fileName: string;
  format: string;
  characters: number;
  warnings: string[];
  constraints: BriefConstraints;
  requiresConfirmation: true;
  retained: false;
}

export interface PlannerReply {
  mode: 'local' | 'openai';
  provider: null | 'openai';
  model: null | 'gpt-6-luna';
  aiAvailable: boolean;
  message: string;
  constraints: BriefConstraints;
  missing: string[];
  requiresConfirmation: true;
  briefShared?: boolean;
  recommendations?: { siteId: string; faceId: string; reason: string }[];
  questions?: string[];
  facts?: PlannerFacts;
}

export interface PlannerContext {
  selectedSiteIds?: string[];
  selectedFaceIds?: string[];
  faceCurrencies?: { faceId: string; currency: string }[];
  selectionTruncated?: boolean;
  filters?: { country?: string; city?: string; format?: string; search?: string };
  window?: PlanningWindow;
  budget?: { amount: number; currency: string };
}

export interface PlannerRequest {
  message: string;
  locale?: 'en' | 'fr';
  briefText?: string;
  shareBriefWithProvider?: boolean;
  history?: { role: 'user' | 'assistant'; content: string }[];
  context?: PlannerContext;
}

export interface PlannerFacts {
  checkedAt: string;
  window: PlanningWindow | null;
  requestedBudget?: PlannerContext['budget'] | null;
  filters?: NonNullable<PlannerContext['filters']>;
  selectionTruncated?: boolean;
  sites: {
    siteId: string;
    name: string;
    city: string;
    country: string;
    latitude: number;
    longitude: number;
    faces: {
      faceId: string;
      faceLabel?: string | null;
      selected: boolean;
      availability: 'available' | 'unavailable' | 'unknown';
      estimate: FaceCostEstimate;
    }[];
  }[];
  budget: ReturnType<typeof summarizeBudget>;
  distances: ReturnType<typeof selectionDistances>;
  ots: null;
  reach: null;
  assumptions: string[];
}

export interface SiteOptions {
  siteId: string;
  startDate: string;
  endDate: string;
  checkedAt: string;
  faces: { faceId: string; available: boolean }[];
  reservation: false;
}

function headers(orgId: string): Record<string, string> {
  return { 'X-Org-Id': orgId };
}
const PLANNING_BASE = '/api/planning/v1';

export function getAssistantStatus(orgId: string, signal?: AbortSignal): Promise<AssistantStatus> {
  return apiJson(`${PLANNING_BASE}/assistant/status`, { headers: headers(orgId), signal });
}

export function extractBrief(
  orgId: string,
  file: File,
  signal?: AbortSignal,
): Promise<ExtractedBrief> {
  const form = new FormData();
  form.append('file', file);
  return apiJson(`${PLANNING_BASE}/briefs`, {
    method: 'POST',
    headers: headers(orgId),
    body: form,
    timeoutMs: 30000,
    signal,
  });
}

export function askPlanner(
  orgId: string,
  message: PlannerRequest,
  signal?: AbortSignal,
): Promise<PlannerReply> {
  return apiJson(`${PLANNING_BASE}/assistant`, {
    method: 'POST',
    headers: { ...headers(orgId), 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
    timeoutMs: 45000,
    signal,
  });
}

export function getSiteOptions(
  orgId: string,
  siteId: string,
  window: { startDate: string; endDate: string },
  signal?: AbortSignal,
): Promise<SiteOptions> {
  const query = new URLSearchParams(window);
  return apiJson(`${PLANNING_BASE}/site-options/${encodeURIComponent(siteId)}?${query}`, {
    headers: headers(orgId),
    signal,
  });
}

export interface AgencyMarketplaceQuery {
  city?: string;
  country?: string;
  format?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface AgencyMarketplaceSite {
  id: string;
  code: string;
  name: string;
  format: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  width: number | null;
  height: number | null;
  area: number | null;
  illuminationType: string;
  faceCount: string | number;
  startingPrice: string | number | null;
  thumbnail: string | null;
  keyMetadata: Record<string, unknown> | null;
}

export function searchAgencySites(
  orgId: string,
  filters: AgencyMarketplaceQuery,
  signal?: AbortSignal,
): Promise<{ items: AgencyMarketplaceSite[]; total: number; page: number; limit: number }> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined && value !== '') query.set(key, String(value));
  return apiJson(`/api/marketplace?${query}`, { headers: headers(orgId), signal });
}

export function getAgencySite(
  orgId: string,
  siteId: string,
  signal?: AbortSignal,
): Promise<SiteDetail> {
  return apiJson(`/api/marketplace/${encodeURIComponent(siteId)}`, {
    headers: headers(orgId),
    signal,
  });
}

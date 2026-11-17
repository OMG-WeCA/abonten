import { apiJson } from './api';
import type { AgencyCampaignDetail, AgencyCampaignList } from '@abonten/contracts/agency-campaign';

const path = '/api/planning/v1/campaigns';
export function listAgencyCampaigns(
  orgId: string,
  options: { status?: string; offset?: number; signal?: AbortSignal } = {},
): Promise<AgencyCampaignList> {
  const query = new URLSearchParams({ limit: '50', offset: String(options.offset ?? 0) });
  if (options.status) query.set('status', options.status);
  return apiJson(`${path}?${query}`, { headers: { 'X-Org-Id': orgId }, signal: options.signal });
}
export function getAgencyCampaign(
  orgId: string,
  id: string,
  signal?: AbortSignal,
): Promise<AgencyCampaignDetail> {
  return apiJson(`${path}/${encodeURIComponent(id)}`, { headers: { 'X-Org-Id': orgId }, signal });
}

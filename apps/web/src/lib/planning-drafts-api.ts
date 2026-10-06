import { apiJson } from './api';
import type {
  CreatePlanningDraftInput,
  PlanningDraftList,
  SavedAgencyPlanningDraft,
  UpdatePlanningDraftInput,
} from '@abonten/contracts/planning-draft';

export type {
  AgencyPlanningDraftV1,
  CreatePlanningDraftInput,
  PlanningDraftList,
  SavedAgencyPlanningDraft,
  UpdatePlanningDraftInput,
} from '@abonten/contracts/planning-draft';

const path = '/api/planning/v1/drafts';
const headers = (orgId: string) => ({ 'X-Org-Id': orgId, 'Content-Type': 'application/json' });

export function listPlanningDrafts(
  orgId: string,
  signal?: AbortSignal,
): Promise<PlanningDraftList> {
  return apiJson(path, { headers: headers(orgId), signal });
}
export function getPlanningDraft(
  orgId: string,
  id: string,
  signal?: AbortSignal,
): Promise<SavedAgencyPlanningDraft> {
  return apiJson(`${path}/${encodeURIComponent(id)}`, { headers: headers(orgId), signal });
}
export function createPlanningDraft(
  orgId: string,
  input: CreatePlanningDraftInput,
  signal?: AbortSignal,
): Promise<SavedAgencyPlanningDraft> {
  return apiJson(path, {
    method: 'POST',
    headers: headers(orgId),
    body: JSON.stringify(input),
    signal,
  });
}
export function updatePlanningDraft(
  orgId: string,
  id: string,
  input: UpdatePlanningDraftInput,
  signal?: AbortSignal,
): Promise<SavedAgencyPlanningDraft> {
  return apiJson(`${path}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: headers(orgId),
    body: JSON.stringify(input),
    signal,
  });
}

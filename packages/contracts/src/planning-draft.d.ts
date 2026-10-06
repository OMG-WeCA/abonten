/** Personal planning interest only: no cached commercial facts or document content. */
export interface AgencyPlanningDraftV1 {
  version: 1;
  window: { startDate: string; endDate: string };
  country: string;
  query: string;
  format: string;
  budget: string;
  currency: string;
  faces: { siteId: string; faceId: string; pricingCurrency?: string }[];
}

export interface SavedAgencyPlanningDraft {
  id: string;
  name: string;
  draft: AgencyPlanningDraftV1;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlanningDraftList {
  items: SavedAgencyPlanningDraft[];
  limit: number;
}
export interface CreatePlanningDraftInput {
  name: string;
  draft: AgencyPlanningDraftV1;
  /** Retain this UUID across retries of the same create attempt. */
  clientRequestId: string;
}
export interface UpdatePlanningDraftInput {
  name: string;
  draft: AgencyPlanningDraftV1;
  revision: number;
}

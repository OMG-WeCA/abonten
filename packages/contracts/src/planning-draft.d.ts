import type { PlanningJourneyContext, PlanningStudyTarget } from './planning-study';

/** Confirmed planning preferences, never evidence or scores. */
export interface PlanningFitPreferences {
  version: 1;
  targetAreas?: string[];
  targetCorridors?: string[];
  audienceTags?: string[];
  approachDirection?: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
  daypart?: 'any' | 'day' | 'night';
  goal?: 'balanced' | 'coverage' | 'value';
}

export interface AudiencePlanPreferences {
  objective: 'reach' | 'frequency';
  targetAudience: string;
  minimumOpportunities: string;
}

/** Saved planner controls. Study IDs are revalidated references, never evidence snapshots. */
export interface PlanningModelControls {
  version: 1;
  center?: { latitude: number; longitude: number };
  radiusKm: number;
  daypart?: `${'weekday' | 'weekend'}_${'morning' | 'afternoon' | 'evening' | 'night'}`;
  sampling: { mode: 'recommended' | 'custom'; directedPairs?: number; referencePairs?: number };
  target: PlanningStudyTarget;
  secondaryTarget?: PlanningStudyTarget;
  digitalAllocations?: { faceId: string; advertiserSpotsPerLoop: number }[];
  studyId?: string;
}

/** Personal planning interest only: no cached commercial facts or document content. */
export interface AgencyPlanningDraftV1 {
  version: 1;
  planning?: PlanningJourneyContext;
  /** Origin marker only; never document text or provider-sharing consent. */
  briefDerivedContext?: true;
  fitPreferences?: PlanningFitPreferences;
  audiencePlan?: AudiencePlanPreferences;
  modelControls?: PlanningModelControls;
  /** Informational only: all scores are recalculated from current authorized facts. */
  scoringVersion?: string;
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

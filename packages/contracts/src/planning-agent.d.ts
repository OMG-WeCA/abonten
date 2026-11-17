import type { AgencyPlanningDraftV1, SavedAgencyPlanningDraft } from './planning-draft';
import type { PlanningStudyJob } from './planning-study';

export interface PlanningAgentSecCoverage {
  status: 'modeled' | 'unavailable';
  referenceVersion: string;
  geographicGrain: string;
  classifiedShare: number | null;
  unknownShare: number | null;
  reasons: string[];
}

export interface PlanningAgentTurnRequest {
  requestId: string;
  /** Browser context identity; discard a response when the working plan has changed. */
  contextKey: string;
  message: string;
  locale: 'en' | 'fr';
  history?: { role: 'user' | 'assistant'; content: string }[];
  draft: AgencyPlanningDraftV1;
  draftName: string;
  savedDraft?: { id: string; revision: number };
  studyId?: string;
}

export interface PlanningAgentEvent {
  id: string;
  tool: string;
  status: 'succeeded' | 'failed';
  /** An actual working-plan change, durable save or started/cancelled study. */
  applied: boolean;
  label: string;
  facts?: Record<string, string | number | boolean | null>;
  error?: { code: string; message: string };
}

export interface PlanningAgentFace {
  siteId: string;
  faceId: string;
  siteName: string;
  faceLabel: string;
  format: string;
  researchReference: boolean;
  /** Authorized inventory coordinates; missing/invalid axes stay null. */
  coordinates: { latitude: number | null; longitude: number | null };
  /** Great-circle distance from the current study center. */
  distanceFromStudyCenterKm: number | null;
  insideStudyArea: boolean | null;
  insideStudyCatchment: boolean | null;
  availability: 'available' | 'unavailable' | 'unknown';
  cost: number | null;
  currency: string;
  costReason?: string;
}

/** Current canonical study metrics, without repeating retained route geometry. */
export interface PlanningAgentStudy {
  id: string;
  status: PlanningStudyJob['status'];
  progress: PlanningStudyJob['progress'];
  error: PlanningStudyJob['error'];
  resultStatus?: 'ready' | 'partial' | 'unavailable';
  targetPopulation?: number | null;
  targetingStatus?: 'supported' | 'unavailable';
  audienceStatus?: 'ready' | 'partial' | 'unavailable';
  reach1Plus?: number | null;
  reachNPlus?: number | null;
  averageFrequency?: number | null;
  recommendedFaceIds?: string[];
  recommendedCost?: number;
  currency?: string;
  reasons?: string[];
  criterionCoverage?: string[];
  sec?: PlanningAgentSecCoverage;
  secondary?: {
    targetingStatus: 'supported' | 'unavailable';
    audienceStatus: 'ready' | 'partial' | 'unavailable';
    targetPopulation: number | null;
    reach1Plus: number | null;
    reachNPlus: number | null;
    averageFrequency: number | null;
    reasons: string[];
    criterionCoverage: string[];
    sec?: PlanningAgentSecCoverage;
  };
}

export interface PlanningAgentTurnResult {
  requestId: string;
  contextKey: string;
  status: 'completed' | 'partial' | 'failed';
  message: string;
  events: PlanningAgentEvent[];
  draft: AgencyPlanningDraftV1;
  draftName: string;
  savedDraft?: SavedAgencyPlanningDraft;
  study?: PlanningAgentStudy;
  faces?: PlanningAgentFace[];
  alternatives?: SavedAgencyPlanningDraft[];
  error?: { code: string; message: string };
}

/** Duplicate requests do not rerun provider calls or tools; transient chat is not retained. */
export interface PlanningAgentRecovery {
  code: 'AGENT_REQUEST_ALREADY_PROCESSED' | 'AGENT_REQUEST_IN_PROGRESS' | 'AGENT_REQUEST_CONFLICT';
  message: string;
  recovery: 'reload_saved_plan' | 'inspect_saved_alternatives' | 'retry_later';
  events: PlanningAgentEvent[];
  savedDraftId?: string;
  alternativeIds?: string[];
  studyId?: string;
}

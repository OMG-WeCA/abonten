/** Shared, versioned inputs and outputs for the map-led planning study. End dates are exclusive. */
export interface PlanningStudyPoint {
  longitude: number;
  latitude: number;
}
export interface PlanningStudyDaypart {
  id: string;
  label: string;
  localHour: number;
  dayType?: 'weekday' | 'weekend' | 'all';
}
export type PlanningSecGroup = 'A' | 'B' | 'C1' | 'C2' | 'D' | 'E';
export interface PlanningStudyTarget {
  /** Empty controls mean all modeled residents/travel purposes. Zone IDs come from study zones. */
  locations?: number[];
  travelPurposes?: string[];
  ageBands?: string[];
  sex?: 'female' | 'male';
  /** Selected Abonten modeled SEC groups; source/method versions are resolved internally. */
  sec?: { groups: PlanningSecGroup[] };
  household?: {
    parentsOfSchoolChildren?: {
      /** Unresolved ages can be saved; a study requires both bounds. */
      childAgeMin?: number;
      childAgeMax?: number;
      schoolLocation?: { scope: 'study_area'; label?: string };
    };
    /** Explicit chosen TG requirement; offer price never populates this field. */
    economicDescription?: string;
  };
  /** Retained audience requirements without usable qualification evidence. Never ignored. */
  unsupportedCriteria?: string[];
}
export interface PlanningTargetGroup {
  description: string;
  rationale: string;
  criteria: PlanningStudyTarget;
}
export interface PlanningJourneyContext {
  version: 1;
  /** Planner-editable brief; legacy offer text remains readable until consolidated by an edit. */
  brief: { summary: string; offer?: string };
  /** Primary audience: the sole audience optimized by Composite. */
  targetGroup: PlanningTargetGroup;
  secondaryTargetGroup?: PlanningTargetGroup;
  strategy: {
    summary: string;
    rationale: string;
    geography?: { center: PlanningStudyPoint; radiusKm: number };
    dayparts?: PlanningStudyDaypart[];
    objective?: 'reach' | 'frequency';
    minimumOpportunities?: number;
  };
  origin: 'manual' | 'ai';
}
/** Only fields stated in an uploaded brief are returned. Missing fields stay unchanged. */
export interface PlanningCampaignTargetPatch {
  /** Additional explicit requirements; preserve unrelated existing requirements when applying. */
  unsupportedCriteria?: string[];
  description?: string;
  ageBands?: string[];
  sex?: 'female' | 'male' | null;
  sec?: { groups: PlanningSecGroup[] };
  travelPurposes?: string[];
  parentsOfSchoolChildren?: {
    childAgeMin?: number;
    childAgeMax?: number;
    schoolLocation?: { scope: 'study_area'; label?: string };
  } | null;
}
export interface PlanningCampaignFieldPatch {
  description?: string;
  primaryTargetGroup?: PlanningCampaignTargetPatch;
  secondaryTargetGroup?: PlanningCampaignTargetPatch | null;
  objective?: 'reach' | 'frequency';
  minimumOpportunities?: number;
  budget?: { amount?: number; currency?: string };
  flight?: { startDate?: string; endDate?: string };
  countryCode?: string;
  daypartIds?: string[];
}
export interface PlanningBriefFieldsRequest {
  locale?: 'en' | 'fr';
  countryCode: string;
  /** Ephemeral document text submitted by the explicit extraction action. */
  briefText: string;
}
export interface PlanningBriefFieldsResult {
  fields: PlanningCampaignFieldPatch;
  notes: string[];
}

export interface PlanningStudyAssumptions {
  tripsPerPersonPerDay: number;
  participation: number;
  /** Share retaining the same trip pair and route across days. */
  recurrence: number;
  weekendTripMultiplier: number;
}
export interface PlanningStudyRequest {
  countryCode: string;
  planning?: PlanningJourneyContext;
  center: PlanningStudyPoint;
  radiusKm: number;
  timeZone: string;
  flight: { startDate: string; endDate: string };
  budget: { amount: number; currency: string };
  objective: 'reach' | 'frequency';
  minimumOpportunities: number;
  faces: { siteId: string; faceId: string }[];
  selectedFaceIds?: string[];
  dayparts: PlanningStudyDaypart[];
  sampling: { mode: 'recommended' | 'custom'; directedPairs?: number; referencePairs?: number };
  /** Primary audience. */
  target: PlanningStudyTarget;
  secondaryTarget?: PlanningStudyTarget;
  assumptions: PlanningStudyAssumptions;
  /** Explicit planned advertiser plays, evenly spaced through the recorded loop. */
  digitalAllocations?: { faceId: string; advertiserSpotsPerLoop: number }[];
  confirmPublicRoadTransfer: true;
}
/** Customer input omits internal calibration and normally uses recommended sampling. */
export type PlanningStudyInput = Omit<PlanningStudyRequest, 'assumptions' | 'sampling'> & {
  sampling?: PlanningStudyRequest['sampling'];
};
export interface PlanningStudySource {
  layer: string;
  sourceKey: string;
  version: string;
  referenceYear: number;
  attribution: string;
  licenceUrl: string;
}
export interface PlanningStudyIssue {
  code: string;
  message: string;
  action: string;
  faceId?: string;
}
export interface PlanningStudyFacePeriod {
  daypartId: string;
  direction: 'forward' | 'reverse' | null;
  passingWeight: number;
  directionalWeight: number;
  directionShare: number | null;
  directionalDemand: number | null;
  viewabilityFit: number | null;
  assessmentCoverage: number | null;
  timeInViewSeconds: number | null;
  speedKph: number | null;
  visibleDistanceMetres: number | null;
  trafficEvidence: 'indicated' | 'unconfirmed' | 'unavailable';
  unavailableReasons: string[];
}
export interface PlanningStudyFace {
  siteId: string;
  faceId: string;
  siteName: string;
  faceLabel: string;
  longitude: number;
  latitude: number;
  selected: boolean;
  researchReference: boolean;
  commerciallyEligible: boolean;
  commercialReason: string | null;
  flightCost: number | null;
  currency: string;
  availability: 'available' | 'unavailable' | 'unknown';
  approach:
    (PlanningStudyPoint & { bearingDeg: number; halfWidthMetres: number; source: string }) | null;
  profile: Record<string, unknown> | null;
  illumination?: { type: string | null; hours: string | null };
  digital?: {
    spotLengthSeconds: number | null;
    loopLengthSeconds: number | null;
    capacitySpotsPerLoop: number | null;
    advertiserSpotsPerLoop: number | null;
  };
  periods: PlanningStudyFacePeriod[];
}
export interface PlanningStudyDistributionBin {
  opportunities: number;
  people: number;
}
export interface PlanningStudyAudienceScenario {
  id: 'lower' | 'base' | 'higher';
  population: number;
  participatingPopulation: number;
  modeledOtsImpressions: number;
  reach1Plus: number;
  reachNPlus: number;
  reach1PlusPercent: number | null;
  reachNPlusPercent: number | null;
  averageOtsFrequency: number | null;
  distribution: PlanningStudyDistributionBin[];
  assumptions: PlanningStudyAssumptions;
}
export interface PlanningStudySamplingCheck {
  directedPairs: number;
  maximumDifferencePp: number | null;
  minimumPassingWeightCoverage: number | null;
  passes: boolean;
}
export interface PlanningStudyResult {
  version: 'integrated-planning-v1';
  studyId: string;
  status: 'ready' | 'partial' | 'unavailable';
  generatedAt: string;
  inputSignature: string;
  countryCode: string;
  flight: { startDate: string; endDate: string };
  timeZone: string;
  objective: 'reach' | 'frequency';
  minimumOpportunities: number;
  target: PlanningStudyTarget;
  planning?: PlanningJourneyContext;
  /** Separately reported on the same fixed cohorts; audiences can overlap. */
  secondary?: {
    target: PlanningStudyTarget;
    targeting: PlanningStudyResult['targeting'];
    audience: PlanningStudyResult['audience'];
  };
  targeting: {
    status: 'supported' | 'unavailable';
    population: number | null;
    sources: PlanningStudySource[];
    reasons: string[];
    limitations?: string[];
    sec?: {
      status: 'modeled' | 'unavailable';
      referenceVersion: string;
      method: string;
      geographicGrain: string;
      sources: PlanningStudySource[];
      classifiedShare: number | null;
      unknownShare: number | null;
      /** Unclassified adult mass that could qualify; excludes people under18. */
      unknownPotentialShare: number | null;
      publication: {
        status: 'available' | 'withheld';
        policyVersion: string;
        maximumOptimizerSpreadPp: number;
      };
      identification: {
        optimizerMinPopulation: number;
        optimizerMaxPopulation: number;
        spreadPp: number;
        denominator: 'selected_adults';
      } | null;
      range: { lower: number | null; base: number | null; higher: number | null };
      reasons: string[];
      limitations: string[];
    };
    household?: {
      referenceVersion: string;
      method: string;
      geographicGrain: string | null;
      range: { lower: number | null; base: number | null; higher: number | null };
      schoolCoverage?: {
        mappedSchools: number;
        selectedMappedSchools: number;
        modeledDestinationCoverage: number;
      };
    };
    supportedAgeBands?: string[];
    sexSupported?: boolean;
    sourceResolutionMetres?: number;
    calculationBasis?: string;
  };
  population: {
    residents: number | null;
    coverage: number | null;
    geographicBasis: string;
    modeledPeople: number;
    calibration: 'uncalibrated';
  };
  sources: PlanningStudySource[];
  zones: {
    id: number;
    residents: number | null;
    populationCoverage: number;
    places: Record<string, number>;
    roadPoint: PlanningStudyPoint | null;
    insideStudyArea: boolean;
  }[];
  sampling: {
    mode: 'recommended' | 'custom';
    usedDirectedPairs: number;
    referenceDirectedPairs: number;
    recommendedDirectedPairs: number | null;
    generatedDirectedPairs: number;
    localDirectedPairs: number;
    throughDirectedPairs: number;
    maximumDifferencePp: number | null;
    minimumPassingWeightCoverage: number | null;
    stable: boolean;
    reason: string;
    checks: PlanningStudySamplingCheck[];
    periods: {
      daypartId: string;
      candidateRoutes: number;
      routedPairs: number;
      unresolvedDemandShare: number;
      selectedDemandShare: number;
    }[];
  };
  /** Fixed public road approaches used by the directional-demand percentile. */
  benchmarks?: {
    method: string;
    approaches: {
      id: string;
      longitude: number;
      latitude: number;
      bearingDeg: number;
      halfWidthMetres: number;
      direction: 'forward' | 'reverse';
      source: string;
    }[];
    periods: { daypartId: string; approachCount: number; matchedApproachCount: number }[];
  };
  faces: PlanningStudyFace[];
  routes: {
    id: string;
    pairId: string;
    daypartId: string;
    points: PlanningStudyPoint[];
    pairShare: number;
    demandWeight: number;
    faceIds: string[];
    durationSeconds: number;
    distanceMetres: number;
    durationEvidence: string;
  }[];
  audience: {
    status: 'ready' | 'partial' | 'unavailable';
    includedFacePeriods?: {
      faceId: string;
      daypartId: string;
      assessmentCoverage: number | null;
    }[];
    excludedFacePeriods?: { faceId: string; daypartId: string; reasons: string[] }[];
    coverageBasis?: string;
    basis: 'modeled_ots';
    minimumOpportunities: number;
    scenarios: PlanningStudyAudienceScenario[];
    reasons: string[];
    assumptions: string[];
  };
  composite: {
    status: 'ready' | 'partial' | 'unavailable';
    objective: 'reach' | 'frequency';
    selectedFaceIds: string[];
    totalCost: number;
    currency: string;
    remainingBudget: number;
    objectivePeople: number;
    rows: {
      faceId: string;
      order: number;
      flightCost: number;
      incrementalPeople: number;
      totalObjectivePeople: number;
      reason: string;
    }[];
    excluded: { faceId: string; reason: string }[];
  };
  issues: PlanningStudyIssue[];
  warnings: string[];
}
export interface PlanningStudyReadiness {
  status: 'ready' | 'partial' | 'unavailable';
  referenceVersion: string;
  footprint: { center: PlanningStudyPoint; radiusKm: number; schoolBasis: string };
  targeting: PlanningStudyResult['targeting'];
  secondary?: { target: PlanningStudyTarget; targeting: PlanningStudyResult['targeting'] };
  population: { residents: number | null; coverage: number | null };
  faces: {
    total: number;
    withViewingProfile: number;
    missing: { faceId: string; issues: string[] }[];
  };
  sources: PlanningStudySource[];
  issues: string[];
}
export interface PlanningStudyJob {
  id: string;
  status: 'queued' | 'running' | 'ready' | 'failed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  progress: { completed: number; total: number; stage: string };
  request: PlanningStudyRequest;
  error: { message: string; retryable: boolean; code?: string; action?: string } | null;
  result: PlanningStudyResult | null;
}
export interface PlanningStudyEvaluateRequest {
  digitalAllocations?: { faceId: string; advertiserSpotsPerLoop: number }[];
  faceIds: string[];
  minimumOpportunities: number;
  objective?: 'reach' | 'frequency';
  budget?: { amount: number; currency: string };
  faces?: { siteId: string; faceId: string }[];
}

/** POST /studies/:id/compare returns an evaluation without changing the retained study. */
export type PlanningStudyCompareRequest = PlanningStudyEvaluateRequest;

/** Reuses geometry already loaded from GET or the initial completed job. */
export type PlanningStudyEvaluation = Omit<PlanningStudyResult, 'routes'> & {
  routeFaceMatches: { id: string; faceIds: string[] }[];
};

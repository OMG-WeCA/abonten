import { planningJourneySchema, planningTargetSchema } from './planning-journey.openapi';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
const point: SchemaObject = {
  type: 'object',
  required: ['longitude', 'latitude'],
  properties: {
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    latitude: { type: 'number', minimum: -85, maximum: 85 },
  },
};
const refs: SchemaObject = {
  type: 'array',
  minItems: 1,
  maxItems: 100,
  items: {
    type: 'object',
    required: ['siteId', 'faceId'],
    properties: {
      siteId: { type: 'string', format: 'uuid' },
      faceId: { type: 'string', format: 'uuid' },
    },
  },
};
const ids: SchemaObject = {
  type: 'array',
  maxItems: 100,
  uniqueItems: true,
  items: { type: 'string', format: 'uuid' },
};
const digitalAllocations: SchemaObject = {
  type: 'array',
  maxItems: 100,
  items: {
    type: 'object',
    required: ['faceId', 'advertiserSpotsPerLoop'],
    properties: {
      faceId: { type: 'string', format: 'uuid' },
      advertiserSpotsPerLoop: {
        type: 'integer',
        minimum: 0,
        maximum: 10000,
        description:
          'Planned advertiser plays, evenly spaced through one recorded loop; cannot exceed screen capacity.',
      },
    },
  },
};
const budget: SchemaObject = {
  type: 'object',
  required: ['amount', 'currency'],
  properties: {
    amount: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 1e12 },
    currency: { type: 'string', enum: ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'] },
  },
};
export const planningStudyRequestSchema: SchemaObject = {
  type: 'object',
  required: [
    'countryCode',
    'center',
    'radiusKm',
    'timeZone',
    'flight',
    'budget',
    'objective',
    'minimumOpportunities',
    'faces',
    'dayparts',
    'target',
    'confirmPublicRoadTransfer',
  ],
  properties: {
    planning: planningJourneySchema,
    countryCode: { type: 'string', enum: ['NG', 'GH', 'BJ', 'CI', 'CM'] },
    center: point,
    radiusKm: { type: 'number', minimum: 0.5, maximum: 10 },
    timeZone: { type: 'string', description: 'The selected market IANA time zone.' },
    flight: {
      type: 'object',
      required: ['startDate', 'endDate'],
      properties: {
        startDate: { type: 'string', format: 'date' },
        endDate: {
          type: 'string',
          format: 'date',
          description: 'First local day outside the flight.',
        },
      },
    },
    budget,
    objective: { type: 'string', enum: ['reach', 'frequency'] },
    minimumOpportunities: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    faces: refs,
    selectedFaceIds: ids,
    dayparts: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        required: ['id', 'label', 'localHour'],
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          localHour: { type: 'integer', minimum: 0, maximum: 23 },
          dayType: { type: 'string', enum: ['all', 'weekday', 'weekend'] },
        },
      },
    },
    sampling: {
      type: 'object',
      required: ['mode'],
      properties: {
        mode: { type: 'string', enum: ['recommended', 'custom'] },
        directedPairs: { type: 'integer', minimum: 2, maximum: 200, multipleOf: 2 },
        referencePairs: { type: 'integer', minimum: 2, maximum: 200, multipleOf: 2 },
      },
    },
    target: planningTargetSchema,
    secondaryTarget: planningTargetSchema,
    assumptions: {
      type: 'object',
      description: 'Internal versioned methodology. Customer-supplied values are not applied.',
      readOnly: true,
      required: ['tripsPerPersonPerDay', 'participation', 'recurrence', 'weekendTripMultiplier'],
      properties: {
        tripsPerPersonPerDay: { type: 'number', minimum: 0.1, maximum: 10 },
        participation: { type: 'number', minimum: 0.01, maximum: 1 },
        recurrence: { type: 'number', minimum: 0, maximum: 1 },
        weekendTripMultiplier: { type: 'number', minimum: 0.1, maximum: 3 },
      },
    },
    digitalAllocations,
    confirmPublicRoadTransfer: { type: 'boolean', enum: [true] },
  },
};
export const planningStudyEvaluateSchema: SchemaObject = {
  type: 'object',
  required: ['faceIds', 'minimumOpportunities'],
  properties: {
    faceIds: ids,
    digitalAllocations,
    minimumOpportunities: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
    objective: { type: 'string', enum: ['reach', 'frequency'] },
    budget,
    faces: refs,
  },
};
const num: SchemaObject = { type: 'number' };
const nullableNumber: SchemaObject = { type: 'number', nullable: true };
const str: SchemaObject = { type: 'string' };
const strings: SchemaObject = { type: 'array', items: str };
function object(
  properties: Record<string, SchemaObject>,
  required = Object.keys(properties),
): SchemaObject {
  return { type: 'object', required, properties };
}
function list(items: SchemaObject): SchemaObject {
  return { type: 'array', items };
}
const source = object({
  layer: str,
  sourceKey: str,
  version: str,
  referenceYear: num,
  attribution: str,
  licenceUrl: str,
});
const flight = planningStudyRequestSchema.properties!.flight as SchemaObject;
const target = planningStudyRequestSchema.properties!.target as SchemaObject;
const assumptions = planningStudyRequestSchema.properties!.assumptions as SchemaObject;
const period = object({
  daypartId: str,
  direction: { type: 'string', enum: ['forward', 'reverse'], nullable: true },
  passingWeight: num,
  directionalWeight: num,
  directionShare: nullableNumber,
  directionalDemand: nullableNumber,
  viewabilityFit: nullableNumber,
  assessmentCoverage: nullableNumber,
  timeInViewSeconds: nullableNumber,
  speedKph: nullableNumber,
  visibleDistanceMetres: nullableNumber,
  trafficEvidence: { type: 'string', enum: ['indicated', 'unconfirmed', 'unavailable'] },
  unavailableReasons: strings,
});
const check = object({
  directedPairs: num,
  maximumDifferencePp: nullableNumber,
  minimumPassingWeightCoverage: nullableNumber,
  passes: { type: 'boolean' },
});
const approach = object({
  longitude: num,
  latitude: num,
  bearingDeg: num,
  halfWidthMetres: num,
  source: str,
});
const face = object(
  {
    siteId: str,
    faceId: str,
    siteName: str,
    faceLabel: str,
    longitude: num,
    latitude: num,
    selected: { type: 'boolean' },
    researchReference: { type: 'boolean' },
    commerciallyEligible: { type: 'boolean' },
    commercialReason: { type: 'string', nullable: true },
    flightCost: nullableNumber,
    currency: str,
    availability: { type: 'string', enum: ['available', 'unavailable', 'unknown'] },
    approach: { ...approach, nullable: true },
    profile: { type: 'object', nullable: true, additionalProperties: true },
    periods: list(period),
    illumination: object({
      type: { type: 'string', nullable: true },
      hours: { type: 'string', nullable: true },
    }),
    digital: object({
      spotLengthSeconds: nullableNumber,
      loopLengthSeconds: nullableNumber,
      capacitySpotsPerLoop: nullableNumber,
      advertiserSpotsPerLoop: nullableNumber,
    }),
  },
  [
    'siteId',
    'faceId',
    'siteName',
    'faceLabel',
    'longitude',
    'latitude',
    'selected',
    'researchReference',
    'commerciallyEligible',
    'commercialReason',
    'flightCost',
    'currency',
    'availability',
    'approach',
    'profile',
    'periods',
  ],
);
const audienceScenario = object({
  id: { type: 'string', enum: ['lower', 'base', 'higher'] },
  population: num,
  participatingPopulation: num,
  modeledOtsImpressions: num,
  reach1Plus: num,
  reachNPlus: num,
  reach1PlusPercent: nullableNumber,
  reachNPlusPercent: nullableNumber,
  averageOtsFrequency: nullableNumber,
  distribution: list(object({ opportunities: num, people: num })),
  assumptions,
});
export const planningStudyResultSchema: SchemaObject = object(
  {
    version: { type: 'string', enum: ['integrated-planning-v1'] },
    studyId: str,
    status: { type: 'string', enum: ['ready', 'partial', 'unavailable'] },
    generatedAt: { type: 'string', format: 'date-time' },
    inputSignature: str,
    countryCode: str,
    flight,
    timeZone: str,
    objective: { type: 'string', enum: ['reach', 'frequency'] },
    minimumOpportunities: num,
    target,
    planning: planningJourneySchema,
    targeting: object(
      {
        status: { type: 'string', enum: ['supported', 'unavailable'] },
        population: nullableNumber,
        sources: list(source),
        reasons: strings,
        limitations: strings,
        sec: object({
          status: { type: 'string', enum: ['modeled', 'unavailable'] },
          referenceVersion: str,
          method: str,
          geographicGrain: str,
          sources: list(source),
          classifiedShare: nullableNumber,
          unknownShare: nullableNumber,
          unknownPotentialShare: nullableNumber,
          publication: object({
            status: { type: 'string', enum: ['available', 'withheld'] },
            policyVersion: str,
            maximumOptimizerSpreadPp: num,
          }),
          identification: {
            ...object({
              optimizerMinPopulation: num,
              optimizerMaxPopulation: num,
              spreadPp: num,
              denominator: { type: 'string', enum: ['selected_adults'] },
            }),
            nullable: true,
          },
          range: object({ lower: nullableNumber, base: nullableNumber, higher: nullableNumber }),
          reasons: strings,
          limitations: strings,
        }),
        household: object(
          {
            referenceVersion: str,
            method: str,
            geographicGrain: { type: 'string', nullable: true },
            range: object({ lower: nullableNumber, base: nullableNumber, higher: nullableNumber }),
            schoolCoverage: object({
              mappedSchools: num,
              selectedMappedSchools: num,
              modeledDestinationCoverage: num,
            }),
          },
          ['referenceVersion', 'method', 'geographicGrain', 'range'],
        ),
        supportedAgeBands: strings,
        sexSupported: { type: 'boolean' },
        sourceResolutionMetres: num,
        calculationBasis: str,
      },
      ['status', 'population', 'sources', 'reasons'],
    ),
    population: object({
      residents: nullableNumber,
      coverage: nullableNumber,
      geographicBasis: str,
      modeledPeople: num,
      calibration: { type: 'string', enum: ['uncalibrated'] },
    }),
    sources: list(source),
    zones: list(
      object({
        id: num,
        residents: nullableNumber,
        populationCoverage: num,
        places: { type: 'object', additionalProperties: num },
        roadPoint: { ...point, nullable: true },
        insideStudyArea: { type: 'boolean' },
      }),
    ),
    sampling: object({
      mode: { type: 'string', enum: ['recommended', 'custom'] },
      usedDirectedPairs: num,
      referenceDirectedPairs: num,
      recommendedDirectedPairs: nullableNumber,
      generatedDirectedPairs: num,
      localDirectedPairs: num,
      throughDirectedPairs: num,
      maximumDifferencePp: nullableNumber,
      minimumPassingWeightCoverage: nullableNumber,
      stable: { type: 'boolean' },
      reason: str,
      checks: list(check),
      periods: list(
        object({
          daypartId: str,
          candidateRoutes: num,
          routedPairs: num,
          unresolvedDemandShare: num,
          selectedDemandShare: num,
        }),
      ),
    }),
    benchmarks: object({
      method: str,
      approaches: list(
        object({
          ...approach.properties!,
          id: str,
          direction: { type: 'string', enum: ['forward', 'reverse'] },
        }),
      ),
      periods: list(object({ daypartId: str, approachCount: num, matchedApproachCount: num })),
    }),
    faces: list(face),
    routes: list(
      object({
        id: str,
        pairId: str,
        daypartId: str,
        points: list(point),
        pairShare: num,
        demandWeight: num,
        faceIds: strings,
        durationSeconds: num,
        distanceMetres: num,
        durationEvidence: str,
      }),
    ),
    audience: object({
      status: { type: 'string', enum: ['ready', 'partial', 'unavailable'] },
      includedFacePeriods: list(
        object({ faceId: str, daypartId: str, assessmentCoverage: nullableNumber }),
      ),
      excludedFacePeriods: list(object({ faceId: str, daypartId: str, reasons: strings })),
      coverageBasis: str,
      basis: { type: 'string', enum: ['modeled_ots'] },
      minimumOpportunities: num,
      scenarios: list(audienceScenario),
      reasons: strings,
      assumptions: strings,
    }),
    composite: object({
      status: { type: 'string', enum: ['ready', 'partial', 'unavailable'] },
      objective: { type: 'string', enum: ['reach', 'frequency'] },
      selectedFaceIds: strings,
      totalCost: num,
      currency: str,
      remainingBudget: num,
      objectivePeople: num,
      rows: list(
        object({
          faceId: str,
          order: num,
          flightCost: num,
          incrementalPeople: num,
          totalObjectivePeople: num,
          reason: str,
        }),
      ),
      excluded: list(object({ faceId: str, reason: str })),
    }),
    issues: list(
      object({ code: str, message: str, action: str, faceId: str }, ['code', 'message', 'action']),
    ),
    warnings: strings,
  },
  [
    'version',
    'studyId',
    'status',
    'generatedAt',
    'inputSignature',
    'countryCode',
    'flight',
    'timeZone',
    'objective',
    'minimumOpportunities',
    'target',
    'targeting',
    'population',
    'sources',
    'zones',
    'sampling',
    'faces',
    'routes',
    'audience',
    'composite',
    'issues',
    'warnings',
  ],
);
const audienceProperties = planningStudyResultSchema.properties!.audience as SchemaObject;
audienceProperties.required = audienceProperties.required?.filter(
  (key) => !['includedFacePeriods', 'excludedFacePeriods', 'coverageBasis'].includes(key),
);
/** Same reviewed choices as evaluation; the comparison endpoint never saves them. */
export const planningStudyCompareSchema = planningStudyEvaluateSchema;
planningStudyResultSchema.properties!.secondary = object({
  target: planningTargetSchema,
  targeting: planningStudyResultSchema.properties!.targeting as SchemaObject,
  audience: planningStudyResultSchema.properties!.audience as SchemaObject,
});
export const planningStudyEvaluationSchema: SchemaObject = {
  ...planningStudyResultSchema,
  required: [
    ...planningStudyResultSchema.required!.filter((key) => key !== 'routes'),
    'routeFaceMatches',
  ],
  properties: {
    ...Object.fromEntries(
      Object.entries(planningStudyResultSchema.properties!).filter(([key]) => key !== 'routes'),
    ),
    routeFaceMatches: list(object({ id: str, faceIds: strings })),
  },
};
export const planningStudyJobSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'status', 'createdAt', 'updatedAt', 'progress', 'request', 'error', 'result'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['queued', 'running', 'ready', 'failed', 'cancelled'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    progress: {
      type: 'object',
      required: ['completed', 'total', 'stage'],
      properties: {
        completed: { type: 'integer' },
        total: { type: 'integer' },
        stage: { type: 'string' },
      },
    },
    request: planningStudyRequestSchema,
    error: {
      type: 'object',
      nullable: true,
      properties: {
        message: { type: 'string' },
        retryable: { type: 'boolean' },
        code: str,
        action: str,
      },
    },
    result: { ...planningStudyResultSchema, nullable: true },
  },
};

export const planningStudyPreflightRequestSchema: SchemaObject = {
  ...planningStudyRequestSchema,
  required: planningStudyRequestSchema.required!.filter(
    (key) => !['confirmPublicRoadTransfer', 'faces'].includes(key),
  ),
};
export const planningStudyReadinessSchema: SchemaObject = object(
  {
    status: { type: 'string', enum: ['ready', 'partial', 'unavailable'] },
    referenceVersion: str,
    footprint: object({ center: point, radiusKm: num, schoolBasis: str }),
    secondary: object({
      target: planningTargetSchema,
      targeting: planningStudyResultSchema.properties!.targeting as SchemaObject,
    }),
    targeting: planningStudyResultSchema.properties!.targeting as SchemaObject,
    population: object({ residents: nullableNumber, coverage: nullableNumber }),
    faces: object({
      total: num,
      withViewingProfile: num,
      missing: list(object({ faceId: str, issues: strings })),
    }),
    sources: list(source),
    issues: strings,
  },
  [
    'status',
    'referenceVersion',
    'footprint',
    'targeting',
    'population',
    'faces',
    'sources',
    'issues',
  ],
);

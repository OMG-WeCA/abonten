import { planningDays, straightLineDistanceKm, type PlanningWindow } from './planning-math';

/** Product-policy indices, not measured effectiveness or a measurement certification.
 * All coefficients are provisional, versioned and configurable for local calibration. */
export const BRIEF_FIT_VERSION = 'brief-fit-v1-provisional';
export type ScoringProvenance = 'verified' | 'owner_reported' | 'modeled' | 'unknown';
export interface ScoringEvidence<T> {
  value: T;
  provenance: ScoringProvenance;
  source: string;
}
export type BriefFitFactorKey = 'geography' | 'audience' | 'visibility' | 'contribution' | 'value';
export type PlanningApproachDirection = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';
export interface PlanningFitPreferences {
  targetAreas?: string[];
  targetCorridors?: string[];
  audienceTags?: string[];
  approachDirection?: PlanningApproachDirection;
  daypart?: 'any' | 'day' | 'night';
  goal?: 'balanced' | 'coverage' | 'precision' | 'value';
}
export interface PlanningScoringBrief {
  window: PlanningWindow;
  budget?: { amount: number; currency: string };
  targetCountry?: string;
  targetCity?: string;
  formats?: string[];
  fitPreferences?: PlanningFitPreferences;
  targetRadius?: { latitude: number; longitude: number; radiusKm: number };
  maxFaces?: number;
  lockedFaceIds?: string[];
}
export interface PlanningScoringCandidate {
  siteId: string;
  faceId: string;
  format: string;
  physicalEligible: boolean;
  availability: 'available' | 'unavailable' | 'unknown';
  coordinateStatus: ScoringProvenance;
  coordinates?: { latitude: number; longitude: number };
  geography?: {
    country?: ScoringEvidence<string>;
    city?: ScoringEvidence<string>;
    areas?: ScoringEvidence<string[]>;
    corridor?: ScoringEvidence<string>;
  };
  cost?: {
    amount: number;
    currency: string;
    window: PlanningWindow;
    basis: 'flight' | 'research_month';
    provenance: ScoringProvenance;
    source: string;
  };
  /** Source-backed target-group share in [0,1]. Traffic/residents are not segments. */
  audience?: ScoringEvidence<Record<string, number>>;
  traffic?: ScoringEvidence<unknown>;
  geometry?: {
    /** Outward face normal: south-facing (180deg) can meet northbound (0deg) travel. */
    faceBearingDeg?: ScoringEvidence<number>;
    approachHeadingDeg?: ScoringEvidence<number>;
    viewingDistanceM?: ScoringEvidence<number>;
    legibilityDistanceM?: ScoringEvidence<number>;
    unobstructedFraction?: ScoringEvidence<number>;
    dwellSeconds?: ScoringEvidence<number>;
    speedKph?: ScoringEvidence<number>;
    viewablePathM?: ScoringEvidence<number>;
    nightLighting?: ScoringEvidence<boolean>;
    daypartCoverage?: ScoringEvidence<{ day: number; night: number }>;
  };
  digital?: {
    spotLengthSeconds?: ScoringEvidence<number>;
    loopLengthSeconds?: ScoringEvidence<number>;
    /** Advertiser-owned creative runs per loop, not the total rotating slots. */
    advertiserSpotsPerLoop?: ScoringEvidence<number>;
    scheduleDaypartCoverage?: ScoringEvidence<{ day: number; night: number }>;
    /** Purchased schedule coverage must explicitly cover this campaign flight. */
    scheduleWindow?: PlanningWindow;
  };
}
export interface BriefFitConfig {
  version: string;
  provisional: true;
  weights: Record<BriefFitFactorKey, number>;
  provenanceConfidence: Record<ScoringProvenance, number>;
  visibilityWeights: { geometry: number; obstruction: number; dwell: number; lighting: number };
  usefulDwellSeconds: number;
  redundantContributionFraction: number;
  searchPoolLimit: number;
  beamWidth: number;
  maxFaces: number;
  oneFacePerSite: boolean;
}
export const DEFAULT_BRIEF_FIT_CONFIG: BriefFitConfig = {
  version: BRIEF_FIT_VERSION,
  provisional: true,
  weights: { geography: 30, audience: 20, visibility: 30, contribution: 10, value: 10 },
  provenanceConfidence: { verified: 1, owner_reported: 0.55, modeled: 0.35, unknown: 0 },
  visibilityWeights: { geometry: 40, obstruction: 20, dwell: 20, lighting: 20 },
  usefulDwellSeconds: 10,
  redundantContributionFraction: 0.2,
  searchPoolLimit: 36,
  beamWidth: 128,
  maxFaces: 12,
  oneFacePerSite: true,
};
export interface PlanningFitFactor {
  key: BriefFitFactorKey;
  weight: number;
  /** Known supported contribution on the factor scale; null when entirely unknown. */
  score: number | null;
  range: { lower: number; upper: number };
  coverage: number;
  confidence: number;
  provenance: ScoringProvenance[];
  sources: string[];
  reasons: string[];
  unknowns: string[];
}
export interface PlanningFaceAssessment {
  version: string;
  siteId: string;
  faceId: string;
  score: number | null;
  range: { lower: number; upper: number };
  evidenceCoverage: number;
  evidenceConfidence: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  eligible: boolean;
  provisional: boolean;
  exclusions: string[];
  factors: PlanningFitFactor[];
  reasons: string[];
  unknowns: string[];
  weights: Record<BriefFitFactorKey, number>;
}
export interface PlanningPortfolioAssessment {
  version: string;
  status: 'ready' | 'infeasible' | 'insufficient_evidence';
  assessments: PlanningFaceAssessment[];
  selectedAssessments: PlanningFaceAssessment[];
  selectedFaceIds: string[];
  selectedSiteIds: string[];
  cost: {
    amount: number;
    currency: string;
    basis: 'flight' | 'research_month';
    window: PlanningWindow;
  } | null;
  budgetRemaining: number | null;
  confirmedBudgetFit: false;
  provisional: true;
  objective: number;
  algorithm: 'bounded_beam_search';
  candidateCount: number;
  searchPoolCount: number;
  truncated: boolean;
  diagnostics: string[];
  assumptions: string[];
}

const FACTOR_KEYS: BriefFitFactorKey[] = [
  'geography',
  'audience',
  'visibility',
  'contribution',
  'value',
];
const DIRECTION_DEGREES: Record<PlanningApproachDirection, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SW: 225,
  W: 270,
  NW: 315,
};
const round = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const normalized = (value: string) =>
  value
    .replace(/’/g, "'")
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
function countryKey(value: string): string {
  const key = normalized(value);
  return (
    (
      { ng: 'nigeria', gh: 'ghana', cm: 'cameroon', bj: 'benin', ci: "cote d'ivoire" } as Record<
        string,
        string
      >
    )[key] ?? key
  );
}
function known<T>(evidence: ScoringEvidence<T> | undefined): evidence is ScoringEvidence<T> {
  return (
    evidence !== undefined &&
    evidence.value !== null &&
    evidence.value !== undefined &&
    ['verified', 'owner_reported', 'modeled'].includes(evidence.provenance) &&
    typeof evidence.source === 'string' &&
    evidence.source.trim().length > 0
  );
}
function numeric(
  evidence: ScoringEvidence<number> | undefined,
  min = 0,
  max = Infinity,
): evidence is ScoringEvidence<number> {
  return (
    known(evidence) &&
    Number.isFinite(evidence.value) &&
    evidence.value >= min &&
    evidence.value <= max
  );
}
function validateConfig(config: BriefFitConfig): void {
  if (
    !config.version ||
    config.provisional !== true ||
    FACTOR_KEYS.some((key) => !Number.isFinite(config.weights[key]) || config.weights[key] < 0) ||
    Math.abs(FACTOR_KEYS.reduce((sum, key) => sum + config.weights[key], 0) - 100) > 0.001 ||
    Object.values(config.provenanceConfidence).some(
      (value) => !Number.isFinite(value) || value < 0 || value > 1,
    ) ||
    Object.values(config.visibilityWeights).some((value) => !Number.isFinite(value) || value < 0) ||
    Object.values(config.visibilityWeights).reduce((sum, value) => sum + value, 0) <= 0 ||
    !Number.isFinite(config.usefulDwellSeconds) ||
    config.usefulDwellSeconds <= 0 ||
    !Number.isFinite(config.redundantContributionFraction) ||
    config.redundantContributionFraction < 0 ||
    config.redundantContributionFraction > 1 ||
    !Number.isInteger(config.searchPoolLimit) ||
    config.searchPoolLimit < 1 ||
    config.searchPoolLimit > 100 ||
    !Number.isInteger(config.beamWidth) ||
    config.beamWidth < 1 ||
    config.beamWidth > 1024 ||
    !Number.isInteger(config.maxFaces) ||
    config.maxFaces < 1 ||
    config.maxFaces > 100
  ) {
    throw new Error('Invalid provisional brief-fit policy configuration.');
  }
}
function policy(config: BriefFitConfig, brief: PlanningScoringBrief): BriefFitConfig {
  validateConfig(config);
  // Default product presets are versioned variants, not empirical coefficients.
  if (config !== DEFAULT_BRIEF_FIT_CONFIG) return config;
  const goal = brief.fitPreferences?.goal ?? 'balanced';
  const presets: Record<string, Record<BriefFitFactorKey, number>> = {
    balanced: config.weights,
    coverage: { geography: 40, audience: 15, visibility: 25, contribution: 15, value: 5 },
    precision: { geography: 25, audience: 20, visibility: 40, contribution: 10, value: 5 },
    value: { geography: 25, audience: 15, visibility: 25, contribution: 10, value: 25 },
  };
  return {
    ...config,
    version: `${config.version}:${goal}`,
    weights: presets[goal] ?? config.weights,
  };
}
export function effectiveBriefFitConfig(
  brief: PlanningScoringBrief,
  config: BriefFitConfig = DEFAULT_BRIEF_FIT_CONFIG,
): BriefFitConfig {
  return policy(config, brief);
}
interface Signal {
  weight: number;
  value: number | null;
  evidence: ScoringEvidence<unknown>[];
  reason?: string;
  unknown?: string;
}
function factor(
  key: BriefFitFactorKey,
  signals: Signal[],
  config: BriefFitConfig,
): PlanningFitFactor {
  const total = signals.reduce((sum, signal) => sum + signal.weight, 0) || 1;
  let lower = 0;
  let unknown = 0;
  let coverage = 0;
  let confidence = 0;
  const evidences: ScoringEvidence<unknown>[] = [];
  for (const signal of signals) {
    const weight = signal.weight / total;
    if (signal.value === null) {
      unknown += weight;
      continue;
    }
    lower += weight * clamp(signal.value);
    coverage += weight;
    const quality = signal.evidence.length
      ? Math.min(...signal.evidence.map((item) => config.provenanceConfidence[item.provenance]))
      : 0;
    confidence += weight * quality;
    evidences.push(...signal.evidence);
  }
  return {
    key,
    weight: config.weights[key],
    score: coverage > 0 ? round(lower * 100) : null,
    range: { lower: round(lower * 100), upper: round((lower + unknown) * 100) },
    coverage: round(coverage * 100),
    confidence: round(confidence * 100),
    provenance: [...new Set(evidences.map((item) => item.provenance))],
    sources: [...new Set(evidences.map((item) => item.source))].sort(),
    reasons: [
      ...new Set(
        signals.filter((item) => item.value !== null && item.reason).map((item) => item.reason!),
      ),
    ],
    unknowns: [
      ...new Set(
        signals.filter((item) => item.value === null && item.unknown).map((item) => item.unknown!),
      ),
    ],
  };
}
const signal = (
  value: number | null,
  evidence: ScoringEvidence<unknown>[],
  reason: string,
  unknown: string,
  weight = 1,
): Signal => ({
  value,
  evidence,
  reason:
    value === 0
      ? ((
          {
            country_match: 'country_mismatch',
            city_match: 'city_mismatch',
            target_area_match: 'target_area_mismatch',
            target_corridor_match: 'target_corridor_mismatch',
            verified_radius_match: 'radius_mismatch',
            audience_segment_fit: 'audience_segment_mismatch',
            verified_directional_geometry: 'directional_approach_mismatch',
            unobstructed_sightline: 'obstructed_sightline',
            daypart_lighting_policy: 'daypart_unserved',
          } as Record<string, string>
        )[reason] ?? reason)
      : reason,
  unknown,
  weight,
});
function verifiedPoint(candidate: PlanningScoringCandidate): boolean {
  return (
    candidate.coordinateStatus === 'verified' &&
    candidate.coordinates !== undefined &&
    straightLineDistanceKm(candidate.coordinates, candidate.coordinates) !== null
  );
}
function geographySignals(
  candidate: PlanningScoringCandidate,
  brief: PlanningScoringBrief,
): Signal[] {
  const result: Signal[] = [];
  const geo = candidate.geography;
  if (brief.targetCountry)
    result.push(
      signal(
        known(geo?.country)
          ? Number(countryKey(geo.country.value) === countryKey(brief.targetCountry))
          : null,
        known(geo?.country) ? [geo.country] : [],
        'country_match',
        'country_unknown',
      ),
    );
  if (brief.targetCity)
    result.push(
      signal(
        known(geo?.city)
          ? Number(normalized(geo.city.value) === normalized(brief.targetCity))
          : null,
        known(geo?.city) ? [geo.city] : [],
        'city_match',
        'city_unknown',
      ),
    );
  const areas = brief.fitPreferences?.targetAreas ?? [];
  if (areas.length) {
    // A city mismatch cannot establish absence from an undocumented subarea.
    const cityMatches =
      known(geo?.city) && areas.some((area) => normalized(area) === normalized(geo.city!.value));
    const possible: (ScoringEvidence<string | string[]> | undefined)[] = [
      geo?.areas,
      cityMatches ? geo?.city : undefined,
    ];
    const evidence = possible.filter((item): item is ScoringEvidence<string | string[]> =>
      known(item),
    );
    const values = evidence
      .flatMap((item) => (Array.isArray(item.value) ? item.value : [item.value]))
      .map(normalized);
    result.push(
      signal(
        evidence.length ? Number(areas.some((area) => values.includes(normalized(area)))) : null,
        evidence,
        'target_area_match',
        'target_area_unknown',
      ),
    );
  }
  const corridors = brief.fitPreferences?.targetCorridors ?? [];
  if (corridors.length)
    result.push(
      signal(
        known(geo?.corridor)
          ? Number(corridors.some((value) => normalized(value) === normalized(geo.corridor!.value)))
          : null,
        known(geo?.corridor) ? [geo.corridor] : [],
        'target_corridor_match',
        'target_corridor_unknown',
      ),
    );
  if (brief.targetRadius) {
    const radius = brief.targetRadius;
    const distance =
      verifiedPoint(candidate) && Number.isFinite(radius.radiusKm) && radius.radiusKm > 0
        ? straightLineDistanceKm(candidate.coordinates!, radius)
        : null;
    result.push(
      signal(
        distance === null ? null : Number(distance <= radius.radiusKm),
        [],
        'verified_radius_match',
        'radius_geometry_unverified',
      ),
    );
  }
  return result.length
    ? result
    : [signal(null, [], 'geographic_fit', 'geographic_target_unspecified')];
}
function audienceSignals(
  candidate: PlanningScoringCandidate,
  brief: PlanningScoringBrief,
): Signal[] {
  const tags = brief.fitPreferences?.audienceTags ?? [];
  if (!tags.length)
    return [signal(null, [], 'audience_segment_fit', 'audience_target_unspecified')];
  return tags.map((tag) => {
    const entry = known(candidate.audience)
      ? Object.entries(candidate.audience.value).find(
          ([key]) => normalized(key) === normalized(tag),
        )
      : undefined;
    const valid = entry && Number.isFinite(entry[1]) && entry[1] >= 0 && entry[1] <= 1;
    return signal(
      valid ? entry[1] : null,
      valid ? [candidate.audience!] : [],
      'audience_segment_fit',
      'audience_segment_unknown',
    );
  });
}
function angularDifference(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}
function dwellEvidence(candidate: PlanningScoringCandidate): ScoringEvidence<number> | undefined {
  const geo = candidate.geometry;
  if (numeric(geo?.dwellSeconds, 0.001)) return geo.dwellSeconds;
  if (
    verifiedPoint(candidate) &&
    numeric(geo?.speedKph, 0.001) &&
    numeric(geo?.viewablePathM, 0.001) &&
    geo.speedKph.provenance === 'verified' &&
    geo.viewablePathM.provenance === 'verified'
  ) {
    return {
      value: geo.viewablePathM.value / (geo.speedKph.value / 3.6),
      provenance: 'modeled',
      source: `Modeled dwell = verified viewable path / verified speed; ${geo.viewablePathM.source}; ${geo.speedKph.source}`,
    };
  }
  return undefined;
}
function daypartValue(
  value: { day: number; night: number },
  daypart: 'any' | 'day' | 'night',
): number | null {
  const values = daypart === 'any' ? [value.day, value.night] : [value[daypart]];
  return values.every((item) => Number.isFinite(item) && item >= 0 && item <= 1)
    ? values.reduce((sum, item) => sum + item, 0) / values.length
    : null;
}
function visibilitySignals(
  candidate: PlanningScoringCandidate,
  brief: PlanningScoringBrief,
  config: BriefFitConfig,
): Signal[] {
  const geo = candidate.geometry;
  const daypart = brief.fitPreferences?.daypart ?? 'any';
  if (candidate.format === 'digital_led') {
    const digital = candidate.digital;
    const schedule = digital?.scheduleDaypartCoverage;
    const matchingWindow =
      digital?.scheduleWindow?.startDate === brief.window.startDate &&
      digital.scheduleWindow.endDate === brief.window.endDate;
    const coverage =
      matchingWindow && known(schedule) ? daypartValue(schedule.value, daypart) : null;
    if (coverage === 0)
      return [signal(0, [schedule!], 'daypart_unserved', 'exposure_context_unknown')];
    const spot = digital?.spotLengthSeconds;
    const loop = digital?.loopLengthSeconds;
    const spots = digital?.advertiserSpotsPerLoop;
    if (
      !numeric(spot, 0.001) ||
      !numeric(loop, 0.001) ||
      !numeric(spots, 1) ||
      !Number.isInteger(spots.value) ||
      spot.value * spots.value > loop.value ||
      coverage === null ||
      !dwellEvidence(candidate)
    )
      return [signal(null, [], 'digital_rotation_dwell_policy', 'exposure_context_unknown')];
  }
  if (
    candidate.format !== 'digital_led' &&
    daypart === 'night' &&
    known(geo?.nightLighting) &&
    geo.nightLighting.value === false
  )
    return [signal(0, [geo.nightLighting], 'daypart_unserved', 'lighting_schedule_unknown')];
  const bearing = geo?.faceBearingDeg;
  const approach = geo?.approachHeadingDeg;
  const distance = geo?.viewingDistanceM;
  const limit = geo?.legibilityDistanceM;
  const precise =
    verifiedPoint(candidate) &&
    numeric(bearing, 0, 359.999) &&
    numeric(approach, 0, 359.999) &&
    numeric(distance, 0.001) &&
    numeric(limit, 0.001) &&
    [bearing, approach, distance, limit].every((item) => item!.provenance === 'verified');
  let geometry: number | null = null;
  if (precise) {
    const angleFit = Math.max(
      0,
      Math.cos((angularDifference(bearing!.value, (approach!.value + 180) % 360) * Math.PI) / 180),
    );
    const requested = brief.fitPreferences?.approachDirection;
    const approachFit = requested
      ? Math.max(
          0,
          Math.cos(
            (angularDifference(approach!.value, DIRECTION_DEGREES[requested]) * Math.PI) / 180,
          ),
        )
      : 1;
    geometry = angleFit * approachFit * clamp(limit!.value / distance!.value);
  }
  const result = [
    signal(
      geometry,
      precise ? [bearing!, approach!, distance!, limit!] : [],
      'verified_directional_geometry',
      'directional_geometry_unverified',
      config.visibilityWeights.geometry,
    ),
  ];
  result.push(
    signal(
      numeric(geo?.unobstructedFraction, 0, 1) ? geo.unobstructedFraction.value : null,
      numeric(geo?.unobstructedFraction, 0, 1) ? [geo.unobstructedFraction] : [],
      'unobstructed_sightline',
      'obstruction_unknown',
      config.visibilityWeights.obstruction,
    ),
  );
  const dwell = dwellEvidence(candidate);
  let dwellUtility: number | null = dwell ? clamp(dwell.value / config.usefulDwellSeconds) : null;
  const dwellSources: ScoringEvidence<unknown>[] = dwell ? [dwell] : [];
  if (candidate.format === 'digital_led') {
    const digital = candidate.digital;
    const schedule = digital?.scheduleDaypartCoverage;
    const spot = digital?.spotLengthSeconds;
    const loop = digital?.loopLengthSeconds;
    const spots = digital?.advertiserSpotsPerLoop;
    const coverage = known(schedule) ? daypartValue(schedule.value, daypart) : null;
    const usable =
      numeric(spot, 0.001) &&
      numeric(loop, 0.001) &&
      numeric(spots, 1) &&
      Number.isInteger(spots.value) &&
      spot.value * spots.value <= loop.value &&
      coverage !== null &&
      dwell !== undefined;
    // A rotation/dwell planning index only: neither exposure probability nor audience.
    dwellUtility = usable
      ? coverage! *
        clamp(dwell!.value / spot!.value) *
        clamp((dwell!.value * spots!.value) / loop!.value)
      : null;
    if (usable) dwellSources.push(spot!, loop!, spots!, schedule!);
  }
  result.push(
    signal(
      dwellUtility,
      dwellSources,
      candidate.format === 'digital_led' ? 'digital_rotation_dwell_policy' : 'dwell_policy',
      'exposure_context_unknown',
      config.visibilityWeights.dwell,
    ),
  );
  if (daypart !== 'day') {
    let lighting: number | null = null;
    const lightingSources: ScoringEvidence<unknown>[] = [];
    if (candidate.format === 'digital_led') {
      const schedule = candidate.digital?.scheduleDaypartCoverage;
      if (known(schedule)) {
        lighting = daypartValue(schedule.value, daypart);
        lightingSources.push(schedule);
      }
    } else if (known(geo?.nightLighting) && typeof geo.nightLighting.value === 'boolean') {
      lightingSources.push(geo.nightLighting);
      if (!geo.nightLighting.value && daypart === 'night') lighting = 0;
      else if (known(geo.daypartCoverage)) {
        lighting = daypartValue(
          {
            ...geo.daypartCoverage.value,
            night: geo.nightLighting.value ? geo.daypartCoverage.value.night : 0,
          },
          daypart,
        );
        lightingSources.push(geo.daypartCoverage);
      }
    }
    result.push(
      signal(
        lighting,
        lightingSources,
        'daypart_lighting_policy',
        'lighting_schedule_unknown',
        config.visibilityWeights.lighting,
      ),
    );
  }
  return result;
}
function geographicProxy(
  candidate: PlanningScoringCandidate,
  cityOnly = false,
): {
  keys: string[];
  evidence: ScoringEvidence<unknown>[];
  level: 'corridor' | 'area' | 'city';
} | null {
  const geo = candidate.geography;
  // Short road/area names are not globally unique. Scope proxies by sourced city/country.
  if (!known(geo?.country) || !known(geo?.city) || !geo.city.value.trim()) return null;
  const scope = `${countryKey(geo.country.value)}:${normalized(geo.city.value)}`;
  if (!cityOnly && known(geo?.corridor) && geo.corridor.value.trim())
    return {
      keys: [`corridor:${scope}:${normalized(geo.corridor.value)}`],
      evidence: [geo.corridor, geo.country, geo.city],
      level: 'corridor',
    };
  if (!cityOnly && known(geo?.areas) && geo.areas.value.length)
    return {
      keys: geo.areas.value
        .filter((area) => area.trim())
        .map((area) => `area:${scope}:${normalized(area)}`)
        .sort(),
      evidence: [geo.areas, geo.country, geo.city],
      level: 'area',
    };
  if (known(geo?.city) && geo.city.value.trim() && known(geo.country))
    return {
      keys: [`city:${countryKey(geo.country.value)}:${normalized(geo.city.value)}`],
      evidence: [geo.city, geo.country],
      level: 'city',
    };
  return null;
}
function contributionSignals(
  candidate: PlanningScoringCandidate,
  selected: readonly PlanningScoringCandidate[],
  config: BriefFitConfig,
): Signal[] {
  let proxy = geographicProxy(candidate);
  if (!proxy || !proxy.keys.length)
    return [signal(null, [], 'geographic_redundancy_proxy', 'geographic_proxy_unknown')];
  const selectedOthers = selected.filter((other) => other.faceId !== candidate.faceId);
  let others = selectedOthers.map((other) => geographicProxy(other));
  // Unknown neighboring geography cannot prove novelty or absence of overlap.
  if (others.some((other) => other === null))
    return [signal(null, [], 'geographic_redundancy_proxy', 'portfolio_overlap_unknown')];
  // Different evidence granularities do not establish disjoint geography.
  if (others.some((other) => other!.level !== proxy!.level)) {
    proxy = geographicProxy(candidate, true);
    others = selectedOthers.map((other) => geographicProxy(other, true));
    if (!proxy || others.some((other) => other === null))
      return [signal(null, [], 'geographic_redundancy_proxy', 'portfolio_overlap_unknown')];
  }
  const covered = new Set(others.flatMap((other) => other!.keys));
  const novel = proxy.keys.filter((key) => !covered.has(key)).length / proxy.keys.length;
  const sameSite = selected.some(
    (other) => other.siteId === candidate.siteId && other.faceId !== candidate.faceId,
  );
  const value = sameSite
    ? config.redundantContributionFraction
    : config.redundantContributionFraction + (1 - config.redundantContributionFraction) * novel;
  return [
    signal(
      value,
      [...proxy.evidence, ...others.flatMap((other) => other!.evidence)],
      novel === 1 && !sameSite ? 'new_geographic_proxy' : 'overlapping_geographic_proxy',
      'geographic_proxy_unknown',
    ),
  ];
}
function calendarMonth(window: PlanningWindow): boolean {
  if (planningDays(window) === null || !/^\d{4}-\d{2}-01$/.test(window.startDate)) return false;
  const start = new Date(`${window.startDate}T00:00:00Z`);
  start.setUTCMonth(start.getUTCMonth() + 1);
  return start.toISOString().slice(0, 10) === window.endDate;
}
function costProblem(
  candidate: PlanningScoringCandidate,
  brief: PlanningScoringBrief,
): string | null {
  const cost = candidate.cost;
  if (
    !cost ||
    !Number.isFinite(cost.amount) ||
    cost.amount <= 0 ||
    !known({ value: cost.amount, provenance: cost.provenance, source: cost.source })
  )
    return 'price_unknown';
  if (brief.budget && cost.currency !== brief.budget.currency) return 'price_currency_mismatch';
  if (
    cost.window.startDate !== brief.window.startDate ||
    cost.window.endDate !== brief.window.endDate
  )
    return 'price_window_mismatch';
  if (cost.basis === 'research_month' && !calendarMonth(brief.window))
    return 'research_window_incomparable';
  return null;
}
function exclusions(candidate: PlanningScoringCandidate, brief: PlanningScoringBrief): string[] {
  const result: string[] = [];
  if (!candidate.physicalEligible) result.push('physical_ineligible');
  if (candidate.availability === 'unavailable') result.push('availability_unavailable');
  if (planningDays(brief.window) === null) result.push('invalid_flight');
  if (brief.formats?.length && !brief.formats.includes(candidate.format))
    result.push('format_mismatch');
  if (candidate.format === 'digital_led') {
    const digital = candidate.digital;
    if (
      digital?.scheduleWindow?.startDate === brief.window.startDate &&
      digital.scheduleWindow.endDate === brief.window.endDate &&
      known(digital.scheduleDaypartCoverage) &&
      daypartValue(
        digital.scheduleDaypartCoverage.value,
        brief.fitPreferences?.daypart ?? 'any',
      ) === 0
    )
      result.push('daypart_unserved');
  }
  if (
    candidate.format !== 'digital_led' &&
    brief.fitPreferences?.daypart === 'night' &&
    known(candidate.geometry?.nightLighting) &&
    candidate.geometry.nightLighting.value === false
  )
    result.push('daypart_unserved');
  if (
    brief.targetCountry &&
    known(candidate.geography?.country) &&
    countryKey(candidate.geography.country.value) !== countryKey(brief.targetCountry)
  )
    result.push('country_mismatch');
  if (
    brief.targetCity &&
    known(candidate.geography?.city) &&
    normalized(candidate.geography.city.value) !== normalized(brief.targetCity)
  )
    result.push('city_mismatch');
  if (brief.targetRadius && verifiedPoint(candidate)) {
    const distance = straightLineDistanceKm(candidate.coordinates!, brief.targetRadius);
    if (
      Number.isFinite(brief.targetRadius.radiusKm) &&
      brief.targetRadius.radiusKm > 0 &&
      distance !== null &&
      distance > brief.targetRadius.radiusKm
    )
      result.push('radius_mismatch');
  }
  return result;
}
export function scorePlanningFace(
  candidate: PlanningScoringCandidate,
  brief: PlanningScoringBrief,
  config: BriefFitConfig = DEFAULT_BRIEF_FIT_CONFIG,
  selected: readonly PlanningScoringCandidate[] = [],
): PlanningFaceAssessment {
  const effective = policy(config, brief);
  const factors = [
    factor('geography', geographySignals(candidate, brief), effective),
    factor('audience', audienceSignals(candidate, brief), effective),
    factor('visibility', visibilitySignals(candidate, brief, effective), effective),
    factor('contribution', contributionSignals(candidate, selected, effective), effective),
  ];
  const comparable = costProblem(candidate, brief) === null;
  const budget = brief.budget;
  const supported = factors
    .filter((item) => item.key !== 'contribution')
    .reduce((sum, item) => sum + (item.range.lower * item.weight) / 100, 0);
  const coreWeight =
    effective.weights.geography + effective.weights.audience + effective.weights.visibility;
  const coreCovered = factors
    .filter((item) => item.key !== 'contribution')
    .some((item) => item.coverage > 0 && item.weight > 0);
  const value =
    comparable &&
    coreWeight > 0 &&
    coreCovered &&
    budget &&
    Number.isFinite(budget.amount) &&
    budget.amount > 0
      ? clamp(supported / coreWeight / (candidate.cost!.amount / budget.amount))
      : null;
  factors.push(
    factor(
      'value',
      [
        signal(
          value,
          value !== null
            ? [
                ...factors
                  .filter((item) => item.key !== 'contribution' && item.coverage > 0)
                  .map((item) => ({
                    value: item.score,
                    provenance:
                      item.provenance
                        .slice()
                        .sort(
                          (a, b) =>
                            effective.provenanceConfidence[a] - effective.provenanceConfidence[b],
                        )[0] ?? ('unknown' as ScoringProvenance),
                    source: item.sources.join('; '),
                  })),
                {
                  value: candidate.cost!.amount,
                  provenance: candidate.cost!.provenance,
                  source: candidate.cost!.source,
                },
              ]
            : [],
          'supported_fit_per_budget_share',
          'value_evidence_unknown',
        ),
      ],
      effective,
    ),
  );
  const lower = factors.reduce((sum, item) => sum + (item.range.lower * item.weight) / 100, 0);
  const upper = factors.reduce((sum, item) => sum + (item.range.upper * item.weight) / 100, 0);
  const coverage = factors.reduce((sum, item) => sum + (item.coverage * item.weight) / 100, 0);
  const confidence = factors.reduce((sum, item) => sum + (item.confidence * item.weight) / 100, 0);
  const excluded = exclusions(candidate, brief);
  const unknowns = [
    ...new Set([
      ...factors.flatMap((item) => item.unknowns),
      ...(!known(candidate.traffic) ? ['traffic_unavailable'] : []),
      ...(candidate.availability === 'unknown' ? ['availability_unknown'] : []),
      ...(costProblem(candidate, brief) ? [costProblem(candidate, brief)!] : []),
    ]),
  ];
  return {
    version: effective.version,
    siteId: candidate.siteId,
    faceId: candidate.faceId,
    score: coverage > 0 ? round(lower) : null,
    range: { lower: round(lower), upper: round(upper) },
    evidenceCoverage: round(coverage),
    evidenceConfidence: round(confidence),
    confidenceLabel: confidence >= 75 ? 'high' : confidence >= 40 ? 'medium' : 'low',
    eligible: excluded.length === 0,
    provisional: true,
    exclusions: excluded,
    factors,
    reasons: [...new Set(factors.flatMap((item) => item.reasons))],
    unknowns,
    weights: { ...effective.weights },
  };
}

interface SearchState {
  candidates: PlanningScoringCandidate[];
  amount: number;
  objective: number;
}
function stateOrder(a: SearchState, b: SearchState): number {
  return (
    b.objective - a.objective ||
    a.amount - b.amount ||
    a.candidates
      .map((item) => item.faceId)
      .sort()
      .join('|')
      .localeCompare(
        b.candidates
          .map((item) => item.faceId)
          .sort()
          .join('|'),
      )
  );
}
function incrementalUtility(assessment: PlanningFaceAssessment): number {
  const contribution = assessment.factors.find((item) => item.key === 'contribution')!;
  // Deliberate provisional diminishing-utility policy for sourced spatial overlap.
  // It is not a proportion of deduplicated people, exposure or reach.
  return (
    assessment.range.lower * (contribution.score === null ? 1 : contribution.range.lower / 100)
  );
}
/** Stable bounded heuristic, not a global optimizer or an audience/reach model.
 * Unknown prices/FX/partial research months never enter the priced selection. */
export function selectPlanningPortfolio(
  candidates: readonly PlanningScoringCandidate[],
  brief: PlanningScoringBrief,
  config: BriefFitConfig = DEFAULT_BRIEF_FIT_CONFIG,
): PlanningPortfolioAssessment {
  const effective = policy(config, brief);
  const unique = [
    ...new Map(
      [...candidates]
        .sort((a, b) => a.faceId.localeCompare(b.faceId))
        .map((item) => [item.faceId, item]),
    ).values(),
  ];
  const assessments = unique.map((item) => scorePlanningFace(item, brief, config));
  const scores = new Map(assessments.map((item) => [item.faceId, item]));
  const result: PlanningPortfolioAssessment = {
    version: effective.version,
    status: 'insufficient_evidence',
    assessments,
    selectedAssessments: [],
    selectedFaceIds: [],
    selectedSiteIds: [],
    cost: null,
    budgetRemaining: null,
    confirmedBudgetFit: false,
    provisional: true,
    objective: 0,
    algorithm: 'bounded_beam_search',
    candidateCount: unique.length,
    searchPoolCount: 0,
    truncated: false,
    diagnostics: [],
    assumptions: [
      'Provisional product-policy weights; no certification, locally calibrated effectiveness or global optimum is claimed.',
      'Supported fit is a lower-bound policy contribution. Missing factors remain null with uncertainty ranges, not average or zero-valued observations.',
      'Geographic/corridor redundancy is a sourced spatial planning proxy, not deduplicated reach or audience overlap.',
      `Supported portfolio utility is discounted for sourced geographic overlap (repeat fraction ${effective.redundantContributionFraction}); this provisional policy is not a reach multiplier.`,
      'Unknown availability requires verification; all prices remain indicative and do not include unquoted charges.',
      `Bounded beam search: at most ${effective.searchPoolLimit} faces, ${effective.beamWidth} retained states; ${effective.oneFacePerSite ? 'at most one face per structure' : 'multiple faces per structure permitted'}.`,
    ],
  };
  const budget = brief.budget;
  if (
    !budget ||
    !Number.isFinite(budget.amount) ||
    budget.amount <= 0 ||
    !['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'].includes(budget.currency) ||
    planningDays(brief.window) === null
  ) {
    result.diagnostics.push('valid_budget_and_flight_required');
    return result;
  }
  const maxFaces = Math.min(
    effective.maxFaces,
    Number.isInteger(brief.maxFaces) && brief.maxFaces! > 0 ? brief.maxFaces! : effective.maxFaces,
  );
  const lockedIds = [...new Set(brief.lockedFaceIds ?? [])].sort();
  const locked = lockedIds.map((id) => unique.find((item) => item.faceId === id));
  if (
    locked.some((item) => !item) ||
    locked.length > maxFaces ||
    locked.some((item) => item && !scores.get(item.faceId)!.eligible)
  ) {
    result.status = 'infeasible';
    result.diagnostics.push('locked_constraints_infeasible');
    return result;
  }
  const lockedCandidates = locked as PlanningScoringCandidate[];
  if (lockedCandidates.some((item) => costProblem(item, brief))) {
    result.diagnostics.push('locked_price_unresolved');
    return result;
  }
  const lockedAmount = round(lockedCandidates.reduce((sum, item) => sum + item.cost!.amount, 0));
  if (
    lockedAmount > budget.amount ||
    (effective.oneFacePerSite &&
      new Set(lockedCandidates.map((item) => item.siteId)).size !== lockedCandidates.length)
  ) {
    result.status = 'infeasible';
    result.diagnostics.push('locked_budget_or_structure_infeasible');
    return result;
  }
  const bases = new Set(lockedCandidates.map((item) => item.cost!.basis));
  if (bases.size > 1) {
    result.diagnostics.push('mixed_price_bases_unresolved');
    return result;
  }
  const eligible = unique.filter(
    (item) =>
      scores.get(item.faceId)!.eligible &&
      !costProblem(item, brief) &&
      item.cost!.amount <= budget.amount,
  );
  eligible.sort(
    (a, b) =>
      scores.get(b.faceId)!.range.lower - scores.get(a.faceId)!.range.lower ||
      scores.get(b.faceId)!.evidenceConfidence - scores.get(a.faceId)!.evidenceConfidence ||
      a.faceId.localeCompare(b.faceId),
  );
  const pool = [
    ...lockedCandidates,
    ...eligible.filter((item) => !lockedIds.includes(item.faceId)),
  ].slice(0, effective.searchPoolLimit);
  result.searchPoolCount = pool.length;
  result.truncated = pool.length < eligible.length;
  if (!pool.length) {
    result.status = unique.some(
      (item) => scores.get(item.faceId)!.eligible && costProblem(item, brief),
    )
      ? 'insufficient_evidence'
      : 'infeasible';
    result.diagnostics.push('no_comparable_budget_candidates');
    return result;
  }
  const contextualObjective = (items: PlanningScoringCandidate[]) =>
    items.reduce(
      (sum, item, index) =>
        sum + incrementalUtility(scorePlanningFace(item, brief, config, items.slice(0, index))),
      0,
    );
  let states: SearchState[] = [
    {
      candidates: lockedCandidates,
      amount: lockedAmount,
      objective: contextualObjective(lockedCandidates),
    },
  ];
  for (const candidate of pool.filter((item) => !lockedIds.includes(item.faceId))) {
    const expanded = [...states];
    for (const state of states) {
      if (
        state.candidates.length >= maxFaces ||
        (effective.oneFacePerSite &&
          state.candidates.some((item) => item.siteId === candidate.siteId)) ||
        state.candidates.some((item) => item.cost!.basis !== candidate.cost!.basis)
      )
        continue;
      const amount = round(state.amount + candidate.cost!.amount);
      if (amount > budget.amount) continue;
      const assessment = scorePlanningFace(candidate, brief, config, state.candidates);
      expanded.push({
        candidates: [...state.candidates, candidate],
        amount,
        objective: state.objective + incrementalUtility(assessment),
      });
    }
    expanded.sort(stateOrder);
    states = expanded.slice(0, effective.beamWidth);
  }
  const best = states.sort(stateOrder)[0];
  if (!best.candidates.length) {
    result.status = 'insufficient_evidence';
    result.diagnostics.push('no_supported_fit_evidence');
    return result;
  }
  result.status = 'ready';
  result.selectedFaceIds = best.candidates.map((item) => item.faceId);
  result.selectedSiteIds = [...new Set(best.candidates.map((item) => item.siteId))];
  result.selectedAssessments = best.candidates.map((item, index) =>
    scorePlanningFace(item, brief, config, best.candidates.slice(0, index)),
  );
  result.cost = {
    amount: best.amount,
    currency: budget.currency,
    basis: best.candidates[0].cost!.basis,
    window: { ...brief.window },
  };
  result.budgetRemaining = round(budget.amount - best.amount);
  result.objective = round(best.objective);
  if (result.truncated) result.diagnostics.push('search_pool_truncated');
  if (best.candidates.some((item) => item.availability === 'unknown'))
    result.diagnostics.push('availability_verification_required');
  if (
    result.selectedAssessments.some((item) =>
      item.unknowns.some((code) =>
        [
          'country_unknown',
          'city_unknown',
          'radius_geometry_unverified',
          'target_area_unknown',
          'target_corridor_unknown',
        ].includes(code),
      ),
    )
  )
    result.diagnostics.push('geography_constraints_unresolved');
  if (result.cost.basis === 'research_month')
    result.diagnostics.push('research_monthly_asking_baseline_only');
  if (unique.some((item) => costProblem(item, brief)))
    result.diagnostics.push('unpriced_or_incomparable_candidates_not_auto_selected');
  return result;
}

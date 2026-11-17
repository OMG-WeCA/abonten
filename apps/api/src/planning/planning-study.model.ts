import {
  evaluateSecAudience,
  SEC_AUDIENCE_REFERENCE_VERSION,
  SEC_AUDIENCE_METHOD,
  SEC_AUDIENCE_GRAIN,
  SEC_AUDIENCE_PUBLICATION_VERSION,
  SEC_MAX_OPTIMIZER_SPREAD_PP,
} from './sec-audience-model';
import {
  evaluateHouseholdAudience,
  HOUSEHOLD_AUDIENCE_REFERENCE_VERSION,
  type HouseholdAudienceResult,
} from './household-audience-model';
import { decodeRoutePath, displayRoute } from '@abonten/contracts/route-geometry.cjs';
import type { FacePlanningProfile } from '@abonten/contracts/planning-profile';
import type {
  PlanningStudyAudienceScenario,
  PlanningStudyFace,
  PlanningStudyFacePeriod,
  PlanningStudyRequest,
  PlanningStudyResult,
  PlanningStudySamplingCheck,
} from '@abonten/contracts/planning-study';
import {
  estimateTimeInView,
  matchRoadApproach,
  scoreAbontenFace,
  type TravelDirection,
} from './abonten-score';
import { metricPoint } from './audience-model-geography';
import { daypartAt, generatePairs } from './travel-demand-generation';
import type { DemandInputSource, DemandZone } from './travel-demand-inputs';
import { ROUTING_FAILURE_GUIDANCE, type RoutedEstimate } from './mapbox-directions.provider';
import type { TravelDemandRouteFailure } from './dto/travel-demand-shared.dto';
import { inverseDurationShares } from './travel-demand-model';

export type StudyPair = ReturnType<typeof generatePairs>[number];
export interface StudyRoute extends RoutedEstimate {
  id: string;
  points: { longitude: number; latitude: number }[];
  share: number;
}
export interface StudyPeriod {
  id: string;
  departureAt: string;
  daypart: ReturnType<typeof daypartAt>;
  pairs: { pair: StudyPair; routes: StudyRoute[]; unavailableReason: string | null }[];
  generatedWeight: number;
}
export interface StudyDemographics {
  sources: DemandInputSource[];
  pixelSizeMetres?: number;
  supportedAgeBands: string[];
  sexSupported: boolean;
  /** Absolute public raster totals per zone, age and sex. */
  cells: {
    zoneId: number;
    ageBand: string;
    sex: 'female' | 'male';
    residents: number;
    coverage: number;
  }[];
}
export interface StudyEvidence {
  sources: DemandInputSource[];
  zones: DemandZone[];
  periods: StudyPeriod[];
  generatedPairCount: number;
  populationCoverage: number;
  warnings: string[];
  demographics: StudyDemographics;
  usedCount?: number;
  benchmarkApproaches?: {
    longitude: number;
    latitude: number;
    bearingDeg: number;
    halfWidthMetres: number;
    source?: string;
  }[];
}
const COHORTS_PER_ZONE = 64;
const DAY_MS = 86400000;
const bearing = (east: number, north: number) =>
  ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
function hash(value: string): number {
  let n = 2166136261;
  for (let i = 0; i < value.length; i++) {
    n ^= value.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return (n >>> 0) / 4294967296;
}
function choose<T>(
  items: readonly T[],
  weight: (item: T) => number,
  fraction: number,
): T | undefined {
  let remaining = items.reduce((sum, item) => sum + weight(item), 0) * fraction;
  for (const item of items) {
    remaining -= weight(item);
    if (remaining < 0) return item;
  }
  return items.some((item) => weight(item) > 0) ? items.at(-1) : undefined;
}
export function insideStudyZone(id: number) {
  const x = (id - 1) % 5;
  const y = Math.floor((id - 1) / 5);
  return x >= 1 && x <= 3 && y >= 1 && y <= 3;
}
export function localDays(request: PlanningStudyRequest) {
  const start = Date.parse(`${request.flight.startDate}T00:00:00Z`);
  const end = Date.parse(`${request.flight.endDate}T00:00:00Z`);
  return Array.from({ length: (end - start) / DAY_MS }, (_, index) => {
    const date = new Date(start + index * DAY_MS);
    return { date: date.toISOString().slice(0, 10), weekend: [0, 6].includes(date.getUTCDay()) };
  });
}
/** Resolve a local calendar hour without treating a market day as a UTC day. */
export function localDeparture(date: string, hour: number, timeZone: string) {
  const desired = Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  let instant = desired;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(instant));
    const read = (type: string) => parts.find((part) => part.type === type)!.value;
    const local = Date.parse(
      `${read('year')}-${read('month')}-${read('day')}T${read('hour')}:${read('minute')}:${read('second')}Z`,
    );
    instant += desired - local;
  }
  return new Date(instant).toISOString();
}
export function representativePeriods(request: PlanningStudyRequest) {
  const days = localDays(request);
  return request.dayparts.flatMap((part) => {
    const day = days.find((day) =>
      part.dayType === 'weekday' ? !day.weekend : part.dayType === 'weekend' ? day.weekend : true,
    );
    if (!day) return [];
    const departureAt = localDeparture(day.date, part.localHour, request.timeZone);
    return [
      { id: part.id, departureAt, daypart: daypartAt(new Date(departureAt), request.timeZone) },
    ];
  });
}
export function routeChoices(pair: StudyPair, estimates: RoutedEstimate[], periodId: string) {
  const shares = inverseDurationShares(estimates.map((route) => route.durationSeconds));
  return estimates.flatMap((route, index) => {
    const points = decodeRoutePath(route.path);
    return points
      ? [{ ...route, id: `${periodId}:${pair.id}:${index}`, points, share: shares[index] }]
      : [];
  });
}
/** Rank undirected blocks on one fixed demand scale, favoring trips that can approach a candidate board. */
export function selectPairBlocks(
  periods: { pairs: StudyPair[] }[],
  faces: PlanningStudyFace[],
  referenceCount: number,
) {
  const pairs = new Map<string, { ids: Set<string>; score: number; local: boolean }>();
  for (const period of periods)
    for (const pair of period.pairs) {
      const key = [pair.originZone, pair.destinationZone].sort((a, b) => a - b).join(':');
      let near = 0;
      for (const face of faces) {
        const a = metricPoint(pair.origin, face);
        const b = metricPoint(pair.destination, face);
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(a[0] + t * dx, a[1] + t * dy);
        near = Math.max(near, 1 / (1 + d / 500));
      }
      const existing = pairs.get(key) ?? {
        ids: new Set<string>(),
        score: 0,
        local: insideStudyZone(pair.originZone) && insideStudyZone(pair.destinationZone),
      };
      existing.ids.add(pair.id);
      existing.score += pair.demandWeight * (0.15 + near);
      pairs.set(key, existing);
    }
  const ranked = [...pairs.entries()].sort(
    (a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]),
  );
  // Alternate locally contained and entering/leaving blocks before filling by board relevance.
  const local = ranked.filter(([, pair]) => pair.local && pair.ids.size === 2);
  const through = ranked.filter(([, pair]) => !pair.local && pair.ids.size === 2);
  const ordered: typeof ranked = [];
  while (local.length || through.length) {
    if (local.length) ordered.push(local.shift()!);
    if (through.length) ordered.push(through.shift()!);
  }
  return ordered.flatMap(([, pair]) => [...pair.ids].sort()).slice(0, referenceCount);
}
function schedule(hour: number, range: { startHour: number; endHour: number } | undefined) {
  if (!range) return null;
  return range.startHour < range.endHour
    ? hour >= range.startHour && hour < range.endHour
    : hour >= range.startHour || hour < range.endHour;
}
function siteIlluminationHours(
  value: string | null | undefined,
): { startHour: number; endHour: number } | undefined {
  if (!value) return undefined;
  const text = value.trim().toLowerCase();
  if (['24/7', '24h', '24 hours', '24 heures'].includes(text)) return { startHour: 0, endHour: 24 };
  const match = /^([0-2]?\d):([0-5]\d)\s*[-–]\s*([0-2]?\d):([0-5]\d)$/.exec(text);
  if (!match) return undefined;
  const start = Number(match[1]) + Number(match[2]) / 60,
    end = Number(match[3]) + Number(match[4]) / 60;
  return start >= 0 && start < 24 && end >= 0 && end <= 24 && start !== end
    ? { startHour: start, endHour: end }
    : undefined;
}
function nightLighting(
  face: PlanningStudyFace,
  profile: FacePlanningProfile,
  hour: number,
): boolean | null {
  if (profile.illuminationSchedule) return schedule(hour, profile.illuminationSchedule);
  if (face.illumination?.type === 'none') return false;
  const hours = siteIlluminationHours(face.illumination?.hours);
  return hours ? schedule(hour, hours) : null;
}
interface RouteFaceAssessment {
  crossing: boolean;
  ambiguous: boolean;
  direction: TravelDirection | null;
  viewable: boolean | null;
  seconds: number | null;
  distanceMetres: number | null;
  speedKph: number | null;
  reason: string | null;
  eligibleShare?: number | null;
}
function calculateRouteFace(
  route: StudyRoute,
  face: PlanningStudyFace,
  hour: number,
): RouteFaceAssessment {
  const absent: RouteFaceAssessment = {
    crossing: false,
    ambiguous: false,
    direction: null,
    viewable: null,
    seconds: null,
    distanceMetres: null,
    speedKph: null,
    reason: null,
  };
  if (!face.approach) return { ...absent, reason: 'A mapped road approach is unavailable.' };
  const points = route.points.map((point) => metricPoint(point, face.approach!));
  const crossing = matchRoadApproach(
    points,
    face.approach.bearingDeg,
    face.approach.halfWidthMetres,
  );
  if (crossing === 'ambiguous')
    return {
      ...absent,
      ambiguous: true,
      reason: 'The route crosses this approach more than once; correct the road point.',
    };
  if (!crossing) return absent;
  const crossingSpeed = route.segments[crossing.segmentEndIndex - 1]?.speedMps;
  const result = {
    ...absent,
    crossing: true,
    direction: crossing.direction,
    speedKph:
      typeof crossingSpeed === 'number' && Number.isFinite(crossingSpeed) && crossingSpeed > 0
        ? 3.6 * crossingSpeed
        : null,
  };
  const p = face.profile as unknown as FacePlanningProfile | null;
  if (
    !p?.sightline ||
    p.facingDeg === undefined ||
    p.viewingDistanceMetres === undefined ||
    p.viewingAngleDeg === undefined ||
    p.minimumViewSeconds === undefined ||
    !p.obstruction ||
    p.obstruction === 'unknown'
  )
    return {
      ...result,
      reason:
        'Add the face facing, usable sightline, viewing cone, viewing distance, obstruction and minimum viewing time.',
    };
  if (p.obstruction === 'blocked')
    return {
      ...result,
      viewable: false,
      seconds: 0,
      distanceMetres: 0,
      reason: 'The declared sightline is obstructed.',
    };
  const display = schedule(hour, p.displaySchedule);
  if (display === null) return { ...result, reason: 'Add local display operating hours.' };
  if (!display)
    return {
      ...result,
      viewable: false,
      seconds: 0,
      distanceMetres: 0,
      reason: 'The display is outside its operating schedule.',
    };
  if (hour < 6 || hour >= 18) {
    const lit = nightLighting(face, p, hour);
    if (lit !== true)
      return {
        ...result,
        viewable: lit,
        seconds: lit === false ? 0 : null,
        distanceMetres: lit === false ? 0 : null,
        reason:
          lit === false
            ? 'Saved illumination facts make this face ineligible at this local night time.'
            : 'Night illumination is unknown. Record face lighting hours or parseable site illumination hours.',
      };
  }
  if (p.obstruction === 'partial')
    return {
      ...result,
      reason:
        'A partial obstruction needs a confirmed continuous clear sightline before viewability can be assessed.',
    };
  // A front approach must start in the facing cone and travel toward the face.
  const faceOrigin = metricPoint(
    { longitude: face.longitude, latitude: face.latitude },
    face.approach,
  );
  const viewpoint = metricPoint(p.sightline, {
    longitude: face.longitude,
    latitude: face.latitude,
  });
  const usableRange = Math.min(p.viewingDistanceMetres, Math.hypot(...viewpoint));
  const sections: { distanceMetres: number; inView: boolean; speedMps: number | null }[] = [];
  const cut = crossing.segmentEndIndex;
  let inViewLength = 0;
  let nearestApproachDistance = Infinity;
  for (let index = 1; index <= cut; index++) {
    const a = points[index - 1];
    const b = points[index];
    const geometricLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!geometricLength) continue;
    const fraction = index === cut ? crossing.fraction : 1;
    const dx = b[0] - a[0],
      dy = b[1] - a[1];
    const closest = Math.max(
      0,
      Math.min(
        fraction,
        ((faceOrigin[0] - a[0]) * dx + (faceOrigin[1] - a[1]) * dy) /
          (geometricLength * geometricLength),
      ),
    );
    const approachDistance = Math.hypot(
      a[0] + closest * dx - faceOrigin[0],
      a[1] + closest * dy - faceOrigin[1],
    );
    nearestApproachDistance = Math.min(nearestApproachDistance, approachDistance);
    if (approachDistance > usableRange + 5) {
      sections.push({ distanceMetres: 0, inView: false, speedMps: null });
      continue;
    }
    const substeps = Math.min(100, Math.max(1, Math.ceil((geometricLength * fraction) / 5)));
    const annotation = route.segments[index - 1];
    for (let step = 0; step < substeps; step++) {
      const f = (fraction * (step + 0.5)) / substeps;
      const x = a[0] + (b[0] - a[0]) * f - faceOrigin[0];
      const y = a[1] + (b[1] - a[1]) * f - faceOrigin[1];
      const distance = Math.hypot(x, y);
      const toFace = -(x * (b[0] - a[0]) + y * (b[1] - a[1]));
      const inView =
        distance <= usableRange &&
        angle(bearing(x, y), p.facingDeg) <= p.viewingAngleDeg / 2 &&
        toFace > 0;
      const sectionDistance =
        ((annotation?.distanceMetres ?? geometricLength) * fraction) / substeps;
      sections.push({
        distanceMetres: sectionDistance,
        inView,
        speedMps: annotation?.speedMps ?? null,
      });
      if (inView) inViewLength += sectionDistance;
    }
  }
  const viewing = estimateTimeInView(sections);
  if (!viewing)
    return {
      ...result,
      distanceMetres: inViewLength,
      reason: 'Mapbox returned no usable local segment speed for the visible approach.',
    };
  const digital = face.digital;
  let eligibleShare = viewing.seconds >= p.minimumViewSeconds ? 1 : 0;
  if (digital) {
    const spots = digital.advertiserSpotsPerLoop,
      spot = digital.spotLengthSeconds,
      loop = digital.loopLengthSeconds;
    if (spots === null || spot === null || loop === null)
      return {
        ...result,
        seconds: viewing.seconds,
        distanceMetres: viewing.distanceMetres,
        reason:
          'Set the planned advertiser plays per loop and complete the digital spot/loop specifications.',
      };
    const interval = spots > 0 ? loop / spots : Infinity;
    eligibleShare =
      viewing.seconds < p.minimumViewSeconds || spot < p.minimumViewSeconds || spots === 0
        ? 0
        : spot >= interval
          ? 1
          : Math.min(
              1,
              Math.max(0, (viewing.seconds + spot - 2 * p.minimumViewSeconds) / interval),
            );
  }
  return {
    ...result,
    eligibleShare,
    viewable: eligibleShare > 0,
    seconds: viewing.seconds,
    distanceMetres: viewing.distanceMetres,
    speedKph:
      viewing.seconds > 0 ? (3.6 * viewing.distanceMetres) / viewing.seconds : result.speedKph,
    reason:
      viewing.seconds >= p.minimumViewSeconds
        ? null
        : viewing.seconds === 0 && nearestApproachDistance > usableRange
          ? 'The matched road approach lies beyond the declared usable viewpoint or viewing distance. Check the face viewpoint, road approach and viewing range.'
          : viewing.seconds === 0
            ? 'The matched journey does not enter this face’s viewing cone before the road crossing. Check facing and the usable viewpoint.'
            : 'Continuous time in view is below the face viewing requirement.',
  };
}
function directionFor(face: PlanningStudyFace): TravelDirection {
  const p = face.profile as unknown as FacePlanningProfile | null;
  return p?.facingDeg !== undefined &&
    face.approach &&
    angle(p.facingDeg, face.approach.bearingDeg) < 90
    ? 'reverse'
    : 'forward';
}
const routeAssessments = new WeakMap<StudyRoute, Map<string, RouteFaceAssessment>>();
const faceKeys = new WeakMap<PlanningStudyFace, string>();
export function assessRouteFace(
  route: StudyRoute,
  face: PlanningStudyFace,
  hour: number,
): RouteFaceAssessment {
  let faceKey = faceKeys.get(face);
  if (!faceKey) {
    faceKey = JSON.stringify([
      face.digital,
      face.illumination,
      face.faceId,
      face.longitude,
      face.latitude,
      face.approach,
      face.profile,
    ]);
    faceKeys.set(face, faceKey);
  }
  const key = `${faceKey}:${hour}`;
  let cached = routeAssessments.get(route);
  if (!cached) {
    cached = new Map();
    routeAssessments.set(route, cached);
  }
  let result = cached.get(key);
  if (!result) {
    result = calculateRouteFace(route, face, hour);
    cached.set(key, result);
  }
  return result;
}
const benchmarkCache = new WeakMap<StudyPeriod, number[][]>();
function benchmarkWeights(period: StudyPeriod, evidence: StudyEvidence, count: number): number[] {
  let prefixes = benchmarkCache.get(period);
  if (!prefixes) {
    const approaches = evidence.benchmarkApproaches ?? [];
    prefixes = [Array.from({ length: approaches.length * 2 }, () => 0)];
    for (const pair of period.pairs) {
      const weights = [...prefixes.at(-1)!];
      for (const route of pair.routes)
        for (let i = 0; i < approaches.length; i++) {
          const approach = approaches[i];
          const matched = matchRoadApproach(
            route.points.map((point) => metricPoint(point, approach)),
            approach.bearingDeg,
            approach.halfWidthMetres,
          );
          if (matched && matched !== 'ambiguous')
            weights[i * 2 + (matched.direction === 'forward' ? 0 : 1)] +=
              pair.pair.demandWeight * route.share;
        }
      prefixes.push(weights);
    }
    benchmarkCache.set(period, prefixes);
  }
  return prefixes[Math.min(count, prefixes.length - 1)];
}
export function faceReadinessIssues(
  face: PlanningStudyFace,
  dayparts: PlanningStudyRequest['dayparts'],
): string[] {
  const p = face.profile as unknown as FacePlanningProfile | null;
  const missing: string[] = [];
  if (!face.approach) missing.push('Select the driving road approach.');
  if (!p?.sightline) missing.push('Record the usable sightline.');
  if (p?.facingDeg === undefined) missing.push('Record the face facing.');
  if (p?.viewingDistanceMetres === undefined) missing.push('Record the viewing distance.');
  if (p?.viewingAngleDeg === undefined) missing.push('Record the viewing cone.');
  if (p?.minimumViewSeconds === undefined) missing.push('Record the minimum viewing time.');
  if (!p?.obstruction || p.obstruction === 'unknown')
    missing.push('Record the obstruction condition.');
  else if (p.obstruction === 'blocked' || p.obstruction === 'partial')
    missing.push('Resolve the obstructed sightline.');
  if (!p?.displaySchedule) missing.push('Record local display operating hours.');
  if (
    face.digital &&
    [
      face.digital.advertiserSpotsPerLoop,
      face.digital.spotLengthSeconds,
      face.digital.loopLengthSeconds,
    ].some((value) => value === null)
  )
    missing.push('Complete digital spot/loop specifications and planned advertiser plays.');
  if (p)
    for (const part of dayparts) {
      if (schedule(part.localHour, p.displaySchedule) === false)
        missing.push(`${part.label}: outside display operating hours.`);
      if (part.localHour < 6 || part.localHour >= 18) {
        const lit = nightLighting(face, p, part.localHour);
        if (lit !== true)
          missing.push(
            `${part.label}: ${lit === false ? 'face is unlit at this time.' : 'record local illumination hours.'}`,
          );
      }
    }
  return [...new Set(missing)];
}
function requiredFaceInputs(face: PlanningStudyFace) {
  const p = face.profile as unknown as FacePlanningProfile | null;
  return Boolean(
    face.approach &&
    p?.sightline &&
    p.facingDeg !== undefined &&
    p.viewingDistanceMetres !== undefined &&
    p.viewingAngleDeg !== undefined &&
    p.minimumViewSeconds !== undefined &&
    p.obstruction &&
    p.obstruction !== 'unknown' &&
    p.displaySchedule &&
    (!face.digital || face.digital.advertiserSpotsPerLoop !== null),
  );
}
export function scorePeriods(
  faces: PlanningStudyFace[],
  evidence: StudyEvidence,
  count: number,
  request: PlanningStudyRequest,
) {
  return faces.map((face) => {
    const periods = evidence.periods.map((period) => {
      const hour = request.dayparts.find((part) => part.id === period.id)!.localHour;
      const passages: {
        direction: TravelDirection | null;
        weight: number;
        viewable: boolean | null;
      }[] = [];
      const reasons = new Set<string>();
      let time = 0;
      let distance = 0;
      let timedWeight = 0;
      let speed = 0;
      let speedWeight = 0;
      const direction = directionFor(face);
      const facingKnown =
        (face.profile as unknown as FacePlanningProfile | null)?.facingDeg !== undefined;
      let traffic = false;
      let unconfirmed = false;
      for (const pair of period.pairs.slice(0, count))
        for (const route of pair.routes) {
          const result = assessRouteFace(route, face, hour);
          const weight = pair.pair.demandWeight * route.share;
          if (result.ambiguous) {
            reasons.add(result.reason!);
            passages.push({ direction: null, weight, viewable: null });
            continue;
          }
          if (!result.crossing) continue;
          const eligibleShare =
            result.eligibleShare ??
            (result.viewable === true ? 1 : result.viewable === false ? 0 : null);
          if (eligibleShare === null)
            passages.push({ direction: result.direction!, weight, viewable: null });
          else {
            if (eligibleShare > 0)
              passages.push({
                direction: result.direction!,
                weight: weight * eligibleShare,
                viewable: true,
              });
            if (eligibleShare < 1)
              passages.push({
                direction: result.direction!,
                weight: weight * (1 - eligibleShare),
                viewable: false,
              });
          }
          if (result.reason) reasons.add(result.reason);
          if (
            facingKnown &&
            result.direction === direction &&
            result.seconds !== null &&
            result.distanceMetres !== null
          ) {
            time += result.seconds * weight;
            distance += result.distanceMetres * weight;
            timedWeight += weight;
          }
          if (facingKnown && result.direction === direction && result.speedKph !== null) {
            speed += result.speedKph * weight;
            speedWeight += weight;
          }
          if (route.evidence === 'mapbox_traffic_indicated') traffic = true;
          else unconfirmed = true;
        }
      const peers = benchmarkWeights(period, evidence, count);
      const ambiguousDirection = passages.some(
        (passage) => passage.direction === null && passage.weight > 0,
      );
      const score = scoreAbontenFace(passages, direction, peers);
      const passingWeight = passages.reduce((sum, passage) => sum + passage.weight, 0);
      if (!passingWeight)
        reasons.add('The routed sample has no matched passing weight at this road approach.');
      if (period.pairs.slice(0, count).some((pair) => pair.unavailableReason))
        reasons.add(
          'Some selected trip pairs have unresolved routes; passage coverage is incomplete.',
        );
      const unresolved = period.pairs.slice(0, count).some((pair) => pair.unavailableReason);
      return {
        daypartId: period.id,
        direction: facingKnown ? direction : null,
        passingWeight,
        directionalWeight: score.demandWeight,
        directionShare:
          facingKnown && !ambiguousDirection && passingWeight > 0
            ? score.demandWeight / passingWeight
            : null,
        directionalDemand: unresolved || !facingKnown ? null : score.directionalDemand,
        viewabilityFit: unresolved ? null : score.viewabilityFit,
        assessmentCoverage: score.assessableShare,
        timeInViewSeconds: timedWeight ? time / timedWeight : null,
        speedKph: speedWeight > 0 ? speed / speedWeight : null,
        visibleDistanceMetres: timedWeight ? distance / timedWeight : null,
        trafficEvidence: traffic ? 'indicated' : unconfirmed ? 'unconfirmed' : 'unavailable',
        unavailableReasons: [...reasons],
      } satisfies PlanningStudyFacePeriod;
    });
    return { ...face, periods };
  });
}
export function samplingDiagnostics(
  request: PlanningStudyRequest,
  faces: PlanningStudyFace[],
  evidence: StudyEvidence,
) {
  const referenceCount = evidence.periods[0]?.pairs.length ?? 0;
  const counts = [
    ...new Set(
      [
        2,
        8,
        16,
        24,
        34,
        48,
        72,
        100,
        150,
        200,
        request.sampling.directedPairs ?? 34,
        referenceCount,
      ].filter((count) => count > 0 && count <= referenceCount),
    ),
  ].sort((a, b) => a - b);
  const reference = scorePeriods(faces, evidence, referenceCount, request);
  const checks: PlanningStudySamplingCheck[] = [];
  for (const count of counts) {
    const sample =
      count === referenceCount ? reference : scorePeriods(faces, evidence, count, request);
    let difference = 0;
    let coverage = 1;
    let supported = faces.length > 0;
    for (let i = 0; i < reference.length; i++)
      for (let p = 0; p < reference[i].periods.length; p++) {
        const a = sample[i].periods[p];
        const b = reference[i].periods[p];
        if (
          b.passingWeight <= 0 ||
          a.directionShare === null ||
          b.directionShare === null ||
          a.viewabilityFit === null ||
          b.viewabilityFit === null
        ) {
          supported = false;
          continue;
        }
        difference = Math.max(
          difference,
          100 * Math.abs(a.directionShare - b.directionShare),
          Math.abs(a.viewabilityFit - b.viewabilityFit),
        );
        coverage = Math.min(coverage, a.passingWeight / b.passingWeight);
      }
    // A reference cannot establish its own convergence; it must be larger than the candidate.
    checks.push({
      directedPairs: count,
      maximumDifferencePp: supported && count < referenceCount ? difference : null,
      minimumPassingWeightCoverage: supported && count < referenceCount ? coverage : null,
      passes: supported && count < referenceCount && difference <= 3 && coverage >= 0.95,
    });
  }
  const recommendation = checks.find(
    (check, index) =>
      check.passes &&
      checks
        .slice(index)
        .filter((later) => later.directedPairs < referenceCount)
        .every((later) => later.passes),
  );
  const usedCount =
    evidence.usedCount ??
    (request.sampling.mode === 'custom'
      ? Math.min(request.sampling.directedPairs!, referenceCount)
      : (recommendation?.directedPairs ?? referenceCount));
  const actual = checks.find((check) => check.directedPairs === usedCount) ?? {
    maximumDifferencePp: null,
    minimumPassingWeightCoverage: null,
  };
  return {
    referenceCount,
    usedCount,
    recommendation: recommendation?.directedPairs ?? null,
    checks,
    maximumDifferencePp: actual.maximumDifferencePp,
    minimumPassingWeightCoverage: actual.minimumPassingWeightCoverage,
    stable: recommendation !== undefined,
    reason: `${request.sampling.mode === 'custom' ? `Custom uses ${usedCount} directed pairs against ${referenceCount} reference pairs.` : recommendation ? `Recommended uses ${usedCount} directed pairs against ${referenceCount} reference pairs.` : `The full available reference of ${usedCount} directed pairs is used.`} ${recommendation ? `The smallest stable tested sample uses ${recommendation.directedPairs} directed pairs.` : reference.some((face) => face.periods.some((period) => period.viewabilityFit === null)) ? 'Face viewing inputs or matched routes cannot yet support stability checks.' : `No smaller tested sample met the 3 percentage point and 95% passing-weight checks.`}`,
  };
}
interface ModeledPerson {
  weight: number;
  counts: Uint32Array;
}
interface ModelPopulation {
  id: 'lower' | 'base' | 'higher';
  people: ModeledPerson[];
  population: number;
  participatingPopulation: number;
  assumptions: PlanningStudyRequest['assumptions'];
}
const purposeCache = new WeakMap<
  StudyEvidence,
  { key: string; weights: { homeZone: number; category: string; weight: number }[] }
>();
/** Purpose identity uses the complete generated trip demand, independent of routed pair budgets and selected faces. */
function stablePurposeWeights(request: PlanningStudyRequest, evidence: StudyEvidence) {
  const key = JSON.stringify({
    dayparts: request.dayparts,
    flight: request.flight,
    timeZone: request.timeZone,
  });
  const cached = purposeCache.get(evidence);
  if (cached?.key === key) return cached.weights;
  const grouped = new Map<string, { homeZone: number; category: string; weight: number }>();
  for (const period of representativePeriods(request))
    for (const pair of generatePairs(evidence.zones, period.daypart))
      for (const contribution of pair.contributions) {
        const id = `${contribution.homeZone}:${contribution.category}`;
        const row = grouped.get(id) ?? {
          homeZone: contribution.homeZone,
          category: contribution.category,
          weight: 0,
        };
        row.weight += contribution.weight;
        grouped.set(id, row);
      }
  const weights = [...grouped.values()].sort(
    (a, b) => a.homeZone - b.homeZone || a.category.localeCompare(b.category),
  );
  purposeCache.set(evidence, { key, weights });
  return weights;
}
function cohortPurpose(
  zoneId: number,
  cohort: number,
  weights: ReturnType<typeof stablePurposeWeights>,
) {
  return choose(
    weights.filter((row) => row.homeZone === zoneId),
    (row) => row.weight,
    hash(`zone:${zoneId}:person:${cohort}:purpose`),
  )?.category;
}
function targetPurposeShare(
  zone: DemandZone,
  request: PlanningStudyRequest,
  evidence: StudyEvidence,
) {
  if (!request.target.travelPurposes?.length) return 1;
  const weights = stablePurposeWeights(request, evidence);
  let matching = 0;
  for (let cohort = 0; cohort < COHORTS_PER_ZONE; cohort++)
    if (request.target.travelPurposes.includes(cohortPurpose(zone.id, cohort, weights) ?? ''))
      matching++;
  return matching / COHORTS_PER_ZONE;
}
const householdCache = new WeakMap<
  StudyEvidence,
  { key: string; zones: Map<number, HouseholdAudienceResult> }
>();
function householdQualification(
  zone: DemandZone,
  request: PlanningStudyRequest,
  evidence: StudyEvidence,
): HouseholdAudienceResult | null {
  const parent = request.target.household?.parentsOfSchoolChildren;
  if (!parent) return null;
  const key = JSON.stringify({
    country: request.countryCode,
    target: request.target,
    center: request.center,
    radius: request.radiusKm,
    version: HOUSEHOLD_AUDIENCE_REFERENCE_VERSION,
  });
  let cached = householdCache.get(evidence);
  if (!cached || cached.key !== key) {
    cached = { key, zones: new Map() };
    householdCache.set(evidence, cached);
  }
  const previous = cached.zones.get(zone.id);
  if (previous) return previous;
  const source = evidence.sources.find((source) => source.layer === 'pois');
  const result = evaluateHouseholdAudience({
    countryCode: request.countryCode,
    ageSexPopulation: evidence.demographics.cells.filter((cell) => cell.zoneId === zone.id),
    parent: { ...parent, childAgeMin: parent.childAgeMin!, childAgeMax: parent.childAgeMax! },
    economicDescription: request.target.household?.economicDescription,
    selectedAgeBands: request.target.ageBands,
    selectedSex: request.target.sex,
    ...(source
      ? {
          schoolGeography: {
            homeZoneId: zone.id,
            cellWidthMetres: ((request.radiusKm * 2) / 3) * 1000,
            source,
            zones: evidence.zones
              .filter((z) => z.center)
              .map((z) => ({
                id: z.id,
                longitude: z.center!.longitude,
                latitude: z.center!.latitude,
                schoolCount: z.schoolCount ?? 0,
                selectedSchoolCount: z.selectedSchoolCount ?? 0,
              })),
          },
        }
      : {}),
  });
  cached.zones.set(zone.id, result);
  return result;
}
function targetShare(
  zone: DemandZone,
  request: PlanningStudyRequest,
  evidence: StudyEvidence,
  scenario: 'lower' | 'base' | 'higher' = 'base',
): number | null {
  if (request.target.locations?.length && !request.target.locations.includes(zone.id)) return 0;
  const ages = request.target.ageBands ?? [];
  const sex = request.target.sex;
  if (request.target.sec?.groups.length) {
    const cells = evidence.demographics.cells.filter((cell) => cell.zoneId === zone.id);
    if (cells.length !== 34 || cells.some((cell) => cell.coverage < 0.95)) return null;
    const result = evaluateSecAudience({
      countryCode: request.countryCode,
      cells,
      target: request.target,
      parent: householdQualification(zone, request, evidence),
    });
    return scenario === 'lower'
      ? result.lowerShare
      : scenario === 'higher'
        ? result.higherShare
        : result.share;
  }
  if (request.target.household?.parentsOfSchoolChildren) {
    const cells = evidence.demographics.cells.filter((cell) => cell.zoneId === zone.id);
    if (cells.length !== 34 || cells.some((cell) => cell.coverage < 0.95)) return null;
    const qualification = householdQualification(zone, request, evidence);
    return scenario === 'lower'
      ? (qualification?.lowerShare ?? null)
      : scenario === 'higher'
        ? (qualification?.higherShare ?? null)
        : (qualification?.share ?? null);
  }
  if (
    request.target.household?.economicDescription?.trim() ||
    request.target.unsupportedCriteria?.length
  )
    return null;
  if (!ages.length && !sex) return 1;
  const cells = evidence.demographics.cells.filter(
    (cell) =>
      cell.zoneId === zone.id &&
      (!ages.length || ages.includes(cell.ageBand)) &&
      (!sex || sex === cell.sex),
  );
  const denominator = evidence.demographics.cells.filter((cell) => cell.zoneId === zone.id);
  if (
    !zone.residents ||
    denominator.length < 34 ||
    denominator.some((cell) => cell.coverage < 0.95)
  )
    return null;
  const total = denominator.reduce((sum, cell) => sum + cell.residents, 0);
  if (total <= 0) return null;
  const expected = (ages.length || 17) * (sex ? 1 : 2);
  if (cells.length < expected) return null;
  return Math.min(1, cells.reduce((sum, cell) => sum + cell.residents, 0) / total);
}
export function targetingEvidence(
  request: PlanningStudyRequest,
  evidence: StudyEvidence,
): PlanningStudyResult['targeting'] {
  const reasons: string[] = [];
  const household = request.target.household?.parentsOfSchoolChildren;
  if (request.target.unsupportedCriteria?.length)
    reasons.push(
      ...request.target.unsupportedCriteria.map(
        (criterion) => `No qualification evidence supports: ${criterion}.`,
      ),
    );
  if (request.target.household?.economicDescription?.trim())
    reasons.push(
      'The chosen economic target criterion has no supported joint household reference.',
    );
  const householdResults = household
    ? evidence.zones
        .filter(
          (zone) =>
            (zone.residents ?? 0) > 0 &&
            (!request.target.locations?.length || request.target.locations.includes(zone.id)),
        )
        .map((zone) => ({ zone, result: householdQualification(zone, request, evidence)! }))
    : [];
  reasons.push(...new Set(householdResults.flatMap((row) => row.result.reasons)));
  const secResults = request.target.sec?.groups.length
    ? evidence.zones
        .filter(
          (zone) =>
            (zone.residents ?? 0) > 0 &&
            (!request.target.locations?.length || request.target.locations.includes(zone.id)),
        )
        .map((zone) => ({
          zone,
          result: evaluateSecAudience({
            countryCode: request.countryCode,
            cells: evidence.demographics.cells.filter((cell) => cell.zoneId === zone.id),
            target: request.target,
            parent: householdQualification(zone, request, evidence),
          }),
        }))
    : [];
  reasons.push(...new Set(secResults.flatMap((row) => row.result.reasons)));
  const ages = request.target.ageBands ?? [];
  if (
    (ages.length || request.target.sex || household || request.target.sec?.groups.length) &&
    !evidence.demographics.sexSupported
  )
    reasons.push(
      'A complete all-age, both-sex demographic grid is required to normalize target shares to the fixed resident population.',
    );
  if (ages.some((age) => !evidence.demographics.supportedAgeBands.includes(age)))
    reasons.push(
      'Requested age bands have no current public demographic raster covering this study.',
    );
  if (request.target.sex && !ages.length && !evidence.demographics.sexSupported)
    reasons.push('The selected sex has no current public demographic raster covering this study.');
  if (
    evidence.zones.some(
      (zone) =>
        zone.residents !== null &&
        zone.residents > 0 &&
        (!request.target.locations?.length || request.target.locations.includes(zone.id)) &&
        Boolean(
          ages.length || request.target.sex || household || request.target.sec?.groups.length,
        ) &&
        (() => {
          const cells = evidence.demographics.cells.filter((cell) => cell.zoneId === zone.id);
          return (
            cells.length !== 34 ||
            cells.some((cell) => cell.coverage < 0.95) ||
            cells.reduce((sum, cell) => sum + cell.residents, 0) <= 0
          );
        })(),
    )
  )
    reasons.push(
      'The selected demographic inputs do not cover at least 95% of known residents in every included populated zone.',
    );
  const qualificationByZone = new Map(
    (request.target.sec?.groups.length ? secResults : householdResults).map(
      (row) => [row.zone.id, row.result] as const,
    ),
  );
  const qualifiedShare = (zone: DemandZone, scenario: 'lower' | 'base' | 'higher' = 'base') => {
    const result = qualificationByZone.get(zone.id);
    return result
      ? scenario === 'lower'
        ? result.lowerShare
        : scenario === 'higher'
          ? result.higherShare
          : result.share
      : targetShare(zone, request, evidence, scenario);
  };
  const population = evidence.zones.reduce(
    (sum, zone) =>
      sum +
      (zone.residents ?? 0) *
        (qualifiedShare(zone) ?? 0) *
        targetPurposeShare(zone, request, evidence),
    0,
  );
  const secDenominator = secResults.reduce(
    (sum, row) => sum + (row.zone.residents ?? 0) * (row.result.selectedShare ?? 0),
    0,
  );
  const secOptimizerTotals = Array.from(
    { length: secResults[0]?.result.optimizerShares?.length ?? 0 },
    (_, index) =>
      secResults.reduce(
        (sum, row) =>
          sum +
          (row.zone.residents ?? 0) *
            (row.result.optimizerShares?.[index] ?? 0) *
            targetPurposeShare(row.zone, request, evidence),
        0,
      ),
  );
  const secAdultDenominator = secResults.reduce(
    (sum, row) =>
      sum +
      (row.zone.residents ?? 0) *
        (row.result.eligibleAdultShare ?? 0) *
        targetPurposeShare(row.zone, request, evidence),
    0,
  );
  const secSpreadPp =
    secAdultDenominator > 0 && secOptimizerTotals.length
      ? (100 * (Math.max(...secOptimizerTotals) - Math.min(...secOptimizerTotals))) /
        secAdultDenominator
      : 0;
  const secWithheld = secSpreadPp > SEC_MAX_OPTIMIZER_SPREAD_PP;
  if (secWithheld)
    reasons.push(
      'The selected SEC estimate has low reliability. Revise the SEC selection to estimate this audience.',
    );
  return {
    status: reasons.length ? 'unavailable' : 'supported',
    population: reasons.length ? null : population,
    sources: [
      ...evidence.demographics.sources,
      ...new Map(
        secResults.flatMap((row) => row.result.sources).map((source) => [source.sourceKey, source]),
      ).values(),
      ...new Map(
        householdResults
          .flatMap((row) => row.result.sources)
          .map((source) => [`${source.sourceKey}:${source.version}`, source]),
      ).values(),
    ],
    reasons: [...new Set(reasons)],
    limitations: [
      ...new Set([
        ...householdResults.flatMap((row) => row.result.limitations),
        ...secResults.flatMap((row) => row.result.limitations),
      ]),
    ],
    ...(request.target.sec?.groups.length
      ? {
          sec: {
            status:
              secWithheld || secResults.some((row) => row.result.status === 'unavailable')
                ? ('unavailable' as const)
                : ('modeled' as const),
            referenceVersion: SEC_AUDIENCE_REFERENCE_VERSION,
            method: SEC_AUDIENCE_METHOD,
            geographicGrain: SEC_AUDIENCE_GRAIN,
            sources: secResults[0]?.result.sources ?? [],
            classifiedShare:
              secDenominator > 0
                ? secResults.reduce(
                    (sum, row) =>
                      sum +
                      (row.zone.residents ?? 0) *
                        (row.result.selectedShare ?? 0) *
                        (row.result.classifiedShare ?? 0),
                    0,
                  ) / secDenominator
                : null,
            unknownShare:
              secDenominator > 0
                ? secResults.reduce(
                    (sum, row) =>
                      sum +
                      (row.zone.residents ?? 0) *
                        (row.result.selectedShare ?? 0) *
                        (row.result.unknownShare ?? 1),
                    0,
                  ) / secDenominator
                : null,
            unknownPotentialShare:
              secDenominator > 0
                ? secResults.reduce(
                    (sum, row) =>
                      sum +
                      (row.zone.residents ?? 0) *
                        (row.result.selectedShare ?? 0) *
                        (row.result.unknownPotentialShare ?? 0),
                    0,
                  ) / secDenominator
                : null,
            publication: {
              status: secWithheld ? ('withheld' as const) : ('available' as const),
              policyVersion: SEC_AUDIENCE_PUBLICATION_VERSION,
              maximumOptimizerSpreadPp: SEC_MAX_OPTIMIZER_SPREAD_PP,
            },
            identification:
              secAdultDenominator > 0 && secOptimizerTotals.length
                ? {
                    optimizerMinPopulation: Math.min(...secOptimizerTotals),
                    optimizerMaxPopulation: Math.max(...secOptimizerTotals),
                    spreadPp:
                      (100 * (Math.max(...secOptimizerTotals) - Math.min(...secOptimizerTotals))) /
                      secAdultDenominator,
                    denominator: 'selected_adults' as const,
                  }
                : null,
            range: {
              lower: reasons.length
                ? null
                : secResults.reduce(
                    (sum, row) =>
                      sum +
                      (row.zone.residents ?? 0) *
                        (qualifiedShare(row.zone, 'lower') ?? 0) *
                        targetPurposeShare(row.zone, request, evidence),
                    0,
                  ),
              base: reasons.length ? null : population,
              higher: reasons.length
                ? null
                : secResults.reduce(
                    (sum, row) =>
                      sum +
                      (row.zone.residents ?? 0) *
                        (qualifiedShare(row.zone, 'higher') ?? 0) *
                        targetPurposeShare(row.zone, request, evidence),
                    0,
                  ),
            },
            reasons: [...new Set(secResults.flatMap((row) => row.result.reasons))],
            limitations: [...new Set(secResults.flatMap((row) => row.result.limitations))],
          },
        }
      : {}),
    ...(household
      ? {
          household: {
            referenceVersion: HOUSEHOLD_AUDIENCE_REFERENCE_VERSION,
            method:
              householdResults[0]?.result.method ?? 'Household audience reference unavailable.',
            geographicGrain: householdResults[0]?.result.geographicGrain ?? null,
            range: {
              lower: reasons.length
                ? null
                : householdResults.reduce(
                    (sum, row) =>
                      sum +
                      (row.zone.residents ?? 0) *
                        (qualifiedShare(row.zone, 'lower') ?? 0) *
                        targetPurposeShare(row.zone, request, evidence),
                    0,
                  ),
              base: reasons.length ? null : population,
              higher: reasons.length
                ? null
                : householdResults.reduce(
                    (sum, row) =>
                      sum +
                      (row.zone.residents ?? 0) *
                        (qualifiedShare(row.zone, 'higher') ?? 0) *
                        targetPurposeShare(row.zone, request, evidence),
                    0,
                  ),
            },
            ...(householdResults[0]?.result.schoolCoverage
              ? {
                  schoolCoverage: {
                    ...householdResults[0].result.schoolCoverage,
                    modeledDestinationCoverage:
                      population > 0
                        ? householdResults.reduce(
                            (sum, row) =>
                              sum +
                              (row.zone.residents ?? 0) *
                                (qualifiedShare(row.zone) ?? 0) *
                                targetPurposeShare(row.zone, request, evidence) *
                                (row.result.schoolCoverage?.modeledDestinationCoverage ?? 0),
                            0,
                          ) / population
                        : 0,
                  },
                }
              : {}),
          },
        }
      : {}),
    supportedAgeBands: evidence.demographics.supportedAgeBands,
    sexSupported: evidence.demographics.sexSupported,
    ...(evidence.demographics.pixelSizeMetres
      ? { sourceResolutionMetres: evidence.demographics.pixelSizeMetres }
      : {}),
    ...(ages.length || request.target.sex
      ? {
          calculationBasis:
            'Within each zone, age/sex grid counts are divided by the same grid’s all-age/both-sex total, then scaled to known base residents. Coverage is weighted by known resident cells; null-population zones remain excluded.',
        }
      : {}),
  };
}
function populationModel(
  request: PlanningStudyRequest,
  evidence: StudyEvidence,
  faces: PlanningStudyFace[],
  count: number,
  journeys = new Map<string, Uint32Array>(),
): ModelPopulation[] {
  const days = localDays(request);
  const assessments = new Map<string, { index: number; share: number }[]>();
  for (const period of evidence.periods)
    for (const pair of period.pairs.slice(0, count))
      for (const route of pair.routes) {
        const hour = request.dayparts.find((part) => part.id === period.id)!.localHour;
        assessments.set(
          route.id,
          faces.flatMap((face, index) =>
            assessRouteFace(route, face, hour).viewable === true
              ? [{ index, share: assessRouteFace(route, face, hour).eligibleShare ?? 1 }]
              : [],
          ),
        );
      }
  const scenarios = (['lower', 'base', 'higher'] as const).map((id) => {
    const a = request.assumptions;
    const factor = id === 'lower' ? 0.75 : id === 'higher' ? 1.25 : 1;
    return {
      id,
      assumptions: {
        ...a,
        tripsPerPersonPerDay: a.tripsPerPersonPerDay * factor,
        participation: Math.min(
          1,
          a.participation * (id === 'lower' ? 0.8 : id === 'higher' ? 1.15 : 1),
        ),
        recurrence: Math.max(
          0,
          Math.min(1, a.recurrence + (id === 'lower' ? -0.15 : id === 'higher' ? 0.15 : 0)),
        ),
      },
    };
  });
  return scenarios.map((scenario) => {
    const people: ModeledPerson[] = [];
    let population = 0;
    let participatingPopulation = 0;
    for (const zone of evidence.zones) {
      const share = targetShare(zone, request, evidence, scenario.id) ?? 0;
      if (!zone.residents || share <= 0) continue;
      const purposeWeights = stablePurposeWeights(request, evidence);
      for (let cohort = 0; cohort < COHORTS_PER_ZONE; cohort++) {
        const key = `zone:${zone.id}:person:${cohort}`;
        const purpose = cohortPurpose(zone.id, cohort, purposeWeights);
        if (
          request.target.travelPurposes?.length &&
          (!purpose || !request.target.travelPurposes.includes(purpose))
        )
          continue;
        const weight = (zone.residents * share) / COHORTS_PER_ZONE;
        const journeyKey = `${scenario.id}:${key}`;
        const retainedCounts = journeys.get(journeyKey);
        const counts = retainedCounts ?? new Uint32Array(faces.length);
        population += weight;
        // A fixed cohort split represents participation exactly rather than rounding people.
        people.push({
          weight: weight * (1 - scenario.assumptions.participation),
          counts: new Uint32Array(faces.length),
        });
        participatingPopulation += weight * scenario.assumptions.participation;
        const periodCandidates = evidence.periods.map((period) => ({
          period,
          pairs: period.pairs
            .slice(0, count)
            .map((item) => ({
              item,
              weight: item.pair.contributions
                .filter((c) => c.homeZone === zone.id && c.category === purpose)
                .reduce((sum, c) => sum + c.weight, 0),
            }))
            .filter((item) => item.weight > 0),
        }));
        if (!retainedCounts)
          for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
            const day = days[dayIndex];
            const available = periodCandidates.filter((candidate) => {
              const part = request.dayparts.find((part) => part.id === candidate.period.id)!;
              return part.dayType === 'weekend'
                ? day.weekend
                : part.dayType === 'weekday'
                  ? !day.weekend
                  : true;
            });
            const daily =
              scenario.assumptions.tripsPerPersonPerDay *
              (day.weekend ? scenario.assumptions.weekendTripMultiplier : 1);
            const trips =
              Math.floor(daily) + (hash(`${key}:trips:${dayIndex}`) < daily % 1 ? 1 : 0);
            for (let trip = 0; trip < trips; trip++) {
              const recurring =
                hash(`${key}:repeat:${trip}:${dayIndex}`) < scenario.assumptions.recurrence;
              const phase = recurring ? 'fixed' : String(dayIndex);
              const event = `${key}:${trip}:${phase}`;
              const candidate = choose(
                available,
                (item) => item.pairs.reduce((sum, pair) => sum + pair.weight, 0),
                hash(`${event}:time`),
              );
              if (!candidate) continue;
              const picked = choose(candidate.pairs, (item) => item.weight, hash(`${event}:pair`));
              if (!picked) continue;
              const route = choose(
                picked.item.routes,
                (item) => item.share,
                hash(`${event}:route`),
              );
              if (!route) continue;
              // Departures without a routed representative for this local calendar type are not synthesized.
              for (const assessment of assessments.get(route.id) ?? [])
                if (
                  hash(`${key}:${dayIndex}:${trip}:display:${assessment.index}`) < assessment.share
                )
                  counts[assessment.index]++;
            }
          }
        journeys.set(journeyKey, counts);
        people.push({ weight: weight * scenario.assumptions.participation, counts });
      }
    }
    return { ...scenario, people, population, participatingPopulation };
  });
}
function distribution(
  model: ModelPopulation,
  indices: readonly number[],
  threshold: number,
): PlanningStudyAudienceScenario {
  const bins = new Map<number, number>();
  for (const person of model.people) {
    const frequency = indices.reduce((sum, index) => sum + person.counts[index], 0);
    bins.set(frequency, (bins.get(frequency) ?? 0) + person.weight);
  }
  const sorted = [...bins]
    .sort((a, b) => a[0] - b[0])
    .map(([opportunities, people]) => ({ opportunities, people }));
  const modeledOtsImpressions = sorted.reduce(
    (sum, bin) => sum + bin.opportunities * bin.people,
    0,
  );
  const reach1Plus = sorted.reduce(
    (sum, bin) => sum + (bin.opportunities >= 1 ? bin.people : 0),
    0,
  );
  const reachNPlus = sorted.reduce(
    (sum, bin) => sum + (bin.opportunities >= threshold ? bin.people : 0),
    0,
  );
  return {
    id: model.id,
    population: model.population,
    participatingPopulation: model.participatingPopulation,
    modeledOtsImpressions,
    reach1Plus,
    reachNPlus,
    reach1PlusPercent: model.population > 0 ? (100 * reach1Plus) / model.population : null,
    reachNPlusPercent: model.population > 0 ? (100 * reachNPlus) / model.population : null,
    averageOtsFrequency: reach1Plus > 0 ? modeledOtsImpressions / reach1Plus : null,
    distribution: sorted,
    assumptions: model.assumptions,
  };
}
/** Deterministic bounded beam search keeps complementary zero-marginal faces alive for N+ goals. */
export function selectPortfolio(
  people: readonly ModeledPerson[],
  candidates: readonly { index: number; cost: number }[],
  budget: number,
  threshold: number,
): number[] {
  type State = {
    indices: number[];
    cost: number;
    totals: Uint32Array;
    value: number;
    progress: number;
  };
  const active = people.filter(
    (person) => person.weight > 0 && person.counts.some((value) => value > 0),
  );
  const empty: State = {
    indices: [],
    cost: 0,
    totals: new Uint32Array(active.length),
    value: 0,
    progress: 0,
  };
  let beam = [empty];
  let winner = empty;
  const compare = (a: State, b: State) =>
    b.value - a.value ||
    b.progress - a.progress ||
    a.cost - b.cost ||
    a.indices.join(',').localeCompare(b.indices.join(','));
  for (let depth = 0; depth < candidates.length; depth++) {
    const next: State[] = [];
    const seen = new Set<string>();
    for (const state of beam)
      for (const candidate of candidates) {
        if (state.indices.includes(candidate.index) || state.cost + candidate.cost > budget)
          continue;
        const indices = [...state.indices, candidate.index].sort((a, b) => a - b);
        const key = indices.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const totals = new Uint32Array(active.length);
        let value = 0;
        let progress = 0;
        for (let person = 0; person < active.length; person++) {
          const count = state.totals[person] + active[person].counts[candidate.index];
          totals[person] = count;
          if (count >= threshold) value += active[person].weight;
          progress += (active[person].weight * Math.min(count, threshold)) / threshold;
        }
        const added: State = {
          indices,
          cost: state.cost + candidate.cost,
          totals,
          value,
          progress,
        };
        next.push(added);
        if (
          added.value > winner.value ||
          (added.value === winner.value && added.value > 0 && added.cost < winner.cost)
        )
          winner = added;
      }
    if (!next.length) break;
    next.sort(compare);
    beam = next.slice(0, 24);
  }
  // A face mix without any people above the objective threshold is not a recommendation.
  return winner.value > 0 ? winner.indices : [];
}
export function composeStudy(
  studyId: string,
  inputSignature: string,
  request: PlanningStudyRequest,
  faces: PlanningStudyFace[],
  evidence: StudyEvidence,
  retainedRoutes?: PlanningStudyResult['routes'],
): PlanningStudyResult {
  const diagnostics = samplingDiagnostics(request, faces, evidence);
  const used = diagnostics.usedCount;
  evidence.usedCount = used;
  const scored = scorePeriods(faces, evidence, used, request);
  const targeting = targetingEvidence(request, evidence);
  const issues: PlanningStudyResult['issues'] = [];
  for (const face of scored)
    if (face.periods.some((period) => period.viewabilityFit === null))
      issues.push({
        code: 'FACE_VIEWABILITY_UNRESOLVED',
        faceId: face.faceId,
        message: `${face.siteName}, ${face.faceLabel}: viewability is unresolved.`,
        action: face.periods
          .flatMap((period) => period.unavailableReasons)
          .filter((value, index, all) => all.indexOf(value) === index)
          .join(' '),
      });
  if (!diagnostics.stable)
    issues.push({
      code: 'SAMPLE_REFERENCE_SHORTFALL',
      message: diagnostics.reason,
      action: evidence.periods.some((period) => period.pairs.some((pair) => pair.unavailableReason))
        ? 'Resolve the reported routing failures and retry the saved study.'
        : 'Complete missing face inputs or increase the routed reference and rerun the study.',
    });
  for (const reason of targeting.reasons)
    issues.push({
      code: 'TARGET_DATA_MISSING',
      message: reason,
      action:
        'Review the chosen target criteria and add the missing demographic, household or school-location evidence, or revise the target explicitly.',
    });
  const unresolved = evidence.periods.some((period) =>
    period.pairs.slice(0, used).some((pair) => pair.unavailableReason),
  );
  const failures = new Map<string, number>();
  for (const period of evidence.periods)
    for (const pair of period.pairs.slice(0, used))
      if (pair.unavailableReason)
        failures.set(pair.unavailableReason, (failures.get(pair.unavailableReason) ?? 0) + 1);
  for (const [code, count] of failures) {
    const guidance = ROUTING_FAILURE_GUIDANCE[code as TravelDemandRouteFailure] ?? {
      message: 'Route geometry is unavailable.',
      action:
        'Retry the saved study; ask the operator to review provider geometry if this continues.',
    };
    issues.push({
      code: `ROUTING_${code.toUpperCase()}`,
      message: `${guidance.message} ${count} directed-pair departures are unresolved.`,
      action: guidance.action,
    });
  }

  const includedFacePeriods: NonNullable<PlanningStudyResult['audience']['includedFacePeriods']> =
    [];
  const excludedFacePeriods: NonNullable<PlanningStudyResult['audience']['excludedFacePeriods']> =
    [];
  for (const face of scored.filter((face) => face.selected))
    for (const period of face.periods) {
      const routingMissing =
        evidence.periods
          .find((input) => input.id === period.daypartId)
          ?.pairs.slice(0, used)
          .some((pair) => pair.unavailableReason) ?? true;
      const completeInputs = requiredFaceInputs(face);
      const assessable =
        completeInputs &&
        ((period.assessmentCoverage !== null && period.assessmentCoverage > 0) ||
          (period.passingWeight === 0 && !routingMissing));
      const incomplete =
        !completeInputs ||
        routingMissing ||
        (period.passingWeight > 0 && period.assessmentCoverage !== 1);
      if (assessable)
        includedFacePeriods.push({
          faceId: face.faceId,
          daypartId: period.daypartId,
          assessmentCoverage: period.assessmentCoverage,
        });
      if (incomplete)
        excludedFacePeriods.push({
          faceId: face.faceId,
          daypartId: period.daypartId,
          reasons: period.unavailableReasons.length
            ? period.unavailableReasons
            : ['Complete the saved face viewing inputs before this period can contribute.'],
        });
    }
  const hardReasons = [...targeting.reasons];
  if (!evidence.periods.length || !evidence.zones.length)
    hardReasons.push('Usable production roads, destinations and population are required.');
  const partial = excludedFacePeriods.length > 0 || unresolved;
  const audienceReasons = [
    ...hardReasons,
    ...(partial
      ? [
          'This is a conservative subtotal from assessed face/period opportunities. Unknown opportunities are omitted; population and trip-choice weights are unchanged.',
        ]
      : []),
  ];
  const journeys = new Map<string, Uint32Array>();
  const models = hardReasons.length
    ? []
    : populationModel(request, evidence, scored, used, journeys);
  const indices = scored.flatMap((face, index) => (face.selected ? [index] : []));
  const usable = indices.length === 0 || includedFacePeriods.length > 0;
  if (!usable)
    audienceReasons.push(
      'No selected face/period has assessable opportunities. Complete the reported viewing or routing inputs.',
    );
  const scenarios = usable
    ? models.map((model) => distribution(model, indices, request.minimumOpportunities))
    : [];
  const secondaryRequest = request.secondaryTarget
    ? { ...request, target: request.secondaryTarget }
    : null;
  const secondaryTargeting = secondaryRequest
    ? targetingEvidence(secondaryRequest, evidence)
    : null;
  const secondaryModels =
    secondaryRequest &&
    secondaryTargeting?.status === 'supported' &&
    evidence.periods.length &&
    evidence.zones.length
      ? populationModel(secondaryRequest, evidence, scored, used, journeys)
      : [];
  const secondaryScenarios = usable
    ? secondaryModels.map((model) => distribution(model, indices, request.minimumOpportunities))
    : [];
  const composite: PlanningStudyResult['composite'] = {
    status: 'unavailable',
    objective: request.objective,
    selectedFaceIds: [],
    totalCost: 0,
    currency: request.budget.currency,
    remainingBudget: request.budget.amount,
    objectivePeople: 0,
    rows: [],
    excluded: [],
  };
  const base = models.find((model) => model.id === 'base');
  const eligible = scored.flatMap((face, index) => {
    const missing =
      !requiredFaceInputs(face) ||
      face.periods.some((period) => period.viewabilityFit === null && period.passingWeight > 0);
    if (!face.commerciallyEligible || face.flightCost === null || missing) {
      composite.excluded.push({
        faceId: face.faceId,
        reason: missing
          ? 'Complete viewability before the face can enter the recommendation.'
          : (face.commercialReason ?? 'Comparable flight cost and availability are required.'),
      });
      return [];
    }
    return [{ face, index }];
  });
  if (base) {
    const threshold = request.objective === 'reach' ? 1 : request.minimumOpportunities;
    const chosen = selectPortfolio(
      base.people,
      eligible.map((row) => ({ index: row.index, cost: row.face.flightCost! })),
      request.budget.amount,
      threshold,
    );
    let previous = 0;
    const prefix: number[] = [];
    for (const index of chosen) {
      const face = scored[index];
      prefix.push(index);
      const stats = distribution(base, prefix, threshold);
      const value = threshold === 1 ? stats.reach1Plus : stats.reachNPlus;
      const gain = value - previous;
      previous = value;
      composite.selectedFaceIds.push(face.faceId);
      composite.totalCost += face.flightCost!;
      composite.rows.push({
        faceId: face.faceId,
        order: prefix.length,
        flightCost: face.flightCost!,
        incrementalPeople: gain,
        totalObjectivePeople: value,
        reason:
          request.objective === 'reach'
            ? `Adds ${Math.round(gain).toLocaleString('en')} modeled people with at least one OTS after overlap.`
            : gain > 0
              ? `Moves ${Math.round(gain).toLocaleString('en')} modeled people to ${threshold}+ OTS after overlap.`
              : `Contributes repeat opportunities to the recommended mix; the combined faces move ${Math.round(distribution(base, chosen, threshold).reachNPlus).toLocaleString('en')} modeled people to ${threshold}+ OTS.`,
      });
    }
    composite.objectivePeople = previous;
    composite.remainingBudget = request.budget.amount - composite.totalCost;
    composite.status = composite.excluded.length ? 'partial' : 'ready';
    for (const row of eligible)
      if (!chosen.includes(row.index))
        composite.excluded.push({
          faceId: row.face.faceId,
          reason:
            row.face.flightCost! > composite.remainingBudget
              ? 'The remaining budget cannot cover this face.'
              : 'This face was not selected by the bounded objective-specific portfolio search after overlap.',
        });
  }
  const retainedPoints = new Map(retainedRoutes?.map((route) => [route.id, route.points]));
  const routes: PlanningStudyResult['routes'] = evidence.periods.flatMap((period) =>
    period.pairs.slice(0, used).flatMap((pair) =>
      pair.routes.map((route) => ({
        id: route.id,
        pairId: pair.pair.id,
        daypartId: period.id,
        points: retainedPoints.get(route.id) ?? displayRoute(route.points),
        pairShare: route.share,
        demandWeight: pair.pair.demandWeight * route.share,
        faceIds: scored
          .filter(
            (face) =>
              assessRouteFace(
                route,
                face,
                request.dayparts.find((part) => part.id === period.id)!.localHour,
              ).viewable === true,
          )
          .map((face) => face.faceId),
        durationSeconds: route.durationSeconds,
        distanceMetres: route.distanceMetres,
        durationEvidence: route.evidence,
      })),
    ),
  );
  const residents = evidence.zones.reduce((sum, zone) => sum + (zone.residents ?? 0), 0);
  const first = evidence.periods[0]?.pairs.slice(0, used) ?? [];
  return {
    version: 'integrated-planning-v1',
    studyId,
    status:
      !evidence.zones.length || !evidence.periods.length
        ? 'unavailable'
        : issues.length || unresolved
          ? 'partial'
          : 'ready',
    generatedAt: new Date().toISOString(),
    inputSignature,
    countryCode: request.countryCode,
    flight: request.flight,
    timeZone: request.timeZone,
    objective: request.objective,
    minimumOpportunities: request.minimumOpportunities,
    target: request.target,
    ...(request.planning ? { planning: request.planning } : {}),
    targeting,
    population: {
      residents: residents || null,
      coverage: evidence.zones.length ? evidence.populationCoverage : null,
      geographicBasis: `Public resident population in the 5 × 5 zone catchment extending ${((request.radiusKm * 5) / 3).toFixed(2)} km in each direction from the study center; inner 3 × 3 zones define local trips.`,
      modeledPeople: base?.people.filter((person) => person.weight > 0).length ?? 0,
      calibration: 'uncalibrated',
    },
    sources: [
      ...new Map(
        [...evidence.sources, ...targeting.sources, ...(secondaryTargeting?.sources ?? [])].map(
          (source) => [`${source.sourceKey}:${source.version}`, source],
        ),
      ).values(),
    ],
    zones: evidence.zones.map((zone) => ({ ...zone, insideStudyArea: insideStudyZone(zone.id) })),
    sampling: {
      mode: request.sampling.mode,
      usedDirectedPairs: used,
      referenceDirectedPairs: diagnostics.referenceCount,
      recommendedDirectedPairs: diagnostics.recommendation,
      generatedDirectedPairs: evidence.generatedPairCount,
      localDirectedPairs: first.filter(
        (item) =>
          insideStudyZone(item.pair.originZone) && insideStudyZone(item.pair.destinationZone),
      ).length,
      throughDirectedPairs: first.filter(
        (item) =>
          !insideStudyZone(item.pair.originZone) || !insideStudyZone(item.pair.destinationZone),
      ).length,
      maximumDifferencePp: diagnostics.maximumDifferencePp,
      minimumPassingWeightCoverage: diagnostics.minimumPassingWeightCoverage,
      stable: diagnostics.stable,
      reason: diagnostics.reason,
      checks: diagnostics.checks,
      periods: evidence.periods.map((period) => {
        const chosen = period.pairs.slice(0, used);
        const total = chosen.reduce((sum, item) => sum + item.pair.demandWeight, 0);
        return {
          daypartId: period.id,
          candidateRoutes: chosen.reduce((sum, item) => sum + item.routes.length, 0),
          routedPairs: chosen.filter((item) => item.routes.length > 0).length,
          unresolvedDemandShare: total
            ? chosen
                .filter((item) => !item.routes.length)
                .reduce((sum, item) => sum + item.pair.demandWeight, 0) / total
            : 0,
          selectedDemandShare: period.generatedWeight ? total / period.generatedWeight : 0,
        };
      }),
    },
    benchmarks: {
      method:
        'Percentiles use only matched positive-weight approaches from fixed public zone-road cross-sections in both directions, on the same routed pairs and demand-weight scale as the board.',
      approaches: (evidence.benchmarkApproaches ?? []).flatMap((approach, index) =>
        (['forward', 'reverse'] as const).map((direction) => ({
          ...approach,
          id: `zone-road-${index + 1}-${direction}`,
          direction,
          source: approach.source ?? 'Imported production OpenStreetMap road geometry.',
        })),
      ),
      periods: evidence.periods.map((period) => {
        const weights = benchmarkWeights(period, evidence, used);
        return {
          daypartId: period.id,
          approachCount: weights.length,
          matchedApproachCount: weights.filter((weight) => weight > 0).length,
        };
      }),
    },
    faces: scored,
    routes,
    audience: {
      status: scenarios.length ? (partial ? 'partial' : 'ready') : 'unavailable',
      includedFacePeriods,
      excludedFacePeriods,
      ...(partial
        ? {
            coverageBasis:
              'Assessed opportunities only; this subtotal is not a complete flight reach estimate. Unknown opportunities are omitted without renormalizing people or journeys.',
          }
        : {}),
      basis: 'modeled_ots',
      minimumOpportunities: request.minimumOpportunities,
      scenarios,
      reasons: audienceReasons,
      assumptions: [
        'Face time, speed and visible distance are demand-weighted means for the approach direction, including known zeroes. Daylight is assumed from 06:00 to 18:00 local time; night eligibility uses recorded lighting facts.',
        `${COHORTS_PER_ZONE} fixed weighted traveler cohorts per populated zone; purpose identities use complete generated trip demand before route sampling. The same people, home zones, modeled purposes, journeys and route-choice seeds are retained across face selections.`,
        `Person-trip scale uses explicit participation and daily trip assumptions, independent of relative ADTM route weights. Uncalibrated estimates are sensitive to these assumptions.`,
        `Lower/base/higher scenarios vary daily trips (75%/100%/125%), participation (80%/100%/115%, capped at 100%) and recurring journey share (−15/base/+15 percentage points).`,
        `Selected OD pairs define modeled itinerary choices within each home-zone and travel-purpose group; unrepresented groups contribute no modeled opportunities. Routed demand coverage is reported separately.`,
        `Digital allocation is a planned advertiser schedule, with evenly spaced plays and a uniform arrival phase per journey. A play qualifies only when one continuous ad-visible overlap meets the face minimum viewing time. Screen capacity does not imply a purchased allocation or delivered play.`,
        `Each trip uses one requested local daypart, with weekday/weekend calendar matching and face display and illumination schedules. A journey crossing multiple faces contributes one OTS per qualifying face; person reach is deduplicated across the flight.`,
        `Local segment speeds and times are Mapbox routing estimates, not observed traffic counts or evidence of attention. OTS is distinct from LTS and audience measurement.`,
        `Face recommendations use a deterministic budget-constrained beam search (24 retained mixes per size), evaluating shared-person threshold counts; the result is a planning recommendation, not a proof of global optimality.`,
      ],
    },
    ...(secondaryRequest && secondaryTargeting
      ? {
          secondary: {
            target: secondaryRequest.target,
            targeting: secondaryTargeting,
            audience: {
              status: secondaryScenarios.length
                ? partial
                  ? ('partial' as const)
                  : ('ready' as const)
                : ('unavailable' as const),
              includedFacePeriods,
              excludedFacePeriods,
              basis: 'modeled_ots' as const,
              minimumOpportunities: request.minimumOpportunities,
              scenarios: secondaryScenarios,
              reasons: [
                ...secondaryTargeting.reasons,
                ...(!usable
                  ? ['Complete the selected faces viewing inputs before estimating exposure.']
                  : []),
                ...(partial
                  ? ['Assessed opportunities only; unknown opportunities are omitted.']
                  : []),
              ],
              assumptions: [
                'Secondary audience is evaluated separately on the same fixed people and journeys. Primary and secondary audiences may overlap; their totals are not added.',
              ],
            },
          },
        }
      : {}),
    composite,
    issues,
    warnings: evidence.warnings,
  };
}

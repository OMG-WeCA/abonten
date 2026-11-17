import { normalizePlanningTarget } from './planning-journey';
import type { PlanningModelControls } from '@abonten/contracts/planning-draft';

// Pure reader shared by browser recovery and server draft admission.
const invalid = () => new Error('Invalid planning model controls.');
const isUUID = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !keys.includes(key))) throw invalid();
  return result;
}

export function normalizePlanningModelControls(value: unknown): PlanningModelControls {
  const input = object(value, [
    'version',
    'center',
    'radiusKm',
    'daypart',
    'sampling',
    'target',
    'secondaryTarget',
    'assumptions',
    'studyId',
    'digitalAllocations',
  ]);
  const number = (value: unknown, low: number, high: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
      throw invalid();
    return value;
  };
  if (input.version !== 1) throw invalid();
  if (
    input.daypart !== undefined &&
    (typeof input.daypart !== 'string' ||
      !/^(weekday|weekend)_(morning|afternoon|evening|night)$/.test(input.daypart))
  )
    throw invalid();
  const sampling = object(input.sampling, ['mode', 'directedPairs', 'referencePairs']);
  if (sampling.mode !== 'recommended' && sampling.mode !== 'custom') throw invalid();
  const count = (value: unknown) => {
    const result = number(value, 2, 200);
    if (!Number.isInteger(result) || result % 2 !== 0) throw invalid();
    return result;
  };
  const target = normalizePlanningTarget(input.target);
  let center: PlanningModelControls['center'];
  if (input.center !== undefined) {
    const point = object(input.center, ['latitude', 'longitude']);
    center = {
      latitude: number(point.latitude, -90, 90),
      longitude: number(point.longitude, -180, 180),
    };
  }
  if (input.studyId !== undefined && (typeof input.studyId !== 'string' || !isUUID(input.studyId)))
    throw invalid();
  let digitalAllocations: PlanningModelControls['digitalAllocations'];
  if (input.digitalAllocations !== undefined) {
    if (!Array.isArray(input.digitalAllocations) || input.digitalAllocations.length > 100)
      throw invalid();
    digitalAllocations = input.digitalAllocations.map((value) => {
      const row = object(value, ['faceId', 'advertiserSpotsPerLoop']);
      if (typeof row.faceId !== 'string' || !isUUID(row.faceId)) throw invalid();
      const advertiserSpotsPerLoop = number(row.advertiserSpotsPerLoop, 1, 1000);
      if (!Number.isInteger(advertiserSpotsPerLoop)) throw invalid();
      return { faceId: row.faceId.toLowerCase(), advertiserSpotsPerLoop };
    });
  }
  return {
    version: 1,
    ...(digitalAllocations ? { digitalAllocations } : {}),
    ...(center ? { center } : {}),
    radiusKm: number(input.radiusKm, 0.5, 10),
    ...(input.daypart ? { daypart: input.daypart as PlanningModelControls['daypart'] } : {}),
    sampling: {
      mode: sampling.mode,
      ...(sampling.directedPairs !== undefined
        ? { directedPairs: count(sampling.directedPairs) }
        : {}),
      ...(sampling.referencePairs !== undefined
        ? { referencePairs: count(sampling.referencePairs) }
        : {}),
    },
    target,
    ...(input.secondaryTarget !== undefined
      ? { secondaryTarget: normalizePlanningTarget(input.secondaryTarget) }
      : {}),
    ...(typeof input.studyId === 'string' ? { studyId: input.studyId } : {}),
  };
}

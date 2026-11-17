import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type {
  PlanningStudyEvaluateRequest,
  PlanningStudyRequest,
} from '@abonten/contracts/planning-study';
import { findMarket } from '../common/supported-markets';
import { normalizePlanningJourney, normalizePlanningTarget } from './planning-journey';
import { PLANNING_BASELINE } from './planning-calibration';
import { planningDays, PLANNING_CURRENCIES } from './planning-math';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Provide structured planning study controls.');
  return value as Record<string, unknown>;
}
function number(
  value: unknown,
  minimum: number,
  maximum: number,
  name: string,
  integer = false,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum ||
    (integer && !Number.isInteger(value))
  )
    throw new BadRequestException(`Provide a valid ${name} (${minimum}–${maximum}).`);
  return value;
}
function ids(value: unknown, name: string, max = 100): string[] {
  if (
    !Array.isArray(value) ||
    value.length > max ||
    value.some((id) => typeof id !== 'string' || !isUUID(id)) ||
    new Set(value).size !== value.length
  )
    throw new BadRequestException(`Provide up to ${max} distinct ${name}.`);
  return value.map((id) => (id as string).toLowerCase());
}
function faces(value: unknown, allowEmpty = false) {
  if (!Array.isArray(value) || (!allowEmpty && !value.length) || value.length > 100)
    throw new BadRequestException('Choose 1–100 candidate faces.');
  const result = value.map((item) => {
    const face = object(item);
    if (!isUUID(face.siteId) || !isUUID(face.faceId))
      throw new BadRequestException('Choose valid inventory face references.');
    return {
      siteId: (face.siteId as string).toLowerCase(),
      faceId: (face.faceId as string).toLowerCase(),
    };
  });
  if (new Set(result.map((face) => face.faceId)).size !== result.length)
    throw new BadRequestException('Choose distinct candidate faces.');
  return result;
}
function budget(value: unknown) {
  const row = object(value);
  if (!PLANNING_CURRENCIES.includes(row.currency as (typeof PLANNING_CURRENCIES)[number]))
    throw new BadRequestException('Choose a supported budget currency.');
  if (typeof row.amount === 'number' && row.amount <= 0)
    throw new BadRequestException('Provide a positive campaign budget.');
  return { amount: number(row.amount, 0, 1e12, 'budget'), currency: row.currency as string };
}
function digitalAllocations(value: unknown) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100)
    throw new BadRequestException('Provide up to 100 planned digital face allocations.');
  const rows = value.map((item) => {
    const row = object(item);
    if (!isUUID(row.faceId)) throw new BadRequestException('Choose a valid digital face.');
    return {
      faceId: (row.faceId as string).toLowerCase(),
      advertiserSpotsPerLoop: number(
        row.advertiserSpotsPerLoop,
        0,
        10000,
        'planned advertiser plays per loop',
        true,
      ),
    };
  });
  if (new Set(rows.map((row) => row.faceId)).size !== rows.length)
    throw new BadRequestException('Set one planned allocation per digital face.');
  return rows;
}
export function normalizeStudy(
  value: unknown,
  options: { readinessOnly?: boolean } = {},
): PlanningStudyRequest {
  const supplied = object(value);
  let journey;
  try {
    journey =
      supplied.planning === undefined ? undefined : normalizePlanningJourney(supplied.planning);
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Provide valid planning decisions.',
    );
  }
  const strategy = journey?.strategy;
  // Applied strategy decisions are the same controls used by ADTM, AAM and Composite.
  const row: Record<string, unknown> = {
    ...supplied,
    ...(strategy?.geography
      ? { center: strategy.geography.center, radiusKm: strategy.geography.radiusKm }
      : {}),
    ...(strategy?.dayparts ? { dayparts: strategy.dayparts } : {}),
    ...(strategy?.objective ? { objective: strategy.objective } : {}),
    ...(strategy?.minimumOpportunities !== undefined
      ? { minimumOpportunities: strategy.minimumOpportunities }
      : {}),
  };
  const center = object(row.center);
  const flight = object(row.flight);
  const country = findMarket(typeof row.countryCode === 'string' ? row.countryCode : '');
  if (!country || row.timeZone !== country.timezone)
    throw new BadRequestException('Choose a supported market and its local time zone.');
  if (
    typeof flight.startDate !== 'string' ||
    typeof flight.endDate !== 'string' ||
    !planningDays(flight as unknown as { startDate: string; endDate: string }) ||
    planningDays(flight as unknown as { startDate: string; endDate: string })! > 366
  )
    throw new BadRequestException(
      'Choose a valid flight of 1–366 local calendar days, with an exclusive end date.',
    );
  if (row.objective !== 'reach' && row.objective !== 'frequency')
    throw new BadRequestException('Choose a reach or frequency objective.');
  if (!options.readinessOnly && row.confirmPublicRoadTransfer !== true)
    throw new BadRequestException(
      'Confirm transfer of public road points and departure times to Mapbox.',
    );
  const candidates = faces(row.faces ?? [], options.readinessOnly);
  const selected =
    row.selectedFaceIds === undefined
      ? candidates.map((face) => face.faceId)
      : ids(row.selectedFaceIds, 'selected face IDs');
  if (selected.some((id) => !candidates.some((face) => face.faceId === id)))
    throw new BadRequestException('Selected faces must belong to the authorized study candidates.');
  if (!Array.isArray(row.dayparts) || !row.dayparts.length || row.dayparts.length > 8)
    throw new BadRequestException('Choose 1–8 local dayparts.');
  const dayparts = row.dayparts.map((item) => {
    const part = object(item);
    if (
      typeof part.id !== 'string' ||
      !/^[a-z0-9_-]{1,40}$/i.test(part.id) ||
      typeof part.label !== 'string' ||
      !part.label.trim() ||
      part.label.length > 80 ||
      (part.dayType !== undefined &&
        !['weekday', 'weekend', 'all'].includes(part.dayType as string))
    )
      throw new BadRequestException('Provide distinct named dayparts and a valid calendar type.');
    return {
      id: part.id,
      label: part.label,
      localHour: number(part.localHour, 0, 23, 'local hour', true),
      dayType: (part.dayType ?? 'all') as 'all' | 'weekday' | 'weekend',
    };
  });
  if (new Set(dayparts.map((part) => part.id)).size !== dayparts.length)
    throw new BadRequestException('Daypart IDs must be distinct.');
  const sample = object(row.sampling ?? { mode: 'recommended' });
  if (sample.mode !== 'recommended' && sample.mode !== 'custom')
    throw new BadRequestException('Choose Recommended or Custom route sampling.');
  const referencePairs = number(
    sample.referencePairs ?? 72,
    2,
    200,
    'reference directed pairs',
    true,
  );
  const directedPairs = number(
    sample.directedPairs ?? Math.min(34, referencePairs),
    2,
    200,
    'directed pairs',
    true,
  );
  if (
    directedPairs % 2 ||
    referencePairs % 2 ||
    (sample.mode === 'custom' && directedPairs > referencePairs)
  )
    throw new BadRequestException(
      'Use even directed pair budgets; the reference must cover the custom sample.',
    );
  // Customer requests use the versioned internal calibration; saved old controls do not override it.
  let target;
  let secondaryTarget;
  let planning;
  try {
    planning = journey;
    target = normalizePlanningTarget(row.target ?? planning?.targetGroup.criteria ?? {});
    secondaryTarget =
      row.secondaryTarget !== undefined || planning?.secondaryTargetGroup
        ? normalizePlanningTarget(row.secondaryTarget ?? planning?.secondaryTargetGroup?.criteria)
        : undefined;
    for (const criteria of [target]) {
      const parent = criteria?.household?.parentsOfSchoolChildren;
      if (parent && (parent.childAgeMin === undefined || parent.childAgeMax === undefined))
        throw new Error('Choose the schoolchild age range before building the plan.');
    }
    if (
      planning?.secondaryTargetGroup &&
      JSON.stringify(planning.secondaryTargetGroup.criteria) !== JSON.stringify(secondaryTarget)
    )
      throw new Error('The chosen secondary audience and study target must agree.');
    if (
      planning &&
      JSON.stringify(normalizePlanningTarget(planning.targetGroup.criteria)) !==
        JSON.stringify(target)
    )
      throw new Error('The chosen target group and study target must agree.');
  } catch (error) {
    throw new BadRequestException(
      error instanceof Error ? error.message : 'Provide valid planning decisions.',
    );
  }
  return {
    countryCode: country.code,
    center: {
      longitude: number(center.longitude, -180, 180, 'longitude'),
      latitude: number(center.latitude, -85, 85, 'latitude'),
    },
    radiusKm: number(row.radiusKm, 0.5, 10, 'study radius'),
    timeZone: country.timezone,
    flight: { startDate: flight.startDate, endDate: flight.endDate },
    budget: budget(row.budget),
    objective: row.objective,
    minimumOpportunities: number(
      row.minimumOpportunities,
      1,
      Number.MAX_SAFE_INTEGER,
      'minimum opportunities',
      true,
    ),
    faces: candidates,
    selectedFaceIds: selected,
    dayparts,
    sampling: { mode: sample.mode, directedPairs, referencePairs },
    target,
    ...(secondaryTarget ? { secondaryTarget } : {}),
    ...(planning ? { planning } : {}),
    assumptions: { ...PLANNING_BASELINE },
    digitalAllocations: digitalAllocations(row.digitalAllocations),
    confirmPublicRoadTransfer: true,
  };
}
export function normalizeStudyEvaluation(value: unknown): PlanningStudyEvaluateRequest {
  const row = object(value);
  if (row.objective !== undefined && row.objective !== 'reach' && row.objective !== 'frequency')
    throw new BadRequestException('Choose a reach or frequency objective.');
  return {
    faceIds: ids(row.faceIds, 'selected face IDs'),
    ...(row.digitalAllocations !== undefined
      ? { digitalAllocations: digitalAllocations(row.digitalAllocations) }
      : {}),
    minimumOpportunities: number(
      row.minimumOpportunities,
      1,
      Number.MAX_SAFE_INTEGER,
      'minimum opportunities',
      true,
    ),
    ...(row.faces !== undefined ? { faces: faces(row.faces) } : {}),
    ...(row.objective ? { objective: row.objective as 'reach' | 'frequency' } : {}),
    ...(row.budget ? { budget: budget(row.budget) } : {}),
  };
}

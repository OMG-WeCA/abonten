import type {
  PlanningJourneyContext,
  PlanningStudyTarget,
} from '@abonten/contracts/planning-study';

/** Native public demographic bins shared by API admission and AI output contracts. */
export const PARENT_EXCLUSION_REQUIREMENT = 'People who are not parents (parents excluded).';
export const PLANNING_SEC_GROUPS = ['A', 'B', 'C1', 'C2', 'D', 'E'] as const;
export const PLANNING_AGE_BANDS: readonly string[] = Array.from(
  { length: 16 },
  (_, index) => `${index * 5}_${index * 5 + 4}`,
).concat('80_plus');

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Provide structured planning decisions.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !keys.includes(key)))
    throw new Error('Unsupported planning decision field.');
  return row;
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0'))
    throw new Error('Provide valid planning text.');
  return value.trim();
}
function strings(value: unknown, maximum: number, count: number): string[] {
  if (!Array.isArray(value) || value.length > count)
    throw new Error('Provide a bounded list of target criteria.');
  return [...new Set(value.map((item) => text(item, maximum)))].sort();
}
export function normalizePlanningTarget(value: unknown): PlanningStudyTarget {
  const row = object(value, [
    'locations',
    'travelPurposes',
    'ageBands',
    'sex',
    'household',
    'sec',
    'unsupportedCriteria',
  ]);
  const result: PlanningStudyTarget = {};
  if (row.locations !== undefined) {
    if (
      !Array.isArray(row.locations) ||
      row.locations.length > 25 ||
      row.locations.some((v) => !Number.isInteger(v) || v < 1 || v > 25)
    )
      throw new Error('Choose valid study resident zones.');
    result.locations = [...new Set(row.locations as number[])].sort((a, b) => a - b);
  }
  if (row.travelPurposes !== undefined) {
    result.travelPurposes = strings(row.travelPurposes, 80, 9);
    if (
      result.travelPurposes.some(
        (v) =>
          ![
            'business',
            'education',
            'shopping',
            'food_and_drink',
            'healthcare',
            'transport',
            'leisure',
            'tourism',
            'religious',
          ].includes(v),
      )
    )
      throw new Error('Choose supported modeled travel-purpose groups.');
  }
  if (row.ageBands !== undefined) {
    result.ageBands = strings(row.ageBands, 20, 18);
    if (result.ageBands.some((v) => !PLANNING_AGE_BANDS.includes(v)))
      throw new Error('Choose supported public-data age bands.');
  }
  if (row.sex !== undefined) {
    if (row.sex !== 'female' && row.sex !== 'male')
      throw new Error('Choose a supported sex category.');
    result.sex = row.sex;
  }
  if (row.sec !== undefined) {
    const sec = object(row.sec, ['groups']);
    const groups = strings(sec.groups, 2, 6);
    if (
      groups.some(
        (group) => !PLANNING_SEC_GROUPS.includes(group as (typeof PLANNING_SEC_GROUPS)[number]),
      )
    )
      throw new Error('Choose supported SEC groups.');
    result.sec = { groups: groups as (typeof PLANNING_SEC_GROUPS)[number][] };
  }
  if (row.unsupportedCriteria !== undefined)
    result.unsupportedCriteria = strings(row.unsupportedCriteria, 240, 12).filter(Boolean);
  if (row.household !== undefined) {
    const household = object(row.household, ['parentsOfSchoolChildren', 'economicDescription']);
    result.household = {};
    if (household.parentsOfSchoolChildren !== undefined) {
      const parent = object(household.parentsOfSchoolChildren, [
        'childAgeMin',
        'childAgeMax',
        'schoolLocation',
      ]);
      if (
        (parent.childAgeMin !== undefined &&
          (!Number.isInteger(parent.childAgeMin) ||
            Number(parent.childAgeMin) < 0 ||
            Number(parent.childAgeMin) > 24)) ||
        (parent.childAgeMax !== undefined &&
          (!Number.isInteger(parent.childAgeMax) ||
            Number(parent.childAgeMax) < 0 ||
            Number(parent.childAgeMax) > 24)) ||
        (parent.childAgeMin !== undefined &&
          parent.childAgeMax !== undefined &&
          Number(parent.childAgeMin) > Number(parent.childAgeMax))
      )
        throw new Error('Choose an inclusive child age range from 0 to 24.');
      result.household.parentsOfSchoolChildren = {
        ...(parent.childAgeMin !== undefined ? { childAgeMin: Number(parent.childAgeMin) } : {}),
        ...(parent.childAgeMax !== undefined ? { childAgeMax: Number(parent.childAgeMax) } : {}),
        ...(parent.schoolLocation !== undefined
          ? {
              schoolLocation: (() => {
                const location = object(parent.schoolLocation, ['scope', 'label']);
                if (location.scope !== 'study_area')
                  throw new Error('Choose schools in the selected study area.');
                return {
                  scope: 'study_area' as const,
                  ...(location.label !== undefined ? { label: text(location.label, 240) } : {}),
                };
              })(),
            }
          : {}),
      };
    }
    if (household.economicDescription !== undefined)
      result.household.economicDescription = text(household.economicDescription, 500);
  }
  return result;
}
export function normalizePlanningJourney(value: unknown): PlanningJourneyContext {
  const row = object(value, [
    'version',
    'brief',
    'targetGroup',
    'secondaryTargetGroup',
    'strategy',
    'origin',
  ]);
  if (row.version !== 1 || !['manual', 'ai'].includes(String(row.origin)))
    throw new Error('Provide versioned planning decisions.');
  const brief = object(row.brief, ['summary', 'offer']);
  const target = object(row.targetGroup, ['description', 'rationale', 'criteria']);
  const strategy = object(row.strategy, [
    'summary',
    'rationale',
    'geography',
    'dayparts',
    'objective',
    'minimumOpportunities',
  ]);
  const number = (value: unknown, low: number, high: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high)
      throw new Error('Provide valid strategy decisions.');
    return value;
  };
  let geography: PlanningJourneyContext['strategy']['geography'];
  if (strategy.geography !== undefined) {
    const area = object(strategy.geography, ['center', 'radiusKm']);
    const center = object(area.center, ['longitude', 'latitude']);
    geography = {
      center: {
        longitude: number(center.longitude, -180, 180),
        latitude: number(center.latitude, -85, 85),
      },
      radiusKm: number(area.radiusKm, 0.5, 10),
    };
  }
  let dayparts: PlanningJourneyContext['strategy']['dayparts'];
  if (strategy.dayparts !== undefined) {
    if (
      !Array.isArray(strategy.dayparts) ||
      !strategy.dayparts.length ||
      strategy.dayparts.length > 8
    )
      throw new Error('Choose 1–8 strategy dayparts.');
    dayparts = strategy.dayparts.map((value) => {
      const row = object(value, ['id', 'label', 'localHour', 'dayType']);
      const localHour = number(row.localHour, 0, 23);
      if (
        !Number.isInteger(localHour) ||
        !/^[a-z0-9_-]{1,40}$/i.test(String(row.id)) ||
        (row.dayType !== undefined && !['all', 'weekday', 'weekend'].includes(String(row.dayType)))
      )
        throw new Error('Choose valid strategy dayparts.');
      return {
        id: text(row.id, 40),
        label: text(row.label, 80),
        localHour,
        ...(row.dayType ? { dayType: row.dayType as 'all' | 'weekday' | 'weekend' } : {}),
      };
    });
    if (new Set(dayparts.map((row) => row.id)).size !== dayparts.length)
      throw new Error('Choose distinct strategy dayparts.');
  }
  if (
    strategy.objective !== undefined &&
    !['reach', 'frequency'].includes(String(strategy.objective))
  )
    throw new Error('Choose a strategy objective.');
  const minimumOpportunities =
    strategy.minimumOpportunities === undefined
      ? undefined
      : number(strategy.minimumOpportunities, 1, Number.MAX_SAFE_INTEGER);
  if (minimumOpportunities !== undefined && !Number.isInteger(minimumOpportunities))
    throw new Error('Choose a whole-number frequency threshold.');
  return {
    version: 1,
    brief: {
      summary: text(brief.summary, 8002),
      ...(brief.offer !== undefined ? { offer: text(brief.offer, 2000) } : {}),
    },
    targetGroup: {
      description: text(target.description, 1000),
      rationale: text(target.rationale, 2000),
      criteria: normalizePlanningTarget(target.criteria),
    },
    ...(row.secondaryTargetGroup !== undefined
      ? {
          secondaryTargetGroup: (() => {
            const secondary = object(row.secondaryTargetGroup, [
              'description',
              'rationale',
              'criteria',
            ]);
            return {
              description: text(secondary.description, 1000),
              rationale: text(secondary.rationale, 2000),
              criteria: normalizePlanningTarget(secondary.criteria),
            };
          })(),
        }
      : {}),
    strategy: {
      summary: text(strategy.summary, 2000),
      rationale: text(strategy.rationale, 2000),
      ...(geography ? { geography } : {}),
      ...(dayparts ? { dayparts } : {}),
      ...(strategy.objective ? { objective: strategy.objective as 'reach' | 'frequency' } : {}),
      ...(minimumOpportunities !== undefined ? { minimumOpportunities } : {}),
    },
    origin: row.origin as 'manual' | 'ai',
  };
}

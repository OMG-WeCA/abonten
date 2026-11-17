import type { PlanningStudySource } from '@abonten/contracts/planning-study';
import {
  householdAudienceReference,
  HOUSEHOLD_AUDIENCE_REFERENCE_VERSION,
  type HouseholdAudienceReference,
} from './household-audience-reference';

export { HOUSEHOLD_AUDIENCE_REFERENCE_VERSION } from './household-audience-reference';

export interface HouseholdSchoolGeography {
  homeZoneId: number;
  zones: {
    id: number;
    longitude: number;
    latitude: number;
    schoolCount: number;
    /** School point itself is in the selected footprint, independent of home zone. */
    selectedSchoolCount: number;
  }[];
  cellWidthMetres: number;
  source: PlanningStudySource;
}
export interface HouseholdAudienceInput {
  countryCode: string;
  ageSexPopulation: { ageBand: string; sex: 'female' | 'male'; residents: number }[];
  parent: {
    childAgeMin: number;
    childAgeMax: number;
    schoolLocation?: { scope: 'study_area'; label?: string };
  };
  economicDescription?: string;
  selectedAgeBands?: string[];
  selectedSex?: 'female' | 'male';
  schoolGeography?: HouseholdSchoolGeography;
}
export interface HouseholdAudienceResult {
  status: 'supported' | 'unavailable';
  share: number | null;
  lowerShare: number | null;
  higherShare: number | null;
  probabilities: {
    ageBand: string;
    sex: 'female' | 'male';
    probability: number;
    lowerProbability: number;
    higherProbability: number;
  }[];
  sources: PlanningStudySource[];
  reasons: string[];
  limitations: string[];
  method: string;
  referenceVersion: string;
  geographicGrain: string | null;
  schoolCoverage?: {
    mappedSchools: number;
    selectedMappedSchools: number;
    modeledDestinationCoverage: number;
  };
}

const METHOD =
  'Child-parent links from published living-arrangement and school-participation marginals are combined using an internal maximum-entropy association; Fréchet bounds vary that unknown association. Ages are uniform within five-year raster bands. Links are allocated over the fixed adult age/sex population using a stationary contemporary maternal-fertility age profile as a historical proxy, with father-age offsets of 3/5/8 years. A gamma–Poisson sibling model (dispersion k=0.5/1/2 for lower/base/higher) converts expected child links to the probability of at least one enrolled child, counting each adult once. The range is a structural sensitivity envelope, not a statistical confidence interval.';
const SCHOOL_METHOD =
  'School travel uses 4/8/12 km/h scenarios and 1.3 circuity, with 128 fixed polar samples in each published duration band. Mapped school density determines destinations inside the imported grid; selected counts use the school point itself. Boarding, 61+ minutes, outside-grid and empty travel bands retain unknown destinations. Base uses the 8 km/h known subtotal; bounds span speed scenarios and unknown destinations, without statistical calibration of mapping completeness or school capacity.';
const AGE_BANDS = Array.from({ length: 16 }, (_, i) => `${i * 5}_${i * 5 + 4}`).concat('80_plus');
const clamp = (n: number) => Math.max(0, Math.min(1, n));
function ages(ageBand: string) {
  const first = Number.parseInt(ageBand, 10);
  return Array.from({ length: 5 }, (_, i) => first + i);
}
function unavailable(
  input: HouseholdAudienceInput,
  reasons: string[],
  reference?: HouseholdAudienceReference,
): HouseholdAudienceResult {
  return {
    status: 'unavailable',
    share: null,
    lowerShare: null,
    higherShare: null,
    probabilities: [],
    sources: reference?.sources ?? [],
    reasons,
    limitations: [],
    method: METHOD + (input.parent.schoolLocation ? ` ${SCHOOL_METHOD}` : ''),
    referenceVersion: reference?.version ?? HOUSEHOLD_AUDIENCE_REFERENCE_VERSION,
    geographicGrain: reference?.geographicGrain ?? null,
  };
}

interface SchoolShare {
  lower: number;
  base: number;
  higher: number;
  coverage: number;
}
/**
 * Within each published duration band, school locations are inferred from mapped
 * school counts. Fixed polar quadrature estimates how much of that travel annulus
 * lies inside the imported grid. Uncovered bands, boarding and long journeys keep
 * unknown destinations; that mass is never reassigned to known local schools.
 */
function schoolShare(
  reference: HouseholdAudienceReference,
  geography: HouseholdSchoolGeography,
  childAge: number,
): SchoolShare {
  const travel = reference.schoolTravel!;
  const bins = childAge < 12 ? travel.primary : travel.secondary;
  const unknown = childAge < 12 ? travel.primaryUnknownShare : travel.secondaryUnknownShare;
  const total = bins.reduce((sum, bin) => sum + bin.share, unknown);
  const home = geography.zones.find((zone) => zone.id === geography.homeZoneId)!;
  const metresLongitude = 111320 * Math.cos((home.latitude * Math.PI) / 180);
  const width = geography.cellWidthMetres;
  const points = geography.zones.map((zone) => ({
    ...zone,
    x: (zone.longitude - home.longitude) * metresLongitude,
    y: (zone.latitude - home.latitude) * 111320,
  }));
  const profiles = [4, 8, 12].map((speedKph) => {
    let knownSelected = 0,
      coverage = 0;
    for (const bin of bins) {
      let covered = 0,
        mapped = 0,
        selected = 0;
      // Internal multimodal speed scenarios; 1.3 circuity is not an observed school route.
      const min = ((bin.minutesMin / 60) * speedKph * 1000) / 1.3;
      const max = ((bin.minutesMax / 60) * speedKph * 1000) / 1.3;
      for (let radial = 0; radial < 4; radial++) {
        const radius = Math.sqrt(min * min + ((max * max - min * min) * (radial + 0.5)) / 4);
        for (let direction = 0; direction < 32; direction++) {
          const theta = (2 * Math.PI * (direction + 0.5)) / 32;
          const x = radius * Math.cos(theta),
            y = radius * Math.sin(theta);
          const zone = points.find(
            (point) => Math.abs(point.x - x) <= width / 2 && Math.abs(point.y - y) <= width / 2,
          );
          if (!zone) continue;
          covered++;
          mapped += zone.schoolCount;
          selected += zone.selectedSchoolCount;
        }
      }
      if (mapped <= 0) continue;
      const knownMass = ((bin.share / total) * covered) / 128;
      knownSelected += (knownMass * selected) / mapped;
      coverage += knownMass;
    }
    return { knownSelected: clamp(knownSelected), coverage: clamp(coverage) };
  });
  // Base is the 8 km/h scenario's known subtotal, conservative about unknown locations.
  return {
    lower: Math.min(...profiles.map((p) => p.knownSelected)),
    base: profiles[1].knownSelected,
    higher: Math.max(...profiles.map((p) => clamp(p.knownSelected + 1 - p.coverage))),
    coverage: profiles[1].coverage,
  };
}

export function evaluateHouseholdAudience(input: HouseholdAudienceInput): HouseholdAudienceResult {
  const reference = householdAudienceReference(input.countryCode);
  if (!reference)
    return unavailable(input, ['No household audience reference is available for this country.']);
  if (input.economicDescription?.trim())
    return unavailable(
      input,
      [
        'The selected economic audience criterion has no supported joint household reference. Revise that criterion or add suitable evidence.',
      ],
      reference,
    );
  const { childAgeMin: min, childAgeMax: max } = input.parent;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min || max > 24)
    return unavailable(input, ['The selected child age range is invalid.'], reference);
  const childAges = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  if (
    childAges.some(
      (age) =>
        !reference.attendance.some((p) => age >= p.ageMin && age <= p.ageMax) ||
        !reference.livingArrangements.some((p) => age >= p.ageMin && age <= p.ageMax),
    )
  )
    return unavailable(
      input,
      [
        'The household reference does not cover school participation and parent relationships for every selected child age.',
      ],
      reference,
    );
  const cells = input.ageSexPopulation;
  if (
    cells.length !== 34 ||
    new Set(cells.map((cell) => `${cell.sex}:${cell.ageBand}`)).size !== 34 ||
    cells.some(
      (cell) =>
        !AGE_BANDS.includes(cell.ageBand) || !Number.isFinite(cell.residents) || cell.residents < 0,
    ) ||
    AGE_BANDS.some((band) =>
      ['female', 'male'].some(
        (sex) => !cells.some((cell) => cell.ageBand === band && cell.sex === sex),
      ),
    )
  )
    return unavailable(
      input,
      [
        'A complete, nonnegative all-age/both-sex population is required to compose the household audience.',
      ],
      reference,
    );
  if (input.selectedAgeBands?.some((band) => !AGE_BANDS.includes(band)))
    return unavailable(
      input,
      ['The selected adult age band is not supported by the population reference.'],
      reference,
    );
  const population = cells.reduce((sum, cell) => sum + cell.residents, 0);
  if (population <= 0)
    return unavailable(
      input,
      ['No resident population is available for the household audience.'],
      reference,
    );
  const geography = input.schoolGeography;
  if (input.parent.schoolLocation) {
    if (!reference.schoolTravel)
      return unavailable(
        input,
        [
          'No school travel reference supports the chosen school-location criterion in this country.',
        ],
        reference,
      );
    if (
      !geography ||
      !geography.source ||
      !Number.isFinite(geography.cellWidthMetres) ||
      geography.cellWidthMetres <= 0 ||
      !geography.zones.some((zone) => zone.id === geography.homeZoneId) ||
      geography.zones.some(
        (zone) =>
          !Number.isFinite(zone.longitude) ||
          !Number.isFinite(zone.latitude) ||
          !Number.isInteger(zone.schoolCount) ||
          zone.schoolCount < 0 ||
          !Number.isInteger(zone.selectedSchoolCount) ||
          zone.selectedSchoolCount < 0 ||
          zone.selectedSchoolCount > zone.schoolCount,
      ) ||
      !geography.zones.some((zone) => zone.schoolCount > 0) ||
      !geography.zones.some((zone) => zone.selectedSchoolCount > 0)
    )
      return unavailable(
        input,
        [
          'Mapped school locations and their surrounding catchment are missing. The child’s school cannot be inferred from the parent’s home or travel purpose.',
        ],
        reference,
      );
  }
  const childCounts = childAges.map((age) => ({
    age,
    residents: cells
      .filter((cell) => ages(cell.ageBand).includes(age))
      .reduce((sum, cell) => sum + cell.residents / 5, 0),
    attendance: reference.attendance.find((p) => age >= p.ageMin && age <= p.ageMax)!.probability,
    living: reference.livingArrangements.find((p) => age >= p.ageMin && age <= p.ageMax)!,
    school: input.parent.schoolLocation
      ? schoolShare(reference, geography!, age)
      : { lower: 1, base: 1, higher: 1, coverage: 1 },
  }));
  if (input.parent.schoolLocation && childCounts.every((child) => child.school.coverage <= 0))
    return unavailable(
      input,
      [
        'Mapped schools do not establish a destination within the supported school travel range for this home area.',
      ],
      reference,
    );
  const adults = cells.flatMap((cell, cellIndex) =>
    ages(cell.ageBand)
      .filter((age) => age >= 18)
      .map((age) => ({ age, cellIndex, sex: cell.sex, residents: cell.residents / 5 })),
  );
  function probabilities(scenario: 'lower' | 'base' | 'higher', fatherOffset: number) {
    const links = adults.map(() => 0);
    for (const child of childCounts)
      for (const sex of ['female', 'male'] as const) {
        const r =
          child.living.bothParents +
          (sex === 'female' ? child.living.motherOnly : child.living.fatherOnly);
        const joint =
          scenario === 'lower'
            ? Math.max(0, child.attendance + r - 1)
            : scenario === 'higher'
              ? Math.min(child.attendance, r)
              : child.attendance * r;
        const parentLinks = child.residents * joint * child.school[scenario];
        const weights = adults.map((adult) => {
          if (adult.sex !== sex) return 0;
          const birthAge = adult.age - child.age - (sex === 'male' ? fatherOffset : 0);
          const fertility =
            reference!.maternalFertility.find((p) => birthAge >= p.ageMin && birthAge <= p.ageMax)
              ?.birthsPerThousand ?? 0;
          return adult.residents * fertility;
        });
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        if (parentLinks > 0 && total <= 0) return null;
        if (total > 0)
          weights.forEach((weight, i) => {
            links[i] += (parentLinks * weight) / total;
          });
      }
    const k = scenario === 'lower' ? 0.5 : scenario === 'higher' ? 2 : 1;
    const people = cells.map(() => 0);
    adults.forEach((adult, i) => {
      const lambda = adult.residents > 0 ? links[i] / adult.residents : 0;
      people[adult.cellIndex] += adult.residents * (1 - Math.pow(1 + lambda / k, -k));
    });
    return people.map((count, i) =>
      cells[i].residents > 0 ? clamp(count / cells[i].residents) : 0,
    );
  }
  const base = probabilities('base', 5);
  const lower = [3, 5, 8].map((offset) => probabilities('lower', offset));
  const higher = [3, 5, 8].map((offset) => probabilities('higher', offset));
  if (!base || lower.some((row) => row === null) || higher.some((row) => row === null))
    return unavailable(
      input,
      [
        'The population’s adult age/sex composition cannot support the reference parent-child links.',
      ],
      reference,
    );
  const rows = cells.map((cell, i) => ({
    ageBand: cell.ageBand,
    sex: cell.sex,
    probability: base[i],
    lowerProbability: Math.min(base[i], ...lower.map((p) => p![i])),
    higherProbability: Math.max(base[i], ...higher.map((p) => p![i])),
  }));
  const selected = (i: number) =>
    (!input.selectedAgeBands?.length || input.selectedAgeBands.includes(cells[i].ageBand)) &&
    (!input.selectedSex || input.selectedSex === cells[i].sex);
  const share = (key: 'probability' | 'lowerProbability' | 'higherProbability') =>
    clamp(
      rows.reduce((sum, row, i) => sum + (selected(i) ? cells[i].residents * row[key] : 0), 0) /
        population,
    );
  const childTotal = childCounts.reduce((sum, child) => sum + child.residents, 0);
  return {
    status: 'supported',
    share: share('probability'),
    lowerShare: share('lowerProbability'),
    higherShare: share('higherProbability'),
    probabilities: rows,
    sources: [
      ...reference.sources,
      ...(input.parent.schoolLocation && geography ? [geography.source] : []),
    ],
    reasons: [],
    geographicGrain: reference.geographicGrain,
    method: METHOD + (input.parent.schoolLocation ? ` ${SCHOOL_METHOD}` : ''),
    referenceVersion: reference.version,
    limitations: [
      'This estimate covers adults living with their biological school-age children. Parents living elsewhere and guardians are not covered.',
      `${reference.geographicGrain}. Local household relationships are modeled, not observed.`,
      ...(input.parent.schoolLocation
        ? [
            'School destinations are inferred separately from adult journeys. The range allows unknown boarding, long-distance and outside-grid destinations. Mapping completeness and school capacity are not measured; uneven school mapping can bias these estimates.',
          ]
        : []),
    ],
    ...(input.parent.schoolLocation && geography
      ? {
          schoolCoverage: {
            mappedSchools: geography.zones.reduce((sum, zone) => sum + zone.schoolCount, 0),
            selectedMappedSchools: geography.zones.reduce(
              (sum, zone) => sum + zone.selectedSchoolCount,
              0,
            ),
            modeledDestinationCoverage:
              childTotal > 0
                ? childCounts.reduce(
                    (sum, child) => sum + child.residents * child.school.coverage,
                    0,
                  ) / childTotal
                : 0,
          },
        }
      : {}),
  };
}

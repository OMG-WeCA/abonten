import type { PlanningStudySource, PlanningStudyTarget } from '@abonten/contracts/planning-study';
import type { HouseholdAudienceResult } from './household-audience-model';
import reference from './sec-audience-reference.json';

export const SEC_AUDIENCE_REFERENCE_VERSION = reference.version;
export const SEC_AUDIENCE_PUBLICATION_VERSION = 'abonten-sec-publication-2026-11-08-v1';
export const SEC_MAX_OPTIMIZER_SPREAD_PP = 5;
const GROUPS: readonly string[] = reference.groups;
export const SEC_AUDIENCE_METHOD =
  'Six country-specific weighted multifactor latent profiles from respondent occupation, education, household assets and living conditions. Fractional membership; unclassified records remain unknown. These are Abonten model classes, not observed NRS/CIE grades.';
export const SEC_AUDIENCE_GRAIN =
  'National survey age/gender strata; no neighborhood-level SEC observations';
interface Cell {
  ageBand: string;
  sex: 'female' | 'male';
  residents: number;
}
interface Result {
  status: 'modeled' | 'unavailable';
  share: number | null;
  lowerShare: number | null;
  higherShare: number | null;
  selectedShare?: number;
  eligibleAdultShare?: number;
  optimizerShares?: number[];
  classifiedShare: number | null;
  unknownShare: number | null;
  unknownPotentialShare?: number | null;
  sources: PlanningStudySource[];
  reasons: string[];
  limitations: string[];
}
const clamp = (value: number) => Math.max(0, Math.min(1, value));
export function secAudienceReference(countryCode: string) {
  return reference.countries[countryCode as keyof typeof reference.countries] ?? null;
}
export function evaluateSecAudience(input: {
  countryCode: string;
  cells: Cell[];
  target: PlanningStudyTarget;
  parent?: HouseholdAudienceResult | null;
}): Result {
  const country = secAudienceReference(input.countryCode);
  const sources: PlanningStudySource[] = country
    ? [
        {
          layer: 'socioeconomic_reference',
          sourceKey: reference.source.sourceKey,
          version: SEC_AUDIENCE_REFERENCE_VERSION,
          referenceYear: 2024,
          attribution: reference.source.attribution,
          licenceUrl: reference.source.policyUrl,
        },
      ]
    : [];
  const reasons: string[] = [];
  const selected = [...new Set(input.target.sec?.groups ?? [])];
  const allGroups =
    selected.length === GROUPS.length &&
    GROUPS.every((group) => selected.includes(group as (typeof selected)[number]));
  if (!country && !allGroups) reasons.push('No SEC reference covers the selected market.');
  if (!selected.length || selected.some((group) => !GROUPS.includes(group)))
    reasons.push('Choose supported SEC groups.');
  const total = input.cells.reduce((sum, cell) => sum + cell.residents, 0);
  if (input.cells.length !== 34 || !(total > 0))
    reasons.push('SEC qualification needs the complete age and gender population for this area.');
  if (input.parent?.status === 'unavailable') reasons.push(...input.parent.reasons);
  if (
    input.target.household?.parentsOfSchoolChildren &&
    (!input.parent ||
      input.cells.some(
        (cell) =>
          !input.parent!.probabilities.some(
            (row) => row.ageBand === cell.ageBand && row.sex === cell.sex,
          ),
      ))
  )
    reasons.push(
      'Combined SEC and parent qualification needs a supported parent estimate for every age and gender group.',
    );
  if (reasons.length)
    return {
      status: 'unavailable',
      share: null,
      lowerShare: null,
      higherShare: null,
      classifiedShare: null,
      unknownShare: null,
      sources,
      reasons,
      limitations: [],
    };
  const optimizerShares = Array(country?.multistart.nearBestMapObjectives.length ?? 1).fill(
    0,
  ) as number[];
  const structuralLower = optimizerShares.map(() => 0),
    structuralHigher = optimizerShares.map(() => 0);
  let samplingVariance = 0,
    parentUpper = 0,
    allLower = 0,
    allHigher = 0;
  let base = 0,
    classified = 0,
    eligible = 0,
    selectedMass = 0;
  for (const cell of input.cells) {
    if (
      (input.target.ageBands?.length && !input.target.ageBands.includes(cell.ageBand)) ||
      (input.target.sex && input.target.sex !== cell.sex)
    )
      continue;
    selectedMass += cell.residents;
    const first = Number.parseInt(cell.ageBand, 10);
    const adult = first < 15 ? 0 : first === 15 ? 2 / 5 : 1;
    if (!adult) continue;
    eligible += cell.residents * adult;
    const stratum = country?.strata.find(
      (row) => row.ageBand === cell.ageBand && row.sex === cell.sex,
    );
    if (allGroups) {
      const parent = input.parent?.probabilities.find(
        (row) => row.ageBand === cell.ageBand && row.sex === cell.sex,
      );
      const p = parent ? parent.probability : adult;
      base += cell.residents * p;
      allLower += cell.residents * (parent ? parent.lowerProbability : adult);
      allHigher += cell.residents * (parent ? parent.higherProbability : adult);
      classified += cell.residents * adult * (stratum?.classifiedShare ?? 0);
      for (let index = 0; index < optimizerShares.length; index++)
        optimizerShares[index] += cell.residents * p;
      continue;
    }
    if (!stratum) continue;
    const indices = selected.map((group) => GROUPS.indexOf(group));
    const probability = indices.reduce((sum, i) => sum + stratum.probabilities[i], 0);
    const parent = input.parent?.probabilities.find(
      (row) => row.ageBand === cell.ageBand && row.sex === cell.sex,
    );
    const joint = parent ? parent.probability * probability : adult * probability;
    base += cell.residents * joint;
    const variance =
      stratum.effectiveSampleSize > 0
        ? Math.max(0, probability * (1 - probability)) / stratum.effectiveSampleSize
        : 0;
    samplingVariance += (cell.residents * adult) ** 2 * variance;
    parentUpper += cell.residents * (parent ? parent.higherProbability : adult);
    for (let index = 0; index < optimizerShares.length; index++) {
      const p = stratum.nearBestProbabilities[index].reduce(
        (sum, value, i) => sum + (indices.includes(i) ? value : 0),
        0,
      );
      optimizerShares[index] += cell.residents * (parent ? parent.probability * p : adult * p);
      structuralLower[index] +=
        cell.residents *
        (parent ? Math.max(0, parent.lowerProbability + adult * p - adult) : adult * p);
      structuralHigher[index] +=
        cell.residents *
        (parent
          ? Math.min(parent.higherProbability, adult * Math.min(1, p + stratum.unknownShare))
          : adult * Math.min(1, p + stratum.unknownShare));
    }
    classified += cell.residents * adult * stratum.classifiedShare;
  }
  if (!(eligible > 0))
    return {
      status: 'unavailable',
      share: null,
      lowerShare: null,
      higherShare: null,
      selectedShare: selectedMass / total,
      classifiedShare: 0,
      unknownShare: 1,
      sources,
      reasons: [
        'SEC evidence covers adults aged 18 and over; the selected audience has no supported adult age range.',
      ],
      limitations: [],
    };
  if (!allGroups && !(classified > 0))
    return {
      status: 'unavailable',
      share: null,
      lowerShare: null,
      higherShare: null,
      selectedShare: selectedMass / total,
      classifiedShare: 0,
      unknownShare: 1,
      unknownPotentialShare: eligible / selectedMass,
      sources,
      reasons: ['No classified SEC reference covers the selected adult age and gender groups.'],
      limitations: [],
    };
  const samplingMargin = 1.96 * Math.sqrt(samplingVariance);
  const lower = allGroups ? allLower : Math.max(0, Math.min(...structuralLower) - samplingMargin);
  const higher = allGroups
    ? allHigher
    : Math.min(parentUpper, Math.max(...structuralHigher) + samplingMargin);
  const limitations = [
    'SEC describes modeled adult socioeconomic profiles, not purchasing capacity or household chief-earner grades.',
    'The reference surveys cover adult citizens; applying those profiles to residents is a planning assumption.',
    'National survey profiles are applied by age and gender; local SEC variation is not observed. Missing and sparsely sampled profiles remain unclassified.',
    'People under 18 remain outside SEC coverage. The 15–19 population group includes only its modeled adult share.',
    ...(allGroups
      ? [
          'All six SEC groups are selected, so every eligible adult qualifies without assigning an individual grade. Grade coverage remains separate.',
        ]
      : [
          'The range includes variation between fitted profiles, approximate sampling uncertainty and unclassified adults who could qualify. It is not a confidence interval.',
        ]),
    ...(input.parent && !allGroups
      ? [
          'Parent and SEC membership are not jointly observed. Their combined estimate includes a range for this uncertainty.',
        ]
      : []),
  ];
  return {
    status: 'modeled',
    share: allGroups && input.parent ? input.parent.share : clamp(base / total),
    lowerShare: allGroups && input.parent ? input.parent.lowerShare : clamp(lower / total),
    higherShare: allGroups && input.parent ? input.parent.higherShare : clamp(higher / total),
    selectedShare: selectedMass / total,
    eligibleAdultShare: eligible / total,
    optimizerShares: optimizerShares.map((value) => value / total),
    unknownPotentialShare: allGroups
      ? 0
      : selectedMass
        ? clamp((eligible - classified) / selectedMass)
        : 0,
    classifiedShare: selectedMass ? clamp(classified / selectedMass) : 0,
    unknownShare: selectedMass ? clamp(1 - classified / selectedMass) : 1,
    sources,
    reasons: [],
    limitations,
  };
}
export function secReferenceSummary(countryCode: string) {
  const country = secAudienceReference(countryCode);
  return {
    status: country ? 'available' : 'unavailable',
    groups: GROUPS,
    adultMinAge: 18,
    geographicGrain: SEC_AUDIENCE_GRAIN,
    referenceVersion: SEC_AUDIENCE_REFERENCE_VERSION,
    method: SEC_AUDIENCE_METHOD,
    ...(country
      ? {
          sampleSize: country.sampleSize,
          completeSampleSize: country.completeSampleSize,
          surveyPeriod: country.surveyPeriod,
        }
      : {}),
    source: {
      url: reference.source.url,
      codebookUrl: reference.source.codebookUrl,
      policyUrl: reference.source.policyUrl,
      sha256: reference.source.sha256,
      weight: reference.source.weight,
    },
  };
}

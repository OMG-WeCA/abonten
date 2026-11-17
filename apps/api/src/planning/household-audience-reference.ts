import type { PlanningStudySource } from '@abonten/contracts/planning-study';

/** Published aggregates only. No household records or inferred monetary capacity. */
export interface HouseholdAudienceReference {
  countryCode: string;
  version: string;
  geographicGrain: string;
  sources: (PlanningStudySource & {
    url: string;
    surveyPeriod: string;
    access: string;
    observations: string;
    tables?: { id: string; printedPage: number; pdfPage?: number }[];
  })[];
  livingArrangements: {
    ageMin: number;
    ageMax: number;
    bothParents: number;
    motherOnly: number;
    fatherOnly: number;
  }[];
  attendance: { ageMin: number; ageMax: number; probability: number; sourceKey: string }[];
  /** Annual births per 1,000 women; used as a shape, not current household counts. */
  maternalFertility: { ageMin: number; ageMax: number; birthsPerThousand: number }[];
  schoolTravel?: {
    sourceKey: string;
    primary: { minutesMin: number; minutesMax: number; share: number }[];
    secondary: { minutesMin: number; minutesMax: number; share: number }[];
    /** Boarding and 61+ minutes retain unknown destinations. */
    primaryUnknownShare: number;
    secondaryUnknownShare: number;
  };
}

const ngDhs =
  'https://www.health.gov.ng/wp-content/uploads/2025/10/NDHS-2024-Final-Report_Disseminated17102025.pdf';
const ngGhs =
  'https://nigerianstat.gov.ng/pdfuploads/GHS-Panel%20Wave%205%20-%20Survey%20Report.pdf';
const ngMics = 'https://www.unicef.org/nigeria/media/6316/file/2021%20MICS%20full%20report%20.pdf';
const ghDhs = 'https://dhsprogram.com/pubs/pdf/FR387/FR387.pdf';
const referenceVersion = 'published-household-priors-2026-11-08-v1';

/** Versioned reference feed. Add countries as data, without country-specific model branches. */
export const HOUSEHOLD_AUDIENCE_REFERENCES: readonly HouseholdAudienceReference[] = [
  {
    countryCode: 'NG',
    version: referenceVersion,
    geographicGrain: 'Nigeria national aggregates; not Lagos household observations',
    sources: [
      {
        layer: 'household_reference',
        sourceKey: 'ng-dhs-2024',
        version: 'FR395-t2.9-t5.1',
        referenceYear: 2024,
        attribution:
          'Federal Ministry of Health and Social Welfare, National Population Commission and ICF. Nigeria DHS 2024, tables 2.9 and 5.1.',
        licenceUrl: ngDhs,
        url: ngDhs,
        surveyPeriod: 'December 2023–May 2024',
        tables: [
          { id: '2.9', printedPage: 27, pdfPage: 71 },
          { id: '5.1', printedPage: 123, pdfPage: 167 },
        ],
        access:
          'Public aggregate report. No open microdata licence inferred; no household records redistributed.',
        observations:
          'Child-age-specific biological-parent co-residence; national maternal age-specific fertility (10–14 and 45–49 rates are bracketed/truncated in the report). These tables do not observe the joint parent/enrollment/parent-age distribution.',
      },
      {
        layer: 'household_reference',
        sourceKey: 'ng-ghs-panel-wave5',
        version: '2023-24-t2.13-t2.14',
        referenceYear: 2024,
        attribution:
          'National Bureau of Statistics Nigeria. General Household Survey Panel Wave 5, tables 2.13–2.14.',
        licenceUrl: 'https://nigerianstat.gov.ng/page/terms',
        url: ngGhs,
        surveyPeriod: 'July–September 2023 and January–March 2024; school travel refers to 2022/23',
        tables: [
          { id: '2.13', printedPage: 84, pdfPage: 99 },
          { id: '2.14', printedPage: 85, pdfPage: 100 },
        ],
        access:
          'Public aggregate facts. NBS terms apply; restricted report and microdata are not packaged with this feed.',
        observations:
          '76.1% of children aged 5–14 currently attend any schooling. National school travel-time distributions are by primary/secondary level, not parent journeys or school destinations.',
      },
      {
        layer: 'household_reference',
        sourceKey: 'ng-mics-2021',
        version: '2021-tLN.2.6',
        referenceYear: 2021,
        attribution:
          'National Bureau of Statistics and UNICEF. Nigeria MICS 2021, table LN.2.6, national total.',
        licenceUrl: 'https://www.unicef.org/legal',
        url: ngMics,
        surveyPeriod: '2021; age at beginning of school year',
        tables: [{ id: 'LN.2.6', printedPage: 288 }],
        access: 'Public aggregate facts with attribution; no survey records redistributed.',
        observations:
          '34.3% of children aged 15–17 are out of every level of schooling. The modeled attendance prior is its complement, 65.7%; school-year age and current raster age are approximated as equivalent.',
      },
    ],
    livingArrangements: [
      { ageMin: 0, ageMax: 4, bothParents: 0.811, motherOnly: 0.114, fatherOnly: 0.043 },
      { ageMin: 5, ageMax: 9, bothParents: 0.736, motherOnly: 0.107, fatherOnly: 0.082 },
      { ageMin: 10, ageMax: 14, bothParents: 0.664, motherOnly: 0.121, fatherOnly: 0.099 },
      { ageMin: 15, ageMax: 17, bothParents: 0.579, motherOnly: 0.136, fatherOnly: 0.094 },
    ],
    attendance: [
      { ageMin: 5, ageMax: 14, probability: 0.761, sourceKey: 'ng-ghs-panel-wave5' },
      { ageMin: 15, ageMax: 17, probability: 0.657, sourceKey: 'ng-mics-2021' },
    ],
    maternalFertility: [1, 77, 209, 233, 209, 134, 72, 24].map((birthsPerThousand, i) => ({
      ageMin: 10 + i * 5,
      ageMax: 14 + i * 5,
      birthsPerThousand,
    })),
    schoolTravel: {
      sourceKey: 'ng-ghs-panel-wave5',
      primary: [0.456, 0.382, 0.111, 0.036].map((share, i) => ({
        minutesMin: i * 15,
        minutesMax: (i + 1) * 15,
        share,
      })),
      secondary: [0.251, 0.458, 0.158, 0.058].map((share, i) => ({
        minutesMin: i * 15,
        minutesMax: (i + 1) * 15,
        share,
      })),
      primaryUnknownShare: 0.015,
      secondaryUnknownShare: 0.074,
    },
  },
  {
    countryCode: 'GH',
    version: referenceVersion,
    geographicGrain: 'Ghana national aggregates; not Accra household observations',
    sources: [
      {
        layer: 'household_reference',
        sourceKey: 'gh-dhs-2022',
        version: 'FR387-t2.9-t5.1',
        referenceYear: 2022,
        attribution:
          'Ghana Statistical Service and ICF. Ghana Demographic and Health Survey 2022, tables 2.9 and 5.1.',
        licenceUrl: ghDhs,
        url: ghDhs,
        surveyPeriod: 'October 2022–January 2023',
        tables: [
          { id: '2.9', printedPage: 24 },
          { id: '5.1', printedPage: 87 },
        ],
        access:
          'Public aggregate report. No open microdata licence inferred; no household records redistributed.',
        observations:
          'Child-age-specific biological-parent co-residence and national maternal age-specific fertility; not observed adult parent/enrollment joints.',
      },
      {
        layer: 'household_reference',
        sourceKey: 'gh-uis-enrollment-2024',
        version: 'WB-WDI-2026-11-08',
        referenceYear: 2024,
        attribution:
          'UNESCO Institute for Statistics, World Development Indicators: SE.PRM.UNER.ZS and SE.SEC.UNER.LO.ZS. Retrieved 8 November 2026.',
        licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
        url: 'https://api.worldbank.org/v2/country/GH/indicator/SE.PRM.UNER.ZS?format=json',
        surveyPeriod: 'School year ending 2024',
        access: 'CC BY 4.0, aggregate public API.',
        observations:
          'Primary out-of-school 4.76691007614136%; lower-secondary out-of-school 5.16796016693115%. Complements model enrollment for official ages 6–11 and 12–14. Enrollment and survey attendance differ; no upper-secondary or school-travel reference activated.',
      },
    ],
    livingArrangements: [
      { ageMin: 0, ageMax: 4, bothParents: 0.602, motherOnly: 0.309, fatherOnly: 0.02 },
      { ageMin: 5, ageMax: 9, bothParents: 0.518, motherOnly: 0.261, fatherOnly: 0.047 },
      { ageMin: 10, ageMax: 14, bothParents: 0.442, motherOnly: 0.262, fatherOnly: 0.074 },
      { ageMin: 15, ageMax: 17, bothParents: 0.395, motherOnly: 0.285, fatherOnly: 0.077 },
    ],
    attendance: [
      {
        ageMin: 6,
        ageMax: 11,
        probability: 1 - 4.76691007614136 / 100,
        sourceKey: 'gh-uis-enrollment-2024',
      },
      {
        ageMin: 12,
        ageMax: 14,
        probability: 1 - 5.16796016693115 / 100,
        sourceKey: 'gh-uis-enrollment-2024',
      },
    ],
    maternalFertility: [2, 63, 156, 190, 176, 128, 53, 14].map((birthsPerThousand, i) => ({
      ageMin: 10 + i * 5,
      ageMax: 14 + i * 5,
      birthsPerThousand,
    })),
  },
];

export const HOUSEHOLD_AUDIENCE_REFERENCE_VERSION = referenceVersion;
export function householdAudienceReference(countryCode: string) {
  return HOUSEHOLD_AUDIENCE_REFERENCES.find(
    (reference) => reference.countryCode === countryCode.toUpperCase(),
  );
}

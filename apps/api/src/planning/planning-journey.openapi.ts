import { PLANNING_AGE_BANDS, PLANNING_SEC_GROUPS } from './planning-journey';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
const text = (maxLength: number): SchemaObject => ({ type: 'string', maxLength });
const stringList = (maxItems: number, maxLength: number): SchemaObject => ({
  type: 'array',
  maxItems,
  items: text(maxLength),
});
const point: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['longitude', 'latitude'],
  properties: {
    longitude: { type: 'number', minimum: -180, maximum: 180 },
    latitude: { type: 'number', minimum: -85, maximum: 85 },
  },
};
export const planningTargetSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    locations: { type: 'array', maxItems: 25, items: { type: 'integer', minimum: 1, maximum: 25 } },
    travelPurposes: {
      type: 'array',
      maxItems: 9,
      items: {
        type: 'string',
        enum: [
          'business',
          'education',
          'shopping',
          'food_and_drink',
          'healthcare',
          'transport',
          'leisure',
          'tourism',
          'religious',
        ],
      },
    },
    ageBands: {
      type: 'array',
      maxItems: 18,
      items: { type: 'string', enum: [...PLANNING_AGE_BANDS] },
    },
    sex: { type: 'string', enum: ['female', 'male'] },
    sec: {
      type: 'object',
      additionalProperties: false,
      required: ['groups'],
      properties: {
        groups: {
          type: 'array',
          maxItems: 6,
          uniqueItems: true,
          items: { type: 'string', enum: [...PLANNING_SEC_GROUPS] },
        },
      },
    },
    unsupportedCriteria: stringList(12, 240),
    household: {
      type: 'object',
      additionalProperties: false,
      properties: {
        parentsOfSchoolChildren: {
          type: 'object',
          additionalProperties: false,
          properties: {
            childAgeMin: { type: 'integer', minimum: 0, maximum: 24 },
            childAgeMax: { type: 'integer', minimum: 0, maximum: 24 },
            schoolLocation: {
              type: 'object',
              additionalProperties: false,
              required: ['scope'],
              properties: { scope: { type: 'string', enum: ['study_area'] }, label: text(240) },
            },
          },
        },
        economicDescription: {
          ...text(500),
          description:
            'Explicit target requirement, separate from offer context. Unsupported joint evidence leaves qualified population unavailable.',
        },
      },
    },
  },
};
export const planningJourneySchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'brief', 'targetGroup', 'strategy', 'origin'],
  properties: {
    version: { type: 'integer', enum: [1] },
    origin: { type: 'string', enum: ['manual', 'ai'] },
    brief: {
      type: 'object',
      additionalProperties: false,
      required: ['summary'],
      description:
        'Planner-reviewed summary and offer. Raw uploaded document content is not automatically retained. This is not provider-sharing consent.',
      properties: { summary: text(8002), offer: text(2000) },
    },
    targetGroup: {
      type: 'object',
      additionalProperties: false,
      required: ['description', 'rationale', 'criteria'],
      properties: {
        description: text(1000),
        rationale: text(2000),
        criteria: planningTargetSchema,
      },
    },
    secondaryTargetGroup: {
      type: 'object',
      additionalProperties: false,
      required: ['description', 'rationale', 'criteria'],
      properties: {
        description: text(1000),
        rationale: text(2000),
        criteria: planningTargetSchema,
      },
    },
    strategy: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'rationale'],
      properties: {
        summary: text(2000),
        rationale: text(2000),
        geography: {
          type: 'object',
          additionalProperties: false,
          required: ['center', 'radiusKm'],
          properties: { center: point, radiusKm: { type: 'number', minimum: 0.5, maximum: 10 } },
        },
        objective: { type: 'string', enum: ['reach', 'frequency'] },
        minimumOpportunities: { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
        dayparts: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'label', 'localHour'],
            properties: {
              id: { type: 'string', pattern: '^[a-z0-9_-]{1,40}$' },
              label: text(80),
              localHour: { type: 'integer', minimum: 0, maximum: 23 },
              dayType: { type: 'string', enum: ['all', 'weekday', 'weekend'] },
            },
          },
        },
      },
    },
  },
};

export const planningBriefFieldsRequestSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['countryCode', 'briefText'],
  properties: {
    countryCode: { type: 'string', enum: ['NG', 'GH', 'BJ', 'CI', 'CM'] },
    locale: { type: 'string', enum: ['en', 'fr'] },
    briefText: { type: 'string', minLength: 1, maxLength: 60000 },
  },
};
const campaignTargetPatch: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    description: text(1000),
    unsupportedCriteria: stringList(12, 240),
    ageBands: planningTargetSchema.properties!.ageBands as SchemaObject,
    sex: { type: 'string', enum: ['female', 'male'], nullable: true },
    sec: planningTargetSchema.properties!.sec as SchemaObject,
    travelPurposes: planningTargetSchema.properties!.travelPurposes as SchemaObject,
    parentsOfSchoolChildren: {
      ...((planningTargetSchema.properties!.household as SchemaObject).properties!
        .parentsOfSchoolChildren as SchemaObject),
      nullable: true,
      description: 'Null explicitly removes the parent restriction; omission preserves it.',
    },
  },
};
export const planningBriefFieldsResultSchema: SchemaObject = {
  type: 'object',
  required: ['fields', 'notes'],
  properties: {
    fields: {
      type: 'object',
      additionalProperties: false,
      description: 'Only stated fields are present; omitted fields leave the campaign unchanged.',
      properties: {
        description: text(8000),
        primaryTargetGroup: campaignTargetPatch,
        secondaryTargetGroup: { ...campaignTargetPatch, nullable: true },
        objective: { type: 'string', enum: ['reach', 'frequency'] },
        minimumOpportunities: { type: 'integer', minimum: 1, maximum: 1000000 },
        budget: {
          type: 'object',
          properties: {
            amount: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 1e12 },
            currency: { type: 'string', enum: ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'] },
          },
        },
        flight: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date' },
            endDate: {
              type: 'string',
              format: 'date',
              description: 'Exclusive API boundary: the day after an inclusive campaign last day.',
            },
          },
        },
        countryCode: { type: 'string', enum: ['NG', 'GH', 'BJ', 'CI', 'CM'] },
        daypartIds: { type: 'array', maxItems: 8, items: { type: 'string' } },
      },
    },
    notes: { type: 'array', maxItems: 5, items: text(240) },
  },
};

import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { PLANNING_CURRENCIES } from './planning-math';
const draftSchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'window', 'country', 'query', 'format', 'budget', 'currency', 'faces'],
  properties: {
    version: { type: 'integer', enum: [1] },
    window: {
      type: 'object',
      additionalProperties: false,
      required: ['startDate', 'endDate'],
      properties: {
        startDate: { type: 'string', format: 'date' },
        endDate: {
          type: 'string',
          format: 'date',
          description: 'Exclusive flight end date, later than start date',
        },
      },
    },
    country: { type: 'string', maxLength: 80 },
    query: { type: 'string', maxLength: 200 },
    format: { type: 'string', maxLength: 40 },
    budget: { type: 'string', maxLength: 40 },
    currency: { type: 'string', enum: [...PLANNING_CURRENCIES] },
    faces: {
      type: 'array',
      maxItems: 100,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['siteId', 'faceId'],
        properties: {
          siteId: { type: 'string', format: 'uuid' },
          faceId: { type: 'string', format: 'uuid' },
          pricingCurrency: { type: 'string', enum: [...PLANNING_CURRENCIES] },
        },
      },
    },
  },
};
export const savedDraftSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'name', 'draft', 'revision', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 1, maxLength: 80 },
    draft: draftSchema,
    revision: { type: 'integer', minimum: 1 },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};
export function planningDraftWriteSchema(mode: 'create' | 'update'): SchemaObject {
  const key = mode === 'create' ? 'clientRequestId' : 'revision';
  return {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'draft', key],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 80 },
      draft: draftSchema,
      [key]:
        mode === 'create'
          ? {
              type: 'string',
              format: 'uuid',
              description: 'Stable UUIDv4 per create attempt; retain across uncertain retries',
            }
          : { type: 'integer', minimum: 1, maximum: 2147483646 },
    },
  };
}

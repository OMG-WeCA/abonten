import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const string: SchemaObject = { type: 'string' };
const number: SchemaObject = { type: 'number' };
const nullableString: SchemaObject = { type: 'string', nullable: true };
const strings: SchemaObject = { type: 'array', items: string };
function object(properties: Record<string, SchemaObject>): SchemaObject {
  return { type: 'object', required: Object.keys(properties), properties };
}
const provenance = object({
  importId: { type: 'string', format: 'uuid' },
  sourceKey: string,
  version: string,
  referenceYear: { type: 'integer' },
  publishedAt: { type: 'string', format: 'date-time', nullable: true },
  fetchedAt: { type: 'string', format: 'date-time' },
  licence: string,
  licenceUrl: { type: 'string', format: 'uri' },
  attribution: string,
  sourceUrl: { type: 'string', format: 'uri' },
  checksum: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  quality: { type: 'string', enum: ['mapped', 'modelled', 'observed'] },
  warnings: strings,
});
function metric(value: SchemaObject): SchemaObject {
  return object({
    status: { type: 'string', enum: ['available', 'partial', 'unavailable'] },
    value: { ...value, nullable: true },
    method: string,
    provenance: { ...provenance, nullable: true },
    warnings: strings,
  });
}
const poi = object({
  sourceId: string,
  name: nullableString,
  category: string,
  distanceMetres: number,
});
const catchment = object({
  radiusMetres: { type: 'integer', enum: [250, 500, 1000] },
  pois: metric(
    object({
      mappedCount: { type: 'integer', minimum: 0 },
      byCategory: { type: 'object', additionalProperties: { type: 'integer', minimum: 0 } },
      nearest: { type: 'array', maxItems: 20, items: poi },
      completeness: { type: 'string', enum: ['unknown'] },
    }),
  ),
  population: metric(
    object({
      people: {
        type: 'number',
        minimum: 0,
        nullable: true,
        description:
          'Area-weighted modelled residents, never audience/reach. Null when no valid cells overlap.',
      },
      validCoverageFraction: { type: 'number', minimum: 0, maximum: 1 },
      rasterCoverageFraction: { type: 'number', minimum: 0, maximum: 1 },
      unit: { type: 'string', enum: ['people'] },
    }),
  ),
});
/** Runtime OpenAPI shape mirrors the declaration-only cross-application contract. */
export const geographicContextSchema: SchemaObject = object({
  siteId: { type: 'string', format: 'uuid' },
  countryCode: nullableString,
  supported: { type: 'boolean' },
  generatedAt: { type: 'string', format: 'date-time' },
  dataClass: { type: 'string', enum: ['production'] },
  disclaimer: string,
  nearestRoad: metric(
    object({ sourceId: string, name: nullableString, roadClass: string, distanceMetres: number }),
  ),
  administrative: {
    type: 'array',
    minItems: 2,
    maxItems: 2,
    description: 'ADM1 then ADM2, each with independent source provenance.',
    items: metric({
      type: 'array',
      items: object({ sourceId: string, name: string, level: { type: 'integer', enum: [1, 2] } }),
    }),
  },
  catchments: { type: 'array', minItems: 3, maxItems: 3, items: catchment },
  traffic: metric({
    type: 'array',
    maxItems: 50,
    items: object({
      sourceId: string,
      observedFrom: { type: 'string', format: 'date-time' },
      observedTo: { type: 'string', format: 'date-time' },
      durationMinutes: { type: 'number', exclusiveMinimum: true, minimum: 0 },
      count: { type: 'integer', minimum: 0, nullable: true },
      unit: { type: 'string', enum: ['vehicles', 'pedestrians'] },
      direction: string,
      vehicleClasses: strings,
      method: string,
      distanceMetres: number,
    }),
  }),
});

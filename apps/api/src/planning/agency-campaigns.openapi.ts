import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const text: SchemaObject = { type: 'string' };
const optionalText: SchemaObject = { type: 'string', nullable: true };
const amount: SchemaObject = { type: 'number', nullable: true, minimum: 0 };
const count: SchemaObject = { type: 'integer', minimum: 0 };
const restrictedCount: SchemaObject = { ...count, nullable: true };
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  required: Object.keys(properties),
  properties,
});
const permissions = object({
  bookings: { type: 'boolean' },
  proof: { type: 'boolean' },
  issues: { type: 'boolean' },
});
const campaign = object({
  id: { type: 'string', format: 'uuid' },
  name: text,
  status: text,
  clientName: optionalText,
  currency: optionalText,
  flightStart: { ...optionalText, format: 'date-time' },
  flightEnd: { ...optionalText, format: 'date-time' },
  planningBudget: { ...amount, description: 'Recorded planning budget, independent of bookings.' },
  committedBudget: {
    ...amount,
    description:
      'Complete same-currency firm-booking quote subtotals before tax; null when missing or restricted. Recorded rates are never interpreted as full-flight costs.',
  },
  committedKnownSubtotal: {
    ...amount,
    description:
      'Known commitment subtotal only; not a complete total when commitmentMissingCount is positive.',
  },
  commitmentMissingCount: restrictedCount,
  faceCount: count,
  bookingCount: restrictedCount,
  pendingBookingCount: restrictedCount,
  firmBookingCount: restrictedCount,
  latestProofAt: {
    ...optionalText,
    format: 'date-time',
    description:
      'Most recent synced capture timestamp, not proof of delivery or an integrity verdict.',
  },
  openIssueCount: restrictedCount,
  updatedAt: { type: 'string', format: 'date-time' },
});
const proof = object({
  id: text,
  checkDate: { type: 'string', format: 'date' },
  status: text,
  capturedAt: { ...optionalText, format: 'date-time' },
  syncState: text,
  conditionNotes: optionalText,
  photoCount: count,
  creativeVisiblePhotoCount: count,
  photos: { type: 'array', items: object({ id: text, kind: optionalText }) },
});
const proofRecord = object({ ...proof.properties, campaignItemId: text, bookingId: optionalText });
const booking = object({
  id: text,
  status: text,
  startDate: { type: 'string', format: 'date' },
  endDate: { type: 'string', format: 'date' },
  holdExpiresAt: { ...optionalText, format: 'date-time' },
  currency: optionalText,
  recordedRate: {
    ...amount,
    description: 'Stored rate with unknown period basis; not a full-flight total.',
  },
  committedBudget: amount,
  committedCurrency: optionalText,
  latestProof: { ...proof, nullable: true },
});
const item = object({
  id: text,
  faceId: text,
  faceLabel: optionalText,
  siteId: optionalText,
  siteName: optionalText,
  city: optionalText,
  country: optionalText,
  startDate: { type: 'string', format: 'date' },
  endDate: { type: 'string', format: 'date' },
  status: text,
  bookings: { type: 'array', items: booking, nullable: true },
});
const issue = object({
  id: text,
  type: text,
  severity: optionalText,
  status: text,
  summary: optionalText,
  bookingId: optionalText,
  popId: optionalText,
  dueAt: { ...optionalText, format: 'date-time' },
});
const quote = object({
  id: text,
  bookingId: optionalText,
  currency: optionalText,
  status: text,
  subtotal: amount,
  taxes: amount,
  total: amount,
});
const currencyTotal = object({
  currency: text,
  campaignCount: count,
  planningBudget: amount,
  planningKnownSubtotal: { type: 'number', minimum: 0 },
  planningMissingCount: count,
  committedBudget: amount,
  committedKnownSubtotal: amount,
  commitmentMissingCount: restrictedCount,
});

export const agencyCampaignListSchema = object({
  items: { type: 'array', items: campaign },
  total: count,
  limit: { type: 'integer', minimum: 1, maximum: 100 },
  offset: count,
  asOf: { type: 'string', format: 'date-time' },
  commitmentBasis: { type: 'string', enum: ['quote_subtotal'] },
  defaultCurrency: text,
  permissions,
  statusCounts: {
    type: 'object',
    additionalProperties: count,
    description: 'Agency-wide counts, independent of status filter and page.',
  },
  currencyTotals: {
    type: 'array',
    items: currencyTotal,
    description:
      'Agency-wide totals, separated by currency. Missing amounts are never zero-filled.',
  },
  currencyMissingCount: count,
});

export const agencyCampaignDetailSchema = object({
  campaign,
  commitmentBasis: { type: 'string', enum: ['quote_subtotal'] },
  permissions,
  objective: optionalText,
  targetAudience: optionalText,
  items: { type: 'array', items: item },
  proofs: { type: 'array', items: proofRecord, nullable: true },
  issues: { type: 'array', items: issue, nullable: true },
  quotes: { type: 'array', items: quote, nullable: true },
});

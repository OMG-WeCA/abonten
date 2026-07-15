import type { Auditable, Money } from './common';

export type BookingStatus =
  | 'requested'
  | 'held'
  | 'confirmed'
  | 'live'
  | 'completed'
  | 'cancelled';

export interface Booking extends Auditable {
  campaignItemId: string;
  faceId: string;
  startDate: string;
  endDate: string;
  status: BookingStatus;
  holdExpiresAt?: string;
  rate?: Money;
  fxRateRef?: number;
  cancelledReason?: string;
}

export interface RateCard extends Auditable {
  organizationId: string; // media partner
  faceId?: string;
  currency: string;
  rates: Record<string, number>; // duration -> price
  seasonalRules?: unknown;
  effectiveFrom: string;
  effectiveTo?: string;
}

import type { Auditable, Money } from './common';

export type CampaignStatus =
  | 'draft'
  | 'planned'
  | 'booking'
  | 'live'
  | 'completed'
  | 'cancelled';

export interface Campaign extends Auditable {
  organizationId: string; // agency owner
  clientOrgId: string; // brand
  name: string;
  objective?: string;
  currency: string;
  totalBudget?: Money;
  flightStart: string;
  flightEnd: string;
  targetAudience?: string;
  status: CampaignStatus;
  scenarioOf?: string;
}

/** A line item: a face booked for a window within a campaign (SPEC.md §6.3). */
export interface CampaignItem extends Auditable {
  campaignId: string;
  faceId: string;
  startDate: string;
  endDate: string;
  rate?: Money;
  status: string;
}

import type { Auditable } from './common';

export type OrganizationType = 'media_partner' | 'agency' | 'brand' | 'platform';
export type OrganizationStatus = 'active' | 'suspended';

export interface Organization extends Auditable {
  name: string;
  type: OrganizationType;
  country: string;
  defaultCurrency: string;
  defaultLocale: string;
  status: OrganizationStatus;
  billingRef?: string;
}

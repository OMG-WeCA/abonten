import type { Auditable } from './common';

export type UserStatus = 'active' | 'disabled';

export interface User extends Auditable {
  email: string;
  name: string;
  phone?: string;
  locale: string;
  status: UserStatus;
}

export type OrganizationRole =
  | 'org_owner'
  | 'org_admin'
  | 'inventory_manager'
  | 'field_operator'
  | 'planner'
  | 'planner_admin'
  | 'client_viewer'
  | 'client_admin'
  | 'platform_admin';

export interface Membership extends Auditable {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  status: 'active' | 'invited' | 'revoked';
}

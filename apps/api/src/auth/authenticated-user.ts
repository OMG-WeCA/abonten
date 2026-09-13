import type { OrganizationRole } from '../capabilities/organization-roles';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  activeOrgId?: string;
  role?: OrganizationRole;
  sessionVersion: number;
}

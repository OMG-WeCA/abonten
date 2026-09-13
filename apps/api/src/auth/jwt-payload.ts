import type { OrganizationRole } from '../capabilities/organization-roles';

export interface JwtPayload {
  sub: string;
  email: string;
  activeOrgId?: string;
  role?: OrganizationRole;
  sessionVersion: number;
}

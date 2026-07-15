import { createHash } from 'node:crypto';
import type { OrganizationRole } from '../capabilities/organization-roles';
import type { UserEntity } from './entities/user.entity';

export interface SanitizedUser {
  id: string;
  email: string;
  name: string;
  phone?: string;
  status: string;
}

export function sanitizeUser(u: UserEntity): SanitizedUser {
  return { id: u.id, email: u.email, name: u.name, phone: u.phone, status: u.status };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function parseDurationMs(s: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(s);
  if (!m) return 7 * 24 * 3600 * 1000;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const mult: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * mult[unit];
}

export function isOrganizationRole(v: string): v is OrganizationRole {
  return [
    'org_owner','org_admin','inventory_manager','field_operator',
    'planner','planner_admin','client_viewer','client_admin','platform_admin',
  ].includes(v);
}

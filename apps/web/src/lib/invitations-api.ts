import { apiJson } from './api';
export interface Invitation {
  id: string;
  email: string;
  name: string;
  kind: 'account' | 'membership';
  accountType: string | null;
  organizationId: string | null;
  organizationName: string;
  organizationType: string;
  role: string;
  locale: 'en' | 'fr';
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
  expiresAt: string;
  createdAt: string;
  delivery: 'not_sent' | 'sent' | 'failed';
  initialOwner: boolean;
}
export interface InvitationOrganization {
  id: string;
  name: string;
  type: string;
  country: string;
  defaultCurrency: string;
  defaultLocale: string;
}
export const invitationRoles: Record<string, string[]> = {
  media_partner: ['org_owner', 'org_admin', 'inventory_manager', 'field_operator'],
  agency: ['org_owner', 'org_admin', 'planner', 'planner_admin'],
  brand: ['org_owner', 'org_admin', 'client_viewer', 'client_admin'],
  platform: ['org_owner', 'org_admin', 'platform_admin'],
};
export function invitationRole(role: string, fr = false) {
  const labels: Record<string, [string, string]> = {
    org_owner: ['Organization owner', 'Propriétaire'],
    org_admin: ['Organization admin', 'Administrateur'],
    inventory_manager: ['Inventory manager', 'Responsable inventaire'],
    field_operator: ['Field operator', 'Agent terrain'],
    planner: ['Planner', 'Planificateur'],
    planner_admin: ['Planning admin', 'Responsable planification'],
    client_viewer: ['Client viewer', 'Lecteur client'],
    client_admin: ['Client admin', 'Administrateur client'],
    platform_admin: ['Platform admin', 'Administrateur plateforme'],
  };
  return labels[role]?.[fr ? 1 : 0] ?? role;
}
export function adminInvitations(page = 1) {
  return apiJson<{ items: Invitation[]; total: number; page: number; limit: number }>(
    `/api/admin/invitations?page=${page}&limit=50`,
  );
}
export function invitationOrganizations(page = 1, search = '') {
  return apiJson<{ items: InvitationOrganization[]; total: number; page: number; limit: number }>(
    `/api/admin/invitations/organizations?page=${page}&limit=100&search=${encodeURIComponent(search)}`,
  );
}
export function hasAcceptedMembership(
  invite: Pick<Invitation, 'organizationId' | 'role'>,
  organizations: Array<{ organizationId: string; role: string }>,
): boolean {
  return (
    Boolean(invite.organizationId) &&
    organizations.some((o) => o.organizationId === invite.organizationId && o.role === invite.role)
  );
}
export function myInvitations() {
  return apiJson<{ items: Invitation[] }>('/api/invitations/me');
}

export function accountTypeLabel(type: string, fr = false) {
  const labels: Record<string, [string, string]> = {
    media_partner: ['Media partner', 'Partenaire média'],
    agency: ['Agency', 'Agence'],
    brand: ['Brand', 'Annonceur'],
  };
  return labels[type]?.[fr ? 1 : 0] ?? type;
}
export function invitationDetail(id: string) {
  return apiJson<Invitation>(`/api/invitations/${id}`);
}

// Local OrganizationRole union (mirrors @abonten/contracts). Kept in the API to avoid
// pulling packages/contracts into the API's rootDir (TS6059); the shared contract is
// still the source of truth for web/mobile.
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

export const ORGANIZATION_ROLE_VALUES: string[] = [
  'org_owner',
  'org_admin',
  'inventory_manager',
  'field_operator',
  'planner',
  'planner_admin',
  'client_viewer',
  'client_admin',
  'platform_admin',
];

/** Shared organization-type bounds; actor assignment rules remain in OrgsService. */
export const ASSIGNABLE_ROLES_BY_ORG_TYPE: Readonly<Record<string, readonly OrganizationRole[]>> = {
  media_partner: ['org_owner', 'org_admin', 'inventory_manager', 'field_operator'],
  agency: ['org_owner', 'org_admin', 'planner', 'planner_admin'],
  brand: ['org_owner', 'org_admin', 'client_viewer', 'client_admin'],
  platform: ['org_owner', 'org_admin', 'platform_admin'],
};

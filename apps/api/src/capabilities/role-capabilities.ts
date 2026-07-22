import type { OrganizationRole } from './organization-roles';
import { ALL_CAPABILITIES, Capability } from './capability.enum';

// Capabilities reserved for the platform_admin role only — tenant org_owner/org_admin
// never receive these, preventing privilege escalation via overrides or lifecycle.
export const PLATFORM_ONLY_CAPABILITIES: Capability[] = [
  Capability.PLATFORM_ADMIN,
  Capability.USER_MANAGE,
  Capability.AUDIT_VIEW,
  Capability.REFERENCE_DATA_MANAGE,
  Capability.MARKETPLACE_MANAGE,
  Capability.REPORT_MANAGE,
];

// Role -> default capability set (auth task spec).
export const ROLE_DEFAULT_CAPABILITIES: Record<OrganizationRole, Capability[]> = {
  // Platform-only capabilities are restricted to the platform_admin role; tenant
  // org_owner/org_admin do NOT get them (prevents lifecycle + override escalation).
  org_owner: ALL_CAPABILITIES.filter((c) => !PLATFORM_ONLY_CAPABILITIES.includes(c)),
  org_admin: ALL_CAPABILITIES.filter((c) => !PLATFORM_ONLY_CAPABILITIES.includes(c) && c !== Capability.BILLING_MANAGE),
  inventory_manager: [
    Capability.INVENTORY_CREATE,
    Capability.INVENTORY_EDIT,
    Capability.INVENTORY_DELETE,
    Capability.INVENTORY_VIEW,
    Capability.INVENTORY_BULK_IMPORT,
    Capability.BOOKING_APPROVE,
    Capability.POP_CAPTURE,
    Capability.POP_VIEW,
    Capability.POP_MANAGE,
    Capability.REPORT_VIEW,
    Capability.REPORT_EXPORT,
  ],
  field_operator: [Capability.POP_CAPTURE, Capability.INVENTORY_VIEW, Capability.BOOKING_VIEW],
  planner: [
    Capability.MARKETPLACE_VIEW,
    Capability.CAMPAIGN_CREATE,
    Capability.CAMPAIGN_EDIT,
    Capability.CAMPAIGN_VIEW,
    Capability.CAMPAIGN_EXPORT,
    Capability.KPI_ESTIMATE,
    Capability.BOOKING_REQUEST,
    Capability.BOOKING_VIEW,
    Capability.MONITORING_VIEW,
    Capability.REPORT_VIEW,
    Capability.REPORT_EXPORT,
    Capability.ISSUE_CREATE,
    Capability.ISSUE_VIEW,
  ],
  planner_admin: [
    Capability.MARKETPLACE_VIEW,
    Capability.CAMPAIGN_CREATE,
    Capability.CAMPAIGN_EDIT,
    Capability.CAMPAIGN_VIEW,
    Capability.CAMPAIGN_EXPORT,
    Capability.KPI_ESTIMATE,
    Capability.BOOKING_REQUEST,
    Capability.BOOKING_VIEW,
    Capability.MONITORING_VIEW,
    Capability.REPORT_VIEW,
    Capability.REPORT_EXPORT,
    Capability.ISSUE_CREATE,
    Capability.ISSUE_VIEW,
    Capability.MEMBERSHIP_MANAGE,
    Capability.ORG_SETTINGS_EDIT,
  ],
  client_viewer: [
    Capability.CAMPAIGN_VIEW,
    Capability.MONITORING_VIEW,
    Capability.POP_VIEW,
    Capability.ISSUE_VIEW,
    Capability.REPORT_VIEW,
    Capability.ISSUE_CREATE,
  ],
  client_admin: [
    Capability.CAMPAIGN_VIEW,
    Capability.MONITORING_VIEW,
    Capability.POP_VIEW,
    Capability.ISSUE_VIEW,
    Capability.REPORT_VIEW,
    Capability.ISSUE_CREATE,
    Capability.MEMBERSHIP_MANAGE,
    Capability.ORG_SETTINGS_EDIT,
  ],
  platform_admin: [
    Capability.PLATFORM_ADMIN,
    Capability.ORG_MANAGE,
    Capability.USER_MANAGE,
    Capability.AUDIT_VIEW,
    Capability.REFERENCE_DATA_MANAGE,
    Capability.MARKETPLACE_MANAGE,
    Capability.REPORT_MANAGE,
    Capability.INVENTORY_VIEW,
  ],
};

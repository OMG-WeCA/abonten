// Mirror of the server's org-type rule for billboard inventory: only
// media-partner organizations can create or manage sites (see
// apps/api/src/inventory/inventory.service.ts assertMediaPartnerOrg). The UI
// gates the Sites nav, list actions and registration on the same rule so
// agency/brand/platform accounts never walk into a form the server will 403.
export type SiteAccessInput = {
  capabilities: string[];
  orgType: string | undefined;
};

/** Show the Sites nav item and the organization's site list. */
export function canSeeSitesArea({ capabilities, orgType }: SiteAccessInput): boolean {
  return orgType === 'media_partner' && capabilities.includes('INVENTORY_VIEW');
}

/** Register or edit sites: the server requires INVENTORY_CREATE + INVENTORY_EDIT
 * on a media-partner organization (POST/PATCH guards + assertMediaPartnerOrg). */
export function canManageSites({ capabilities, orgType }: SiteAccessInput): boolean {
  return (
    orgType === 'media_partner' &&
    capabilities.includes('INVENTORY_CREATE') &&
    capabilities.includes('INVENTORY_EDIT')
  );
}
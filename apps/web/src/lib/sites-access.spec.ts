import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { canManageSites, canSeeSitesArea } from './sites-access';

// The UI must mirror the server rule: billboard inventory is managed only by
// media-partner organizations (assertMediaPartnerOrg), regardless of role
// capabilities granted inside agency/brand/platform organizations.
describe('sites access gating mirrors the server org-type rule', () => {
  it('shows the Sites area to media-partner members with INVENTORY_VIEW', () => {
    assert.equal(
      canSeeSitesArea({ capabilities: ['INVENTORY_VIEW'], orgType: 'media_partner' }),
      true,
    );
    assert.equal(
      canManageSites({ capabilities: ['INVENTORY_CREATE', 'INVENTORY_EDIT'], orgType: 'media_partner' }),
      true,
    );
  });

  it('hides the Sites area and registration from agency, brand and platform org owners', () => {
    for (const orgType of ['agency', 'brand', 'platform']) {
      // org_owner carries INVENTORY_VIEW/CREATE/EDIT in every org type, but the
      // server still 403s their site mutations — so the UI must not offer them.
      const caps = ['INVENTORY_VIEW', 'INVENTORY_CREATE', 'INVENTORY_EDIT'];
      assert.equal(canSeeSitesArea({ capabilities: caps, orgType }), false, orgType);
      assert.equal(canManageSites({ capabilities: caps, orgType }), false, orgType);
    }
  });

  it('keeps registration closed without both create and edit capabilities', () => {
    assert.equal(
      canManageSites({ capabilities: ['INVENTORY_CREATE'], orgType: 'media_partner' }),
      false,
    );
    assert.equal(
      canManageSites({ capabilities: ['INVENTORY_EDIT'], orgType: 'media_partner' }),
      false,
    );
  });

  it('treats an unknown organization type as not a media partner', () => {
    assert.equal(canSeeSitesArea({ capabilities: ['INVENTORY_VIEW'], orgType: undefined }), false);
    assert.equal(
      canManageSites({ capabilities: ['INVENTORY_CREATE', 'INVENTORY_EDIT'], orgType: undefined }),
      false,
    );
  });
});
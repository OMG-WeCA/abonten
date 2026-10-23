import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { hasAcceptedMembership } from './invitations-api';
test('lost acceptance response recovery requires the bound organization and role', () => {
  const invitation = { organizationId: 'coastline', role: 'inventory_manager' };
  assert.equal(
    hasAcceptedMembership(invitation, [{ organizationId: 'coastline', role: 'inventory_manager' }]),
    true,
  );
  assert.equal(
    hasAcceptedMembership(invitation, [{ organizationId: 'other', role: 'inventory_manager' }]),
    false,
  );
  assert.equal(
    hasAcceptedMembership(invitation, [{ organizationId: 'coastline', role: 'org_owner' }]),
    false,
  );
  assert.equal(hasAcceptedMembership(invitation, []), false);
});

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { IOidcProfile } from 'passport-azure-ad';
import type { DatabaseService } from '../common/database.service';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { MembershipEntity } from './entities/membership.entity';
import type { UserEntity } from './entities/user.entity';
import { MicrosoftAuthService } from './microsoft-auth.service';
import type { UserIdentityService } from './user-identity.service';

function createSubject(existingMembership?: MembershipEntity) {
  const user = {
    id: 'user-1',
    email: 'person@example.com',
    name: 'Person',
    status: 'active',
  } as UserEntity;
  const identityProfiles: unknown[] = [];
  const identities = {
    async findOrCreateFromMicrosoft(profile: unknown) {
      identityProfiles.push(profile);
      return user;
    },
  };
  const savedMemberships: MembershipEntity[] = [];
  const organizations = {
    async find() {
      return [
        {
          id: 'org-1',
          allowedEmailDomains: ['Example.COM'],
        } as OrganizationEntity,
      ];
    },
  };
  const memberships = {
    async findOne() {
      return existingMembership ?? null;
    },
    create(input: Partial<MembershipEntity>) {
      return { id: 'membership-1', ...input } as MembershipEntity;
    },
    async save(membership: MembershipEntity) {
      savedMemberships.push(membership);
      return membership;
    },
  };
  const db = {
    async repo(target: unknown) {
      if (target === OrganizationEntity) return organizations;
      if (target === MembershipEntity) return memberships;
      throw new Error('Unexpected repository');
    },
  };
  const cfg = { get: () => undefined } as unknown as ConfigService;
  const service = new MicrosoftAuthService(
    cfg,
    db as unknown as DatabaseService,
    identities as unknown as UserIdentityService,
  );
  return { service, user, identityProfiles, savedMemberships };
}

function profile(email: string): IOidcProfile {
  return {
    oid: 'microsoft-subject',
    displayName: 'Person',
    emails: [{ value: email }],
  } as unknown as IOidcProfile;
}

describe('MicrosoftAuthService identity and membership continuity', () => {
  it('uses the canonical identity service and preserves planner auto-linking', async () => {
    const { service, user, identityProfiles, savedMemberships } = createSubject();
    assert.equal(await service.findOrCreateFromMicrosoft(profile('PERSON@EXAMPLE.COM')), user);
    assert.deepEqual(identityProfiles, [
      {
        email: 'PERSON@EXAMPLE.COM',
        name: 'Person',
        subject: 'microsoft-subject',
      },
    ]);
    assert.equal(savedMemberships.length, 1);
    assert.equal(savedMemberships[0].role, 'planner');
    assert.equal(savedMemberships[0].status, 'active');
    assert.equal(savedMemberships[0].organizationId, 'org-1');
  });

  it('does not reactivate an existing revoked auto-link membership', async () => {
    const revoked = {
      id: 'membership-1',
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'planner',
      status: 'revoked',
    } as MembershipEntity;
    const { service, savedMemberships } = createSubject(revoked);

    await service.findOrCreateFromMicrosoft(profile('person@example.com'));
    assert.equal(savedMemberships.length, 0);
    assert.equal(revoked.status, 'revoked');
  });
});

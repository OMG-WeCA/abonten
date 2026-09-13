import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { DatabaseService } from '../common/database.service';
import type { EmailCodeService } from '../auth/email-code.service';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserEntity } from '../auth/entities/user.entity';
import type { UserIdentityService } from '../auth/user-identity.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { OrgsService } from './orgs.service';
import { OrganizationCreationRequestEntity } from './entities/organization-creation-request.entity';

class FakeMemberships {
  readonly rows = new Map<string, MembershipEntity>();
  saveCount = 0;
  onSave?: () => void;

  async findOne({
    where,
  }: {
    where: { userId: string; organizationId: string; status?: string };
  }): Promise<MembershipEntity | null> {
    const row = this.rows.get(`${where.userId}:${where.organizationId}`) ?? null;
    return row && (!where.status || row.status === where.status) ? row : null;
  }

  async count({
    where,
  }: {
    where: { organizationId: string; role?: string; status?: string };
  }): Promise<number> {
    return [...this.rows.values()].filter(
      (row) =>
        row.organizationId === where.organizationId &&
        (!where.role || row.role === where.role) &&
        (!where.status || row.status === where.status),
    ).length;
  }

  create(input: Pick<MembershipEntity, 'userId' | 'organizationId' | 'role' | 'status'>) {
    return { ...input, id: `membership-${this.rows.size + 1}` } as MembershipEntity;
  }

  async save(membership: MembershipEntity): Promise<MembershipEntity> {
    this.saveCount += 1;
    this.onSave?.();
    this.rows.set(`${membership.userId}:${membership.organizationId}`, membership);
    return membership;
  }
}

function createSubject(existing?: { role: string; status: string }) {
  const memberships = new FakeMemberships();
  const user = {
    id: 'user-1',
    email: 'person@example.com',
    name: 'Person',
    status: 'active',
  } as UserEntity;
  memberships.rows.set(
    'actor-1:org-1',
    memberships.create({
      userId: 'actor-1',
      organizationId: 'org-1',
      role: 'org_owner',
      status: 'active',
    }),
  );
  if (existing) {
    memberships.rows.set(
      'user-1:org-1',
      memberships.create({
        userId: 'user-1',
        organizationId: 'org-1',
        role: existing.role,
        status: existing.status,
      }),
    );
  }

  const requestedEmails: string[] = [];
  const deliveryOutcomes: Array<Error | undefined> = [];
  const auditActions: string[] = [];
  const auditActors: string[] = [];
  const events: string[] = [];
  memberships.onSave = () => events.push('membership.saved');
  const emailCode = {
    async request(email: string) {
      requestedEmails.push(email);
      events.push('email.requested');
      const outcome = deliveryOutcomes.shift();
      if (outcome) throw outcome;
      return { accepted: true as const };
    },
  };
  const identities = {
    async findOrCreateByEmail(email: string) {
      user.email = email;
      return user;
    },
  };
  const repositoryFor = (target: unknown) => {
    if (target === MembershipEntity) return memberships;
    if (target === OrganizationEntity) {
      return {
        async findOne() {
          return { id: 'org-1', type: 'agency', status: 'active' } as OrganizationEntity;
        },
      };
    }
    if (target === UserCapabilityOverrideEntity) {
      return {
        async find() {
          return [];
        },
      };
    }
    if (target === AuditLogEntity) {
      return {
        create(value: { action: string; actorUserId?: string }) {
          return value;
        },
        async save(value: { action: string; actorUserId?: string }) {
          auditActions.push(value.action);
          auditActors.push(value.actorUserId ?? '');
          events.push('audit.saved');
          return value;
        },
      };
    }
    throw new Error('Unexpected repository');
  };
  const db = {
    async repo(target: unknown) {
      return repositoryFor(target);
    },
    async transaction<T>(work: (manager: { getRepository: typeof repositoryFor }) => Promise<T>) {
      return work({ getRepository: repositoryFor });
    },
  };
  const service = new OrgsService(
    db as unknown as DatabaseService,
    emailCode as EmailCodeService,
    identities as unknown as UserIdentityService,
    new CapabilityResolverService(),
  );
  return {
    service,
    memberships,
    requestedEmails,
    deliveryOutcomes,
    auditActions,
    auditActors,
    events,
  };
}

function createRolePolicySubject(options: {
  actorRole: string;
  targetRole?: string;
  targetId?: string;
  orgType?: string;
}) {
  const memberships = new FakeMemberships();
  const targetId = options.targetId ?? 'target-1';
  memberships.rows.set(
    'actor-1:org-1',
    memberships.create({
      userId: 'actor-1',
      organizationId: 'org-1',
      role: options.actorRole,
      status: 'active',
    }),
  );
  if (targetId !== 'actor-1') {
    memberships.rows.set(
      `${targetId}:org-1`,
      memberships.create({
        userId: targetId,
        organizationId: 'org-1',
        role: options.targetRole ?? 'planner',
        status: 'active',
      }),
    );
  }

  const auditActions: string[] = [];
  const repositoryFor = (target: unknown) => {
    if (target === MembershipEntity) return memberships;
    if (target === OrganizationEntity) {
      return {
        async findOne() {
          return {
            id: 'org-1',
            type: options.orgType ?? 'agency',
            status: 'active',
          } as OrganizationEntity;
        },
      };
    }
    if (target === UserCapabilityOverrideEntity) {
      return {
        async find() {
          return [];
        },
      };
    }
    if (target === AuditLogEntity) {
      return {
        create(value: { action: string }) {
          return value;
        },
        async save(value: { action: string }) {
          auditActions.push(value.action);
          return value;
        },
      };
    }
    throw new Error('Unexpected repository');
  };
  const db = {
    async repo(target: unknown) {
      return repositoryFor(target);
    },
    async transaction<T>(work: (manager: { getRepository: typeof repositoryFor }) => Promise<T>) {
      return work({ getRepository: repositoryFor });
    },
  };
  const service = new OrgsService(
    db as unknown as DatabaseService,
    {} as EmailCodeService,
    {} as UserIdentityService,
    new CapabilityResolverService(),
  );
  return { service, memberships, auditActions, targetId };
}

function createAtomicOrganizationSubject(failAt?: 'organization' | 'membership' | 'audit') {
  const committed = {
    organizations: [] as OrganizationEntity[],
    memberships: [] as MembershipEntity[],
    audits: [] as Array<{ action: string; actorUserId: string }>,
  };
  const db = {
    async repo() {
      throw new Error('organization onboarding writes must use the transaction manager');
    },
    async transaction<T>(
      work: (manager: { getRepository: (target: unknown) => unknown }) => Promise<T>,
    ) {
      const staged = {
        organizations: [] as OrganizationEntity[],
        memberships: [] as MembershipEntity[],
        audits: [] as Array<{ action: string; actorUserId: string }>,
      };
      const repositoryFor = (target: unknown) => {
        if (target === OrganizationEntity) {
          return {
            create(value: Partial<OrganizationEntity>) {
              return { id: 'org-new', ...value } as OrganizationEntity;
            },
            async save(value: OrganizationEntity) {
              if (failAt === 'organization') throw new Error('organization write failed');
              staged.organizations.push(value);
              return value;
            },
          };
        }
        if (target === MembershipEntity) {
          return {
            create(value: Partial<MembershipEntity>) {
              return { id: 'membership-new', ...value } as MembershipEntity;
            },
            async save(value: MembershipEntity) {
              if (failAt === 'membership') throw new Error('membership write failed');
              staged.memberships.push(value);
              return value;
            },
          };
        }
        if (target === AuditLogEntity) {
          return {
            create(value: { action: string; actorUserId: string }) {
              return value;
            },
            async save(value: { action: string; actorUserId: string }) {
              if (failAt === 'audit') throw new Error('audit write failed');
              staged.audits.push(value);
              return value;
            },
          };
        }
        throw new Error('Unexpected repository');
      };
      const result = await work({ getRepository: repositoryFor });
      committed.organizations.push(...staged.organizations);
      committed.memberships.push(...staged.memberships);
      committed.audits.push(...staged.audits);
      return result;
    },
  };
  const service = new OrgsService(
    db as unknown as DatabaseService,
    {} as EmailCodeService,
    {} as UserIdentityService,
    new CapabilityResolverService(),
  );
  return { service, committed };
}

function createIdempotentOrganizationSubject() {
  const organizations: OrganizationEntity[] = [];
  const memberships: MembershipEntity[] = [];
  const audits: Array<{ action: string; actorUserId: string }> = [];
  const requests: OrganizationCreationRequestEntity[] = [];
  let transactionTail = Promise.resolve();

  const repositoryFor = (target: unknown) => {
    if (target === UserEntity) {
      return {
        async findOne() {
          return { id: 'owner-1', status: 'active' } as UserEntity;
        },
      };
    }
    if (target === OrganizationEntity) {
      return {
        create(value: Partial<OrganizationEntity>) {
          return { id: `org-${organizations.length + 1}`, ...value } as OrganizationEntity;
        },
        async save(value: OrganizationEntity) {
          organizations.push(value);
          return value;
        },
        async findOne({ where }: { where: { id: string } }) {
          return organizations.find((organization) => organization.id === where.id) ?? null;
        },
      };
    }
    if (target === MembershipEntity) {
      return {
        create(value: Partial<MembershipEntity>) {
          return { id: `membership-${memberships.length + 1}`, ...value } as MembershipEntity;
        },
        async save(value: MembershipEntity) {
          memberships.push(value);
          return value;
        },
        async findOne({
          where,
        }: {
          where: { userId: string; organizationId: string; status: string };
        }) {
          return (
            memberships.find(
              (membership) =>
                membership.userId === where.userId &&
                membership.organizationId === where.organizationId &&
                membership.status === where.status,
            ) ?? null
          );
        },
      };
    }
    if (target === AuditLogEntity) {
      return {
        create(value: { action: string; actorUserId: string }) {
          return value;
        },
        async save(value: { action: string; actorUserId: string }) {
          audits.push(value);
          return value;
        },
      };
    }
    if (target === OrganizationCreationRequestEntity) {
      return {
        create(value: Partial<OrganizationCreationRequestEntity>) {
          return {
            id: `request-${requests.length + 1}`,
            ...value,
          } as OrganizationCreationRequestEntity;
        },
        async save(value: OrganizationCreationRequestEntity) {
          requests.push(value);
          return value;
        },
        async findOne({ where }: { where: { userId: string; idempotencyKey: string } }) {
          return (
            requests.find(
              (request) =>
                request.userId === where.userId && request.idempotencyKey === where.idempotencyKey,
            ) ?? null
          );
        },
      };
    }
    throw new Error('Unexpected repository');
  };
  const db = {
    async repo(target: unknown) {
      return repositoryFor(target);
    },
    async transaction<T>(work: (manager: { getRepository: typeof repositoryFor }) => Promise<T>) {
      const previous = transactionTail;
      let release: () => void = () => undefined;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await work({ getRepository: repositoryFor });
      } finally {
        release();
      }
    },
  };
  const service = new OrgsService(
    db as unknown as DatabaseService,
    {} as EmailCodeService,
    {} as UserIdentityService,
    new CapabilityResolverService(),
  );
  return { service, organizations, memberships, audits, requests };
}

function createConcurrentOwnerSubject() {
  const memberships = new FakeMemberships();
  for (const userId of ['owner-a', 'owner-b']) {
    memberships.rows.set(
      `${userId}:org-1`,
      memberships.create({
        userId,
        organizationId: 'org-1',
        role: 'org_owner',
        status: 'active',
      }),
    );
  }
  let lockCount = 0;
  const repositoryFor = (target: unknown) => {
    if (target === MembershipEntity) return memberships;
    if (target === OrganizationEntity) {
      return {
        async findOne(options: { lock?: { mode?: string } }) {
          if (options.lock?.mode === 'pessimistic_write') lockCount += 1;
          return { id: 'org-1', type: 'agency', status: 'active' } as OrganizationEntity;
        },
      };
    }
    if (target === UserCapabilityOverrideEntity) {
      return {
        async find() {
          return [];
        },
      };
    }
    if (target === AuditLogEntity) {
      return {
        create(value: { action: string }) {
          return value;
        },
        async save(value: { action: string }) {
          return value;
        },
      };
    }
    throw new Error('Unexpected repository');
  };
  let transactionTail = Promise.resolve();
  const db = {
    async repo(target: unknown) {
      return repositoryFor(target);
    },
    async transaction<T>(work: (manager: { getRepository: typeof repositoryFor }) => Promise<T>) {
      const previous = transactionTail;
      let release: () => void = () => undefined;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await work({ getRepository: repositoryFor });
      } finally {
        release();
      }
    },
  };
  const service = new OrgsService(
    db as unknown as DatabaseService,
    {} as EmailCodeService,
    {} as UserIdentityService,
    new CapabilityResolverService(),
  );
  return { service, memberships, lockCount: () => lockCount };
}

async function expectConflict(
  action: () => Promise<unknown>,
  code: string,
): Promise<Record<string, unknown>> {
  let response: Record<string, unknown> | undefined;
  await assert.rejects(action, (error: unknown) => {
    if (!(error instanceof ConflictException)) return false;
    response = error.getResponse() as Record<string, unknown>;
    return response.code === code;
  });
  assert.ok(response);
  return response;
}

describe('OrgsService atomic organization onboarding', () => {
  const input = {
    name: 'New Agency',
    type: 'agency' as const,
    country: 'Ghana',
    defaultCurrency: 'GHS' as const,
  };

  it('rolls back every write when organization, owner, or audit persistence fails', async () => {
    for (const stage of ['organization', 'membership', 'audit'] as const) {
      const subject = createAtomicOrganizationSubject(stage);
      await assert.rejects(() => subject.service.createOrg('owner-1', input));
      assert.equal(subject.committed.organizations.length, 0, `${stage}: organization`);
      assert.equal(subject.committed.memberships.length, 0, `${stage}: membership`);
      assert.equal(subject.committed.audits.length, 0, `${stage}: audit`);
    }
  });

  it('commits the organization, owner membership, and audit together', async () => {
    const subject = createAtomicOrganizationSubject();
    const organization = await subject.service.createOrg('owner-1', input);
    assert.equal(organization.id, 'org-new');
    assert.equal(subject.committed.organizations.length, 1);
    assert.equal(subject.committed.memberships[0]?.organizationId, organization.id);
    assert.equal(subject.committed.memberships[0]?.role, 'org_owner');
    assert.equal(subject.committed.audits[0]?.action, 'organization.created');
    assert.equal(subject.committed.audits[0]?.actorUserId, 'owner-1');
  });

  it('returns one committed organization for repeated and concurrent onboarding requests', async () => {
    const subject = createIdempotentOrganizationSubject();
    const resumableInput = {
      ...input,
      onboardingKey: '11111111-2222-4333-8444-555555555555',
    };

    const [first, concurrentRetry] = await Promise.all([
      subject.service.createOrg('owner-1', resumableInput),
      subject.service.createOrg('owner-1', resumableInput),
    ]);
    const laterRetry = await subject.service.createOrg('owner-1', resumableInput);

    assert.equal(first.id, concurrentRetry.id);
    assert.equal(first.id, laterRetry.id);
    assert.equal(subject.organizations.length, 1);
    assert.equal(subject.memberships.length, 1);
    assert.equal(subject.audits.length, 1);
    assert.equal(subject.requests.length, 1);
  });
});

describe('OrgsService membership role policy', () => {
  it('blocks an org_admin from promoting themself or another member to org_owner', async () => {
    const selfPromotion = createRolePolicySubject({
      actorRole: 'org_admin',
      targetId: 'actor-1',
    });
    await assert.rejects(
      () => selfPromotion.service.updateMembership('org-1', 'actor-1', 'org_owner', 'actor-1'),
      ForbiddenException,
    );
    assert.equal(selfPromotion.memberships.rows.get('actor-1:org-1')?.role, 'org_admin');

    const otherPromotion = createRolePolicySubject({
      actorRole: 'org_admin',
      targetRole: 'planner',
    });
    await assert.rejects(
      () =>
        otherPromotion.service.updateMembership(
          'org-1',
          otherPromotion.targetId,
          'org_owner',
          'actor-1',
        ),
      ForbiddenException,
    );
    assert.equal(
      otherPromotion.memberships.rows.get(`${otherPromotion.targetId}:org-1`)?.role,
      'planner',
    );

    const ownerTarget = createRolePolicySubject({
      actorRole: 'org_admin',
      targetRole: 'org_owner',
    });
    await assert.rejects(
      () =>
        ownerTarget.service.updateMembership('org-1', ownerTarget.targetId, 'planner', 'actor-1'),
      ForbiddenException,
    );
    assert.equal(
      ownerTarget.memberships.rows.get(`${ownerTarget.targetId}:org-1`)?.role,
      'org_owner',
    );
  });

  it('enforces organization-role compatibility and preserves a last owner', async () => {
    const incompatible = createRolePolicySubject({
      actorRole: 'org_owner',
      targetRole: 'planner',
    });
    await assert.rejects(
      () =>
        incompatible.service.updateMembership(
          'org-1',
          incompatible.targetId,
          'field_operator',
          'actor-1',
        ),
      BadRequestException,
    );

    const lastOwner = createRolePolicySubject({
      actorRole: 'org_owner',
      targetId: 'actor-1',
    });
    await assert.rejects(
      () => lastOwner.service.updateMembership('org-1', 'actor-1', 'planner', 'actor-1'),
      ForbiddenException,
    );
    assert.equal(lastOwner.memberships.rows.get('actor-1:org-1')?.role, 'org_owner');
  });

  it('serializes concurrent owner demotion and revocation so one owner remains', async () => {
    const subject = createConcurrentOwnerSubject();
    const outcomes = await Promise.allSettled([
      subject.service.updateMembership('org-1', 'owner-a', 'org_admin', 'owner-a'),
      subject.service.removeMember('org-1', 'owner-b', 'owner-b'),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected');
    assert.ok(rejected.reason instanceof ForbiddenException);
    assert.equal(
      [...subject.memberships.rows.values()].filter(
        (membership) => membership.status === 'active' && membership.role === 'org_owner',
      ).length,
      1,
    );
    assert.equal(subject.lockCount(), 2);
  });

  it('allows an owner to make an in-scope role change and audits it', async () => {
    const subject = createRolePolicySubject({
      actorRole: 'org_owner',
      targetRole: 'planner',
    });
    const result = await subject.service.updateMembership(
      'org-1',
      subject.targetId,
      'planner_admin',
      'actor-1',
    );
    assert.equal(result.role, 'planner_admin');
    assert.equal(subject.memberships.rows.get(`${subject.targetId}:org-1`)?.role, 'planner_admin');
    assert.deepEqual(subject.auditActions, ['organization.membership.role_updated']);
  });
});

describe('OrgsService invitation delivery semantics', () => {
  it('reports persisted access separately from SMTP failure and retries without role changes', async () => {
    const {
      service,
      memberships,
      requestedEmails,
      deliveryOutcomes,
      auditActions,
      auditActors,
      events,
    } = createSubject();
    deliveryOutcomes.push(new ServiceUnavailableException('SMTP unavailable'));

    const failed = await service.invite(
      'org-1',
      { email: ' Person@Example.com ', role: 'planner' },
      'actor-1',
    );
    assert.deepEqual(failed.membership, { status: 'active', change: 'created' });
    assert.deepEqual(failed.delivery, {
      status: 'failed',
      reason: 'temporarily_unavailable',
      retryable: true,
      retryPath: '/api/orgs/org-1/invite',
    });
    assert.equal(memberships.rows.get('user-1:org-1')?.role, 'planner');
    assert.deepEqual(auditActions, ['organization.membership.created']);
    assert.deepEqual(auditActors, ['actor-1']);
    assert.deepEqual(events, ['membership.saved', 'audit.saved', 'email.requested']);

    const retried = await service.invite(
      'org-1',
      { email: 'person@example.com', role: 'planner' },
      'actor-1',
    );
    assert.deepEqual(retried.membership, { status: 'active', change: 'unchanged' });
    assert.deepEqual(retried.delivery, { status: 'sent' });
    assert.equal(memberships.saveCount, 1);
    assert.deepEqual(auditActions, ['organization.membership.created']);
    assert.deepEqual(requestedEmails, ['person@example.com', 'person@example.com']);
  });

  it('reports rate-limit and Redis delivery failures without undoing membership persistence', async () => {
    const rateLimited = createSubject();
    rateLimited.deliveryOutcomes.push(
      new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS),
    );
    const limitedResult = await rateLimited.service.invite(
      'org-1',
      { email: 'person@example.com', role: 'planner' },
      'actor-1',
    );
    assert.equal(limitedResult.membership.change, 'created');
    assert.equal(limitedResult.delivery.status, 'failed');
    if (limitedResult.delivery.status === 'failed') {
      assert.equal(limitedResult.delivery.reason, 'rate_limited');
    }

    const redisUnavailable = createSubject();
    redisUnavailable.deliveryOutcomes.push(
      new ServiceUnavailableException('Sign-in is temporarily unavailable'),
    );
    const unavailableResult = await redisUnavailable.service.invite(
      'org-1',
      { email: 'person@example.com', role: 'planner' },
      'actor-1',
    );
    assert.equal(unavailableResult.membership.change, 'created');
    assert.equal(unavailableResult.delivery.status, 'failed');
    if (unavailableResult.delivery.status === 'failed') {
      assert.equal(unavailableResult.delivery.reason, 'temporarily_unavailable');
    }
  });

  it('does not change an active membership role while retrying delivery', async () => {
    const { service, memberships, requestedEmails } = createSubject({
      role: 'client_viewer',
      status: 'active',
    });

    await expectConflict(
      () =>
        service.invite('org-1', { email: 'person@example.com', role: 'client_admin' }, 'actor-1'),
      'MEMBERSHIP_ROLE_CONFLICT',
    );
    assert.equal(memberships.rows.get('user-1:org-1')?.role, 'client_viewer');
    assert.equal(memberships.saveCount, 0);
    assert.equal(requestedEmails.length, 0);
  });

  it('does not reactivate a revoked membership while retrying delivery', async () => {
    const { service, memberships, requestedEmails } = createSubject({
      role: 'planner',
      status: 'revoked',
    });

    await expectConflict(
      () => service.invite('org-1', { email: 'person@example.com', role: 'planner' }, 'actor-1'),
      'MEMBERSHIP_REVOKED',
    );
    assert.equal(memberships.rows.get('user-1:org-1')?.status, 'revoked');
    assert.equal(memberships.saveCount, 0);
    assert.equal(requestedEmails.length, 0);
  });
});

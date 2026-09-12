import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { DatabaseService } from '../common/database.service';
import type { EmailCodeService } from '../auth/email-code.service';
import { MembershipEntity } from '../auth/entities/membership.entity';
import type { UserEntity } from '../auth/entities/user.entity';
import type { UserIdentityService } from '../auth/user-identity.service';
import type { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { OrgsService } from './orgs.service';

class FakeMemberships {
  readonly rows = new Map<string, MembershipEntity>();
  saveCount = 0;

  async findOne({
    where,
  }: {
    where: { userId: string; organizationId: string };
  }): Promise<MembershipEntity | null> {
    return this.rows.get(`${where.userId}:${where.organizationId}`) ?? null;
  }

  create(input: Pick<MembershipEntity, 'userId' | 'organizationId' | 'role' | 'status'>) {
    return { ...input, id: `membership-${this.rows.size + 1}` } as MembershipEntity;
  }

  async save(membership: MembershipEntity): Promise<MembershipEntity> {
    this.saveCount += 1;
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
  const emailCode = {
    async request(email: string) {
      requestedEmails.push(email);
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
  const db = {
    async repo(target: unknown) {
      assert.equal(target, MembershipEntity);
      return memberships;
    },
  };
  const service = new OrgsService(
    db as unknown as DatabaseService,
    emailCode as EmailCodeService,
    identities as unknown as UserIdentityService,
    {} as CapabilityResolverService,
  );
  return { service, memberships, requestedEmails, deliveryOutcomes };
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

describe('OrgsService invitation delivery semantics', () => {
  it('reports persisted access separately from SMTP failure and retries without role changes', async () => {
    const { service, memberships, requestedEmails, deliveryOutcomes } = createSubject();
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

    const retried = await service.invite(
      'org-1',
      { email: 'person@example.com', role: 'planner' },
      'actor-1',
    );
    assert.deepEqual(retried.membership, { status: 'active', change: 'unchanged' });
    assert.deepEqual(retried.delivery, { status: 'sent' });
    assert.equal(memberships.saveCount, 1);
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

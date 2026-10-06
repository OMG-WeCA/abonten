import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PlanningDraftEntity } from '../common/entities/planning-draft.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { DatabaseService } from '../common/database.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { PlanningDraftsService } from './planning-drafts.service';
import { PersonalPlanningDrafts1760000004000 } from '../migrations/1760000004000-PersonalPlanningDrafts';

const url = process.env.POSTGRES_INTEGRATION_URL;
const actor = {
  userId: 'd13ac133-12a8-435f-9ca5-ecc7d048f28b',
  organizationId: '2b119507-45ca-4ce4-a7e5-bc5112c147cc',
};
const otherUser = '193ca117-e868-4e49-ac8d-6f2f0c00acbd';
const otherOrg = '3990d6a3-681c-4969-b674-62be48c81fb2';
const draft = () => ({
  version: 1,
  window: { startDate: '2026-12-01', endDate: '2026-12-15' },
  country: 'Nigeria',
  query: 'Synthetic private query',
  format: '',
  budget: '',
  currency: 'NGN',
  faces: [{ siteId: randomUUID(), faceId: randomUUID() }],
});
const create = () => ({ name: 'Synthetic draft', draft: draft(), clientRequestId: randomUUID() });

async function withSchema(
  work: (db: DataSource, service: PlanningDraftsService, schema: string) => Promise<void>,
  poolSize = 4,
) {
  const schema = `personal_draft_${randomUUID().replaceAll('-', '')}`;
  const db = new DataSource({
    type: 'postgres',
    url,
    schema,
    entities: [
      PlanningDraftEntity,
      OrganizationEntity,
      AuditLogEntity,
      MembershipEntity,
      UserEntity,
      UserCapabilityOverrideEntity,
    ],
    synchronize: false,
    extra: {
      max: poolSize,
      connectionTimeoutMillis: 1500,
      options: `-c search_path=${schema},public`,
    },
  });
  await db.initialize();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    // Only this disposable schema is synchronized; production always runs migrations.
    await db.synchronize();
    await db.query('DROP TABLE personal_planning_drafts');
    const runner = db.createQueryRunner();
    try {
      await new PersonalPlanningDrafts1760000004000().up(runner);
    } finally {
      await runner.release();
    }
    for (const id of [actor.organizationId, otherOrg])
      await db.getRepository(OrganizationEntity).save({
        id,
        name: 'Synthetic test agency',
        type: 'agency',
        status: 'active',
        country: 'Nigeria',
      });
    for (const id of [actor.userId, otherUser])
      await db
        .getRepository(UserEntity)
        .save({ id, email: `${id}@example.test`, name: 'Synthetic planner', status: 'active' });
    for (const organizationId of [actor.organizationId, otherOrg])
      for (const userId of [actor.userId, otherUser])
        await db
          .getRepository(MembershipEntity)
          .save({ userId, organizationId, role: 'planner', status: 'active' });
    await work(
      db,
      new PlanningDraftsService(new DatabaseService(db), new CapabilityResolverService()),
      schema,
    );
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.destroy();
  }
}

describe('real PostgreSQL personal draft persistence', { skip: !url }, () => {
  it('serializes simultaneous retries, scopes reads and writes, and detects concurrent stale revisions', async () => {
    await withSchema(async (db, service) => {
      const input = create();
      const [first, replay] = await Promise.all([
        service.create(actor, input),
        service.create(actor, input),
      ]);
      assert.equal(first!.id, replay!.id);
      assert.equal((await service.list(actor)).items.length, 1);
      assert.deepEqual((await service.list({ ...actor, userId: otherUser })).items, []);
      assert.deepEqual((await service.list({ ...actor, organizationId: otherOrg })).items, []);
      for (const foreign of [
        { ...actor, userId: otherUser },
        { ...actor, organizationId: otherOrg },
      ]) {
        await assert.rejects(service.get(foreign, first!.id), NotFoundException);
        await assert.rejects(
          service.update(foreign, first!.id, { name: 'Forged', draft: input.draft, revision: 1 }),
          NotFoundException,
        );
      }
      const updates = await Promise.allSettled([
        service.update(actor, first!.id, { name: 'First edit', draft: input.draft, revision: 1 }),
        service.update(actor, first!.id, { name: 'Second edit', draft: input.draft, revision: 1 }),
      ]);
      assert.equal(updates.filter((item) => item.status === 'fulfilled').length, 1);
      const rejected = updates.find((item) => item.status === 'rejected');
      assert.ok(rejected?.status === 'rejected' && rejected.reason instanceof ConflictException);
      assert.equal(
        (rejected.reason.getResponse() as { code: string }).code,
        'DRAFT_REVISION_CONFLICT',
      );
      assert.equal((await service.get(actor, first!.id)).revision, 2);
      assert.equal(
        (await service.create(actor, input)).revision,
        2,
        'uncertain create retry never overwrites subsequent edits',
      );
      await assert.rejects(
        service.create(actor, { ...input, name: 'Changed request' }),
        ConflictException,
      );
      const audits = await db.getRepository(AuditLogEntity).find({ order: { createdAt: 'ASC' } });
      assert.equal(audits.length, 2);
      assert.deepEqual(
        audits.map((item) => item.after),
        [{ revision: 1 }, { revision: 2 }],
      );
      assert.equal(JSON.stringify(audits).includes(input.draft.query), false);
      assert.equal(JSON.stringify(audits).includes(input.name), false);
      assert.equal(audits[0]!.actorOrgId, actor.organizationId);
      assert.equal(audits[0]!.actorUserId, actor.userId);
      await assert.rejects(
        db.query('UPDATE audit_logs SET action = $1 WHERE id = $2', ['modified', audits[0]!.id]),
        /append-only/,
      );
      await assert.rejects(
        db.query('DELETE FROM audit_logs WHERE id = $1', [audits[0]!.id]),
        /append-only/,
      );
    });
  });
  it(
    'rechecks agency status, user status, membership and capability revocation inside a one-connection transaction',
    { timeout: 12000 },
    async () => {
      await withSchema(async (db, service) => {
        const input = create();
        const saved = await service.create(actor, input);
        const denyAll = async () => {
          await assert.rejects(service.list(actor), ForbiddenException);
          await assert.rejects(service.get(actor, saved.id), ForbiddenException);
          await assert.rejects(service.create(actor, create()), ForbiddenException);
          await assert.rejects(
            service.update(actor, saved.id, { name: input.name, draft: input.draft, revision: 1 }),
            ForbiddenException,
          );
        };
        await db.query('UPDATE organizations SET type = $1 WHERE id = $2', [
          'brand',
          actor.organizationId,
        ]);
        await db.query(
          'UPDATE memberships SET role = $1 WHERE user_id = $2 AND organization_id = $3',
          ['org_owner', actor.userId, actor.organizationId],
        );
        await denyAll();
        await db.query('UPDATE organizations SET type = $1, status = $2 WHERE id = $3', [
          'agency',
          'suspended',
          actor.organizationId,
        ]);
        await denyAll();
        await db.query('UPDATE organizations SET status = $1 WHERE id = $2', [
          'active',
          actor.organizationId,
        ]);
        await db.query(
          'UPDATE memberships SET status = $1 WHERE user_id = $2 AND organization_id = $3',
          ['suspended', actor.userId, actor.organizationId],
        );
        await denyAll();
        await db.query(
          'UPDATE memberships SET status = $1 WHERE user_id = $2 AND organization_id = $3',
          ['active', actor.userId, actor.organizationId],
        );
        for (const capability of ['MARKETPLACE_VIEW', 'CAMPAIGN_CREATE']) {
          await db.getRepository(UserCapabilityOverrideEntity).save({
            userId: actor.userId,
            organizationId: actor.organizationId,
            capability,
            action: 'revoke',
          });
          await denyAll();
          await db.query('DELETE FROM user_capability_overrides');
        }
        await db.query('UPDATE users SET status = $1 WHERE id = $2', ['suspended', actor.userId]);
        await denyAll();
        await db.query('UPDATE users SET status = $1 WHERE id = $2', ['active', actor.userId]);
        assert.equal(
          (
            await service.update(actor, saved.id, {
              name: 'Recovered',
              draft: input.draft,
              revision: 1,
            })
          ).revision,
          2,
        );
        assert.equal((await service.list(actor)).items.length, 1);
      }, 1);
    },
  );
  it('atomically rolls back creates and updates when audit persistence fails, retaining safe retry', async () => {
    await withSchema(async (db, service) => {
      const input = create();
      await db.query(
        `ALTER TABLE audit_logs ADD CONSTRAINT simulated_audit_failure CHECK (action <> 'planning.draft.created')`,
      );
      await assert.rejects(service.create(actor, input));
      assert.equal((await service.list(actor)).items.length, 0);
      assert.equal(await db.getRepository(AuditLogEntity).count(), 0);
      await db.query('ALTER TABLE audit_logs DROP CONSTRAINT simulated_audit_failure');
      const saved = await service.create(actor, input);
      await db.query(
        `ALTER TABLE audit_logs ADD CONSTRAINT simulated_audit_failure CHECK (action <> 'planning.draft.updated')`,
      );
      await assert.rejects(
        service.update(actor, saved.id, {
          name: 'Must rollback',
          draft: { ...input.draft, budget: '50000' },
          revision: 1,
        }),
      );
      assert.deepEqual(await service.get(actor, saved.id), saved);
      assert.equal(await db.getRepository(AuditLogEntity).count(), 1);
      await db.query('ALTER TABLE audit_logs DROP CONSTRAINT simulated_audit_failure');
      assert.equal(
        (
          await service.update(actor, saved.id, {
            name: 'Successful retry',
            draft: input.draft,
            revision: 1,
          })
        ).revision,
        2,
      );
    });
  });
  it('enforces the per-user/org quota under concurrent creation, while replay and independent users still work', async () => {
    await withSchema(async (db, service, schema) => {
      let last = create();
      for (let i = 0; i < 29; i++) {
        last = create();
        await service.create(actor, last);
      }
      const attempts = await Promise.allSettled([
        service.create(actor, create()),
        service.create(actor, create()),
      ]);
      assert.equal(attempts.filter((item) => item.status === 'fulfilled').length, 1);
      assert.equal((await service.list(actor)).items.length, 30);
      assert.equal((await service.create(actor, last)).revision, 1);
      const other = await service.create({ ...actor, userId: otherUser }, last);
      assert.equal((await service.list({ ...actor, userId: otherUser })).items[0]!.id, other.id);
      assert.equal(await db.getRepository(AuditLogEntity).count(), 31);
      const [publicBefore] = await db.query(
        "SELECT to_regclass('public.personal_planning_drafts')::oid AS table_oid",
      );
      const runner = db.createQueryRunner();
      try {
        await new PersonalPlanningDrafts1760000004000().down(runner);
      } finally {
        await runner.release();
      }
      assert.equal(
        (
          await db.query('SELECT to_regclass($1) AS table_name', [
            `${schema}.personal_planning_drafts`,
          ])
        )[0].table_name,
        null,
      );
      const [publicAfter] = await db.query(
        "SELECT to_regclass('public.personal_planning_drafts')::oid AS table_oid",
      );
      assert.equal(
        publicAfter.table_oid,
        publicBefore.table_oid,
        'isolated migration reversal preserves the existing public table',
      );
      assert.equal(
        await db.getRepository(AuditLogEntity).count(),
        31,
        'migration reversal retains historical audits',
      );
    });
  });
});

import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { ENTITIES } from '../common/entities';
import { DatabaseService } from '../common/database.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { InventoryService } from '../inventory/inventory.service';
import { GeographicContextService } from '../enrichment/geographic-context.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import type { StorageService } from '../common/storage.service';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { PlanningService } from '../planning/planning.service';
import { PlanningDraftsService } from '../planning/planning-drafts.service';
import { AgencyDemoInventoryScope1760000005000 } from '../migrations/1760000005000-AgencyDemoInventoryScope';
import { seedAgencyDemo, agencyDemoId, AGENCY_DEMO_EXPECTED_NAME } from './agency-demo.seed';

const url = process.env.POSTGRES_INTEGRATION_URL;
const orgId = 'aaaaaaaa-0000-4000-8000-000000000001';
const foreignOrg = 'aaaaaaaa-0000-4000-8000-000000000002';
const platformOrg = 'aaaaaaaa-0000-4000-8000-000000000003';
const users = Array.from(
  { length: 7 },
  (_, i) => `bbbbbbbb-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
const actor = (index: number) =>
  ({
    userId: users[index]!,
    email: 'synthetic@example.test',
    sessionVersion: 0,
  }) as AuthenticatedUser;
const options = {
  organizationId: orgId,
  expectedName: AGENCY_DEMO_EXPECTED_NAME,
  apply: true,
  now: new Date('2026-10-06T10:00:00Z'),
};

async function fixture(work: (db: DataSource) => Promise<void>) {
  const schema = `agency_demo_${randomUUID().replaceAll('-', '')}`;
  const db = new DataSource({
    type: 'postgres',
    url,
    schema,
    entities: ENTITIES,
    migrations: AppDataSource.options.migrations,
    synchronize: false,
    extra: { options: `-c search_path=${schema},public`, max: 4 },
  });
  await db.initialize();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.runMigrations();
    for (const [id, name, type] of [
      [orgId, AGENCY_DEMO_EXPECTED_NAME, 'agency'],
      [foreignOrg, 'Synthetic other agency', 'agency'],
      [platformOrg, 'Synthetic platform', 'platform'],
    ])
      await db.query(
        "INSERT INTO organizations (id,name,type,country) VALUES ($1,$2,$3,'Nigeria')",
        [id, name, type],
      );
    for (const [index, id] of users.entries())
      await db.query(
        "INSERT INTO users (id,email,name,status) VALUES ($1,$2,'Synthetic planner',$3)",
        [id, `fixture-${index}@example.test`, index === 4 ? 'suspended' : 'active'],
      );
    for (const [index, role] of [
      'planner',
      'planner_admin',
      'org_owner',
      'planner',
      'planner',
      'client_viewer',
      'planner',
    ].entries())
      await db.query(
        'INSERT INTO memberships (user_id,organization_id,role,status) VALUES ($1,$2,$3,$4)',
        [users[index], orgId, role, index === 3 ? 'suspended' : 'active'],
      );
    await db.query(
      "INSERT INTO memberships (user_id,organization_id,role,status) VALUES ($1,$2,'planner','active'),($3,$4,'platform_admin','active')",
      [users[0], foreignOrg, users[1], platformOrg],
    );
    await db.query(
      "INSERT INTO user_capability_overrides (user_id,organization_id,capability,action) VALUES ($1,$2,'CAMPAIGN_CREATE','revoke')",
      [users[6], orgId],
    );
    await work(db);
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.destroy();
  }
}
const count = async (db: DataSource, table: string) =>
  (await db.query(`SELECT count(*)::int AS count FROM ${table}`))[0].count;

describe('insert-only agency demo PostgreSQL seed and tenant visibility', { skip: !url }, () => {
  it('dry-runs without writes, inserts only eligible members, and preserves sample/user edits on repeated runs', async () => {
    await fixture(async (db) => {
      const beforeUsers = await count(db, 'users'),
        beforeMembers = await count(db, 'memberships');
      const dry = await seedAgencyDemo(db, { ...options, apply: false });
      assert.equal(dry.applied, false);
      assert.deepEqual(
        dry.planners.map((item) => item.userId),
        users.slice(0, 3),
      );
      for (const table of [
        'billboard_sites',
        'site_faces',
        'rate_cards',
        'personal_planning_drafts',
        'audit_logs',
      ])
        assert.equal(await count(db, table), 0);
      const applied = await seedAgencyDemo(db, options);
      assert.deepEqual(applied.inserted, {
        sites: 6,
        faces: 8,
        rateCards: 8,
        drafts: 9,
        audits: 31,
      });
      const siteId = applied.boards[0]!.id,
        draftId = applied.planners[0]!.draftIds[0]!;
      await db.query(
        "UPDATE billboard_sites SET name = 'DEMO user modified sample' WHERE id = $1",
        [siteId],
      );
      await db.query(
        "UPDATE personal_planning_drafts SET name = 'User modified scenario', revision = 2 WHERE id = $1",
        [draftId],
      );
      await db.query(
        "INSERT INTO personal_planning_drafts (organization_id,user_id,name,draft,client_request_id,creation_fingerprint) SELECT organization_id,user_id,'Original personal plan',draft,$1,$2 FROM personal_planning_drafts WHERE id = $3",
        [randomUUID(), 'a'.repeat(64), draftId],
      );
      const rerun = await seedAgencyDemo(db, { ...options, now: new Date('2027-02-20') });
      assert.deepEqual(rerun.inserted, { sites: 0, faces: 0, rateCards: 0, drafts: 0, audits: 0 });
      assert.equal(
        (await db.query('SELECT name FROM billboard_sites WHERE id = $1', [siteId]))[0].name,
        'DEMO user modified sample',
      );
      assert.equal(
        (
          await db.query('SELECT revision FROM personal_planning_drafts WHERE id = $1', [draftId])
        )[0].revision,
        2,
      );
      assert.equal(await count(db, 'personal_planning_drafts'), 10);
      assert.equal(await count(db, 'users'), beforeUsers);
      assert.equal(await count(db, 'memberships'), beforeMembers);
      for (const table of ['site_assets', 'site_metadata', 'bookings', 'partner_terms_acceptances'])
        assert.equal(await count(db, table), 0);
      const plans = new PlanningDraftsService(
        new DatabaseService(db),
        new CapabilityResolverService(),
      );
      assert.equal(
        (await plans.list({ userId: users[1]!, organizationId: orgId })).items.length,
        3,
      );
      await assert.rejects(
        plans.get({ userId: users[1]!, organizationId: orgId }, draftId),
        NotFoundException,
      );
    });
  });
  it('hides demo inventory from other agencies, unscoped service calls and platform contexts across every read gate, preserving ordinary sharing', async () => {
    await fixture(async (db) => {
      const report = await seedAgencyDemo(db, options);
      const database = new DatabaseService(db),
        market = new MarketplaceService(database);
      const inventory = new InventoryService(
        database,
        new CapabilityResolverService(),
        {} as StorageService,
      );
      const geographic = new GeographicContextService(database, inventory);
      const planning = new PlanningService(database, market, undefined, undefined, geographic);
      const siteId = report.boards[0]!.id;
      assert.equal((await market.search({ limit: 100 }, undefined, orgId)).total, 6);
      for (const org of [foreignOrg, platformOrg, undefined]) {
        assert.equal((await market.search({ limit: 100 }, undefined, org)).total, 0);
        await assert.rejects(market.getMarketplaceSite(siteId, undefined, org), NotFoundException);
        await assert.rejects(
          planning.siteOptions(siteId, { startDate: '2026-11-01', endDate: '2026-11-15' }, org),
          NotFoundException,
        );
      }
      const detail = await market.getMarketplaceSite(siteId, undefined, orgId);
      assert.equal(detail.isDemo, true);
      assert.equal(detail.commerciallyBookable, false);
      assert.match(detail.demoProvenance!, /Synthetic/);
      assert.deepEqual(detail.assets, []);
      assert.deepEqual(detail.metadata, []);
      for (const [user, org] of [
        [actor(0), foreignOrg],
        [actor(1), platformOrg],
      ] as const) {
        assert.equal((await inventory.listSites(user, org, { limit: 100 })).total, 0);
        await assert.rejects(inventory.assertCanReadSite(user, org, siteId), NotFoundException);
        await assert.rejects(inventory.getSite(user, org, siteId), NotFoundException);
        await assert.rejects(geographic.getSiteContext(user, org, siteId), NotFoundException);
      }
      const demoContext = await geographic.getSiteContext(actor(0), orgId, siteId);
      assert.match(demoContext.disclaimer, /DEMO/);
      assert.equal(demoContext.nearestRoad.value, null);
      assert.equal(demoContext.traffic.value, null);
      assert.ok(
        demoContext.catchments.every(
          (item) => item.population.value === null && item.pois.value === null,
        ),
      );
      const optionsResult = await planning.siteOptions(
        siteId,
        { startDate: '2026-11-01', endDate: '2026-11-15' },
        orgId,
      );
      assert.equal(optionsResult.isDemo, true);
      assert.equal(optionsResult.commerciallyBookable, false);
      assert.equal(optionsResult.reservation, false);
      const samples = await db.query(
        'SELECT name, draft FROM personal_planning_drafts WHERE user_id = $1 ORDER BY name',
        [users[0]],
      );
      for (const sample of samples) {
        const result = await planning.plan(
          {
            message: 'Synthetic scenario arithmetic test',
            context: {
              selectedSiteIds: sample.draft.faces.map((face: { siteId: string }) => face.siteId),
              selectedFaceIds: sample.draft.faces.map((face: { faceId: string }) => face.faceId),
              window: sample.draft.window,
              ...(sample.draft.budget
                ? {
                    budget: {
                      amount: Number(sample.draft.budget),
                      currency: sample.draft.currency,
                    },
                  }
                : {}),
            },
          },
          { userId: users[0]!, user: actor(0), orgId },
        );
        if (sample.name.includes('Mainland launch')) {
          assert.equal(result.facts.budget.totals.NGN, 1610000);
          assert.equal(result.facts.budget.fit, 'within');
          assert.equal(result.facts.distances.length, 3);
          assert.ok(result.facts.distances.every((item) => item.unit === 'km' && item.value! > 0));
        } else if (sample.name.includes('Island LED')) {
          assert.equal(result.facts.budget.totals.NGN, 3010000);
          assert.equal(result.facts.budget.fit, 'over');
        } else {
          assert.equal(result.facts.budget.fit, 'unknown');
        }
        assert.ok(
          result.facts.sites.every((site) => site.isDemo && site.commerciallyBookable === false),
        );
        assert.equal(result.facts.retrieval.enrichmentReads, 0);
        assert.equal(result.facts.ots, null);
      }
      const faceId = report.boards[0]!.faceIds[0]!;
      await assert.rejects(
        planning.plan(
          { message: 'Synthetic test', context: { selectedFaceIds: [faceId] } },
          { userId: users[0]!, user: actor(0), orgId: foreignOrg },
        ),
        BadRequestException,
      );
      const reply = await planning.plan(
        {
          message: 'Synthetic test',
          context: {
            selectedSiteIds: [siteId],
            selectedFaceIds: [faceId],
            window: { startDate: '2026-11-01', endDate: '2026-11-15' },
          },
        },
        { userId: users[0]!, user: actor(0), orgId },
      );
      assert.equal(reply.facts.sites[0]!.isDemo, true);
      assert.equal(reply.facts.ots, null);
      assert.equal(reply.facts.reach, null);
      assert.equal(reply.facts.retrieval.enrichmentReads, 0);
      assert.ok(reply.facts.assumptions.some((item) => item.startsWith('DEMO')));
      const ordinary = randomUUID();
      await db.query(
        "INSERT INTO billboard_sites (id,organization_id,code,name,format,latitude,longitude,country,illumination_type,status) VALUES ($1,$2,'QA-ORDINARY','Synthetic test ordinary listing','static',6.58,3.36,'Nigeria','none','listed')",
        [ordinary, orgId],
      );
      const normalFace = randomUUID();
      await db.query(
        "INSERT INTO site_faces (id,site_id,face_label,width,height,area,units,bookable) VALUES ($1,$2,'Fixture',12,6,72,'m',true)",
        [normalFace, ordinary],
      );
      await db.query(
        "INSERT INTO rate_cards (organization_id,site_id,face_id,currency,rates,effective_from) VALUES ($1,$2,$3,'NGN','{\"perDay\":50000}', '2020-01-01')",
        [orgId, ordinary, normalFace],
      );
      await db.query(
        "INSERT INTO site_assets (site_id,kind,storage_ref,captured_at) VALUES ($1,'front','synthetic-test-only.jpg',now())",
        [ordinary],
      );
      assert.equal((await market.search({}, undefined, foreignOrg)).total, 1);
      assert.equal(
        (await market.getMarketplaceSite(ordinary, undefined, foreignOrg)).isDemo,
        false,
      );
      const runner = db.createQueryRunner();
      try {
        await new AgencyDemoInventoryScope1760000005000().down(runner);
      } finally {
        await runner.release();
      }
      assert.equal(
        (
          await db.query(
            "SELECT count(*)::int AS count FROM billboard_sites WHERE status = 'listed'",
          )
        )[0].count,
        1,
        'rollback never exposes sample listings',
      );
      assert.equal(
        (await db.query('SELECT status FROM billboard_sites WHERE id = $1', [siteId]))[0].status,
        'draft',
      );
      assert.equal(await count(db, 'audit_logs'), 31);
    });
  });
  it('refuses wrong targets, identity collisions and quota overflow before changing any existing row', async () => {
    await fixture(async (db) => {
      await assert.rejects(seedAgencyDemo(db, { ...options, expectedName: 'Guessed agency' }));
      await assert.rejects(seedAgencyDemo(db, { ...options, organizationId: foreignOrg }));
      await db.query(
        "INSERT INTO site_faces (id,site_id,face_label,width,height,area,units) VALUES ($1,$2,'Unrelated existing face',1,1,1,'m')",
        [agencyDemoId(orgId, 'face:ikeja:1'), randomUUID()],
      );
      await assert.rejects(seedAgencyDemo(db, options), /collides/);
      assert.equal(await count(db, 'billboard_sites'), 0);
      assert.equal(await count(db, 'site_faces'), 1);
      await db.query('DELETE FROM site_faces');
      const value = {
        version: 1,
        window: { startDate: '2026-11-01', endDate: '2026-11-15' },
        country: '',
        query: '',
        format: '',
        budget: '',
        currency: 'NGN',
        faces: [],
      };
      for (let i = 0; i < 28; i++)
        await db.query(
          "INSERT INTO personal_planning_drafts (organization_id,user_id,name,draft,client_request_id,creation_fingerprint) VALUES ($1,$2,'Original private plan',$3,$4,$5)",
          [orgId, users[0], value, randomUUID(), 'a'.repeat(64)],
        );
      await assert.rejects(seedAgencyDemo(db, options), /lacks room/);
      assert.equal(await count(db, 'billboard_sites'), 0);
      assert.equal(await count(db, 'personal_planning_drafts'), 28);
      assert.equal(await count(db, 'audit_logs'), 0);
    });
  });
  it('rolls back all inserted demo rows when the audit fails, retaining a safe insert-only retry', async () => {
    await fixture(async (db) => {
      await db.query(
        "ALTER TABLE audit_logs ADD CONSTRAINT fail_demo_audit CHECK (action <> 'demo.face.seeded')",
      );
      await assert.rejects(seedAgencyDemo(db, options));
      for (const table of [
        'billboard_sites',
        'site_faces',
        'rate_cards',
        'personal_planning_drafts',
        'audit_logs',
      ])
        assert.equal(await count(db, table), 0);
      await db.query('ALTER TABLE audit_logs DROP CONSTRAINT fail_demo_audit');
      assert.equal((await seedAgencyDemo(db, options)).inserted.drafts, 9);
    });
  });
});

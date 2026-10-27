import { SiteCaptureRequirements1760000008000 } from '../migrations/1760000008000-SiteCaptureRequirements';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DatabaseService } from '../common/database.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { ENTITIES } from '../common/entities';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import type { CreateSiteDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';
import { PartOneInventoryTrust1720000000007 } from '../migrations/1720000000007-PartOneInventoryTrust';
import { SiteLocationVerification1760000001000 } from '../migrations/1760000001000-SiteLocationVerification';
import { InventoryMediaEvidence1760000002000 } from '../migrations/1760000002000-InventoryMediaEvidence';

/**
 * Real-Postgres proof for the inventory trust contract (execution plan §1.6
 * gate 4): the audit row and the mutation commit in ONE transaction — an audit
 * failure rolls the mutation back, a committed mutation leaves exactly one
 * audit row, and the Part 1 migration's demo/production data class columns
 * exist and behave.
 *
 * Runs only when POSTGRES_INTEGRATION_URL points at a disposable database
 * (see `pnpm test:integration:postgres`); it creates and drops its own schema.
 */

const databaseUrl = process.env.POSTGRES_INTEGRATION_URL;

async function withSchema(
  test: (dataSource: DataSource) => Promise<void>,
  applyInventoryMigration = true,
  poolSize?: number,
  timeZone = 'UTC',
): Promise<void> {
  if (!databaseUrl) throw new Error('POSTGRES_INTEGRATION_URL is required');
  const schema = `inv_trust_${randomUUID().replaceAll('-', '')}`;
  // search_path rides the connection options so every pooled connection sees
  // the throwaway schema, not just the first pooled connection.
  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: ENTITIES,
    extra: {
      options: `-c search_path=${schema},public -c timezone=${timeZone}`,
      ...(poolSize ? { max: poolSize, connectionTimeoutMillis: 1500 } : {}),
    },
  });
  await dataSource.initialize();
  try {
    await dataSource.query(`CREATE SCHEMA "${schema}"`);
    await dataSource.query(`
      CREATE TABLE organizations (
        id varchar PRIMARY KEY,
        name varchar NOT NULL,
        type varchar NOT NULL,
        country varchar NOT NULL DEFAULT 'Nigeria',
        default_currency varchar NOT NULL DEFAULT 'NGN',
        default_locale varchar NOT NULL DEFAULT 'en',
        status varchar NOT NULL DEFAULT 'active',
        billing_ref varchar,
        allowed_email_domains text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE memberships (
        id varchar PRIMARY KEY,
        user_id varchar NOT NULL,
        organization_id varchar NOT NULL,
        role varchar NOT NULL,
        status varchar NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE user_capability_overrides (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id varchar NOT NULL,
        organization_id varchar NOT NULL,
        capability varchar NOT NULL,
        action varchar NOT NULL,
        created_by varchar,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE billboard_sites (
      demo_agency_id uuid, research_agency_id uuid, research_provenance jsonb,
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        organization_id varchar NOT NULL,
        code varchar NOT NULL,
        name varchar NOT NULL,
        type varchar NOT NULL DEFAULT 'billboard',
        format varchar NOT NULL,
        sub_format varchar,
        latitude double precision NOT NULL,
        longitude double precision NOT NULL,
        geo_polygon json,
        address varchar,
        city varchar NOT NULL,
        region varchar,
        country varchar NOT NULL,
        market_id varchar,
        orientation_deg double precision,
        viewing_distance double precision,
        elevation double precision,
        width double precision,
        height double precision,
        area double precision,
        units varchar DEFAULT 'm',
        illumination_type varchar NOT NULL DEFAULT 'none',
        illumination_hours varchar,
        description text,
        status varchar NOT NULL DEFAULT 'draft',
        rejection_reason text,
        client_request_id varchar,
        permit_ref varchar,
        permit_expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX billboard_sites_client_request_id_idx
        ON billboard_sites (organization_id, client_request_id) WHERE client_request_id IS NOT NULL;
      CREATE TABLE site_faces (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        site_id varchar NOT NULL,
        face_label varchar NOT NULL,
        width double precision NOT NULL,
        height double precision NOT NULL,
        area double precision NOT NULL,
        units varchar NOT NULL DEFAULT 'm',
        printable_area varchar,
        bleed_mm double precision,
        substrate varchar,
        file_requirements text,
        bookable boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE face_blackouts (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        face_id varchar NOT NULL,
        organization_id varchar NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE site_assets (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        site_id varchar NOT NULL,
        face_id varchar,
        kind varchar NOT NULL,
        storage_ref varchar NOT NULL,
        captured_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE site_metadata (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        site_id varchar NOT NULL,
        dimension varchar NOT NULL,
        payload json NOT NULL,
        source varchar,
        method varchar,
        confidence double precision,
        collected_at timestamptz,
        expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE rate_cards (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        organization_id varchar NOT NULL,
        site_id varchar,
        face_id varchar,
        currency varchar NOT NULL,
        min_booking_days integer,
        rates json NOT NULL,
        seasonal_rules json,
        effective_from timestamptz NOT NULL,
        effective_to timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE audit_logs (
        id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        actor_user_id varchar,
        actor_org_id varchar,
        action varchar NOT NULL,
        entity_type varchar,
        entity_id varchar,
        before json,
        after json,
        at timestamptz NOT NULL DEFAULT now(),
        ip varchar,
        request_id varchar,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    // Part 1 additive columns (data_class/verification, digital face attrs)
    // are part of the fixture schema for every test.
    const migrations = [
      ...(applyInventoryMigration ? [new PartOneInventoryTrust1720000000007()] : []),
      new SiteLocationVerification1760000001000(),
      new InventoryMediaEvidence1760000002000(),
      new SiteCaptureRequirements1760000008000(),
    ];
    for (const migration of migrations) {
      const runner = dataSource.createQueryRunner();
      try {
        await migration.up(runner);
      } finally {
        await runner.release();
      }
    }
    await test(dataSource);
  } finally {
    await dataSource.query('SET search_path TO public').catch(() => undefined);
    await dataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await dataSource.destroy();
  }
}

const USER: AuthenticatedUser = {
  userId: 'kwame-1',
  email: 'kwame@example.test',
  sessionVersion: 0,
};
const ORG = 'org-partner';

const createDto = (patch: Partial<CreateSiteDto> = {}): CreateSiteDto =>
  ({
    name: 'Ikorodu Road Panel',
    format: 'static',
    latitude: 6.6058,
    longitude: 3.3545,
    city: 'Lagos',
    country: 'Nigeria',
    width: 12,
    height: 3,
    ...patch,
  }) as CreateSiteDto;

function buildService(dataSource: DataSource): InventoryService {
  const db = new DatabaseService(dataSource);
  return new InventoryService(db, new CapabilityResolverService(), {
    async store(ref: string) {
      return ref;
    },
    async read() {
      return Buffer.alloc(4);
    },
    async remove() {},
  } as never);
}

describe('inventory audit — postgres transactional integrity', { skip: !databaseUrl }, () => {
  it('commits the site and exactly one audit row together', async () => {
    await withSchema(async (dataSource) => {
      await dataSource.query(
        `INSERT INTO organizations (id, name, type) VALUES ($1, 'Partner', 'media_partner')`,
        [ORG],
      );
      await dataSource.query(
        `INSERT INTO memberships (id, user_id, organization_id, role, status) VALUES ('m1', $1, $2, 'inventory_manager', 'active')`,
        [USER.userId, ORG],
      );
      const service = buildService(dataSource);
      const site = await service.createSite(ORG, createDto(), { userId: USER.userId, orgId: ORG });
      const audits = await dataSource.query(`SELECT * FROM audit_logs`);
      assert.equal(audits.length, 1);
      assert.equal(audits[0].action, 'inventory.site.created');
      assert.equal(audits[0].actor_org_id, ORG);
      assert.equal(audits[0].entity_id, site.id);
      const meta = await dataSource.query(`SELECT * FROM site_metadata`);
      assert.equal(meta.length, 0);
    });
  });

  it('rolls back site + provenance when the audit insert fails', async () => {
    await withSchema(async (dataSource) => {
      await dataSource.query(
        `INSERT INTO organizations (id, name, type) VALUES ($1, 'Partner', 'media_partner')`,
        [ORG],
      );
      await dataSource.query(
        `INSERT INTO memberships (id, user_id, organization_id, role, status) VALUES ('m1', $1, $2, 'inventory_manager', 'active')`,
        [USER.userId, ORG],
      );
      // A sabotage check: any site-created audit action is rejected by the DB.
      await dataSource.query(
        `ALTER TABLE audit_logs ADD CONSTRAINT audit_no_site_created CHECK (action <> 'inventory.site.created')`,
      );
      const service = buildService(dataSource);
      await assert.rejects(
        () =>
          service.createSite(
            ORG,
            createDto({
              orientationDeg: 90,
              structureProvenance: { source: 'Site visit', method: 'compass reading' },
            }),
            { userId: USER.userId, orgId: ORG },
          ),
        (err: unknown) =>
          String((err as Error).message)
            .toLowerCase()
            .includes('audit_no_site_created') ||
          String((err as Error).message).includes('check constraint'),
      );
      const sites = await dataSource.query(`SELECT count(*)::int AS c FROM billboard_sites`);
      assert.equal(sites[0].c, 0);
      const audits = await dataSource.query(`SELECT count(*)::int AS c FROM audit_logs`);
      assert.equal(audits[0].c, 0);
      const meta = await dataSource.query(`SELECT count(*)::int AS c FROM site_metadata`);
      assert.equal(meta[0].c, 0);
    });
  });

  it('replayed idempotent creates leave exactly one audit row', async () => {
    await withSchema(async (dataSource) => {
      await dataSource.query(
        `INSERT INTO organizations (id, name, type) VALUES ($1, 'Partner', 'media_partner')`,
        [ORG],
      );
      await dataSource.query(
        `INSERT INTO memberships (id, user_id, organization_id, role, status) VALUES ('m1', $1, $2, 'inventory_manager', 'active')`,
        [USER.userId, ORG],
      );
      const service = buildService(dataSource);
      const dto = createDto({ clientRequestId: 'req-pg-1' });
      const first = await service.createSite(ORG, dto, { userId: USER.userId, orgId: ORG });
      const replay = await service.createSite(
        ORG,
        { ...dto, name: 'Second Try' },
        { userId: USER.userId, orgId: ORG },
      );
      assert.equal(replay.id, first.id);
      const sites = await dataSource.query(`SELECT count(*)::int AS c FROM billboard_sites`);
      assert.equal(sites[0].c, 1);
      const audits = await dataSource.query(`SELECT count(*)::int AS c FROM audit_logs`);
      assert.equal(audits[0].c, 1);
    });
  });

  it(
    'updates and removes owned faces with a one-connection pool and rejects foreign tenants without audit loss',
    { timeout: 10_000 },
    async () => {
      // A global repository lookup inside either transaction requires a second
      // pooled connection and fails this test within 1.5s rather than hanging CI.
      await withSchema(
        async (dataSource) => {
          await dataSource.query(
            `INSERT INTO organizations (id, name, type) VALUES ($1, 'Synthetic Partner', 'media_partner')`,
            [ORG],
          );
          const service = buildService(dataSource);
          const site = await service.createSite(ORG, createDto(), {
            userId: USER.userId,
            orgId: ORG,
          });
          const face = await service.addFace(USER, ORG, site.id, {
            faceLabel: 'Original face',
            width: 12,
            height: 3,
            area: 36,
            units: 'm',
            bookable: true,
          });
          const updated = await service.updateFace(USER, ORG, face.id, {
            faceLabel: 'Corrected face',
            width: 13,
            area: 39,
          });
          assert.equal(updated.faceLabel, 'Corrected face');
          assert.equal(Number(updated.width), 13);
          await assert.rejects(
            service.updateFace(USER, 'foreign-org', face.id, { faceLabel: 'Unauthorized edit' }),
            ForbiddenException,
          );
          await assert.rejects(
            service.removeFace(USER, 'foreign-org', face.id),
            ForbiddenException,
          );
          assert.equal(
            (await dataSource.query('SELECT * FROM site_faces WHERE id = $1', [face.id])).length,
            1,
          );
          const beforeDelete = await dataSource.query('SELECT * FROM audit_logs ORDER BY at');
          assert.equal(beforeDelete.length, 3);
          const updateAudit = beforeDelete.find(
            (row: { action: string }) => row.action === 'inventory.face.updated',
          );
          assert.equal(updateAudit.before.faceLabel, 'Original face');
          assert.equal(updateAudit.after.faceLabel, 'Corrected face');
          assert.equal(updateAudit.actor_org_id, ORG);
          const removed = await service.removeFace(USER, ORG, face.id);
          assert.equal(removed.deleted, true);
          assert.equal(
            (await dataSource.query('SELECT * FROM site_faces WHERE id = $1', [face.id])).length,
            0,
          );
          const audits = await dataSource.query('SELECT * FROM audit_logs ORDER BY at');
          assert.equal(audits.length, 4);
          const deletion = audits.find(
            (row: { action: string }) => row.action === 'inventory.face.removed',
          );
          assert.equal(deletion.before.faceLabel, 'Corrected face');
          assert.equal(deletion.after, null);
        },
        true,
        1,
      );
    },
  );

  it('classifies only known seed metadata as demo during migration', async () => {
    await withSchema(async (dataSource) => {
      // Simulate a database with both seeded fiction and a real partner record.
      // A deploy must not hide the partner's data as demo content.
      const partnerMetadataId = randomUUID();
      await dataSource.query(
        `
        INSERT INTO site_metadata (id, site_id, dimension, payload, source, method)
        VALUES
          ('77777777-0000-4000-8000-000000000001', 'site-1', 'traffic', '{"aadt":85000}'::json, 'LAMATA', 'count'),
          ($1, 'site-1', 'structure', '{"orientationDeg":90}'::json, 'partner survey', 'measured');
      `,
        [partnerMetadataId],
      );
      const runner = dataSource.createQueryRunner();
      const migration = new PartOneInventoryTrust1720000000007();
      try {
        await migration.up(runner);
      } finally {
        await runner.release();
      }
      const rows = await dataSource.query(`SELECT id, data_class, verification FROM site_metadata`);
      assert.equal(rows.length, 2);
      const byId = new Map<string, { id: string; data_class: string; verification: string }>(
        rows.map((row: { id: string; data_class: string; verification: string }) => [row.id, row]),
      );
      assert.equal(byId.get(partnerMetadataId)?.data_class, 'production');
      assert.equal(byId.get(partnerMetadataId)?.verification, 'unverified');
      assert.equal(byId.get('77777777-0000-4000-8000-000000000001')?.data_class, 'demo');
      assert.equal(byId.get('77777777-0000-4000-8000-000000000001')?.verification, 'unverified');
      const service = buildService(dataSource);
      await dataSource.query(
        `INSERT INTO organizations (id, name, type) VALUES ($1, 'Partner', 'media_partner')`,
        [ORG],
      );
      await dataSource.query(
        `INSERT INTO memberships (id, user_id, organization_id, role, status) VALUES ('m1', $1, $2, 'inventory_manager', 'active')`,
        [USER.userId, ORG],
      );
      // Demo rows are suppressed from production reads.
      await dataSource.query(
        `INSERT INTO site_metadata (site_id, dimension, payload, source, method, data_class)
         VALUES ('site-1', 'structure', '{"orientationDeg":90}'::json, 'compass', 'reading', 'demo')`,
      );
      const visible = await service.listMetadata('site-1');
      assert.equal(visible.length, 1);
      assert.equal(visible[0].id, partnerMetadataId);
    }, false);
  });
});

describe('inventory eligibility — real Postgres regressions', { skip: !databaseUrl }, () => {
  it('expiry is read-only and consistent; renewal and last-face removal require fresh review', async () => {
    await withSchema(async (dataSource) => {
      await dataSource.query(
        "INSERT INTO organizations (id,name,type) VALUES ('org-partner','Partner','media_partner'),('agency','Agency','agency')",
      );
      await dataSource.query(
        "INSERT INTO memberships(id,user_id,organization_id,role,status) VALUES ('m1','kwame-1','org-partner','inventory_manager','active'),('m2','buyer','agency','planner','active')",
      );
      const service = buildService(dataSource),
        market = new MarketplaceService(new DatabaseService(dataSource));
      const site = await service.createSite(ORG, createDto());
      const face = await service.addFace(USER, ORG, site.id, {
        faceLabel: 'East',
        width: 12,
        height: 3,
        area: 36,
        units: 'm',
        bookable: true,
      });
      const rate = await service.createRateCard(USER, ORG, site.id, {
        currency: 'NGN',
        rates: { perDay: 100 },
        effectiveFrom: '2020-01-01',
      });
      await dataSource.query(
        "INSERT INTO site_assets(site_id,kind,storage_ref,captured_at,media_type,width,height) VALUES ($1,'front','front.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'wide','approach.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'close_up','board.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'panorama','surroundings.jpg',NULL,'image',2000,1000)",
        [site.id],
      );
      await service.submitSite(USER, ORG, site.id);
      await service.approveSite(USER, ORG, site.id);
      const buyer = { userId: 'buyer', sessionVersion: 0 } as AuthenticatedUser;
      assert.equal((await service.getSite(buyer, 'agency', site.id)).status, 'listed');
      // A time change is represented by an expired fixture, bypassing mutation revalidation deliberately.
      await dataSource.query(
        "UPDATE rate_cards SET effective_to = CURRENT_DATE - INTERVAL '1 day' WHERE id=$1",
        [rate.id],
      );
      const auditsBefore = (await dataSource.query('SELECT count(*)::int AS n FROM audit_logs'))[0]
        .n;
      assert.equal((await service.getSite(USER, ORG, site.id)).status, 'draft');
      assert.equal((await service.listSites(USER, ORG, { status: 'listed' })).items.length, 0);
      await assert.rejects(() => service.getSite(buyer, 'agency', site.id), ForbiddenException);
      await assert.rejects(
        () => market.getMarketplaceSite(site.id, undefined, 'agency'),
        NotFoundException,
      );
      assert.equal(
        (await dataSource.query('SELECT status FROM billboard_sites WHERE id=$1', [site.id]))[0]
          .status,
        'listed',
      );
      assert.equal(
        (await dataSource.query('SELECT count(*)::int AS n FROM audit_logs'))[0].n,
        auditsBefore,
      );
      await service.updateRateCard(USER, ORG, rate.id, { effectiveTo: '2099-01-01' });
      assert.equal(
        (await dataSource.query('SELECT status FROM billboard_sites WHERE id=$1', [site.id]))[0]
          .status,
        'draft',
      );
      await assert.rejects(
        () => market.getMarketplaceSite(site.id, undefined, 'agency'),
        NotFoundException,
      );
      await service.submitSite(USER, ORG, site.id);
      await service.approveSite(USER, ORG, site.id);
      await service.removeFace(USER, ORG, face.id);
      assert.equal((await service.getSite(USER, ORG, site.id)).status, 'draft');
      await assert.rejects(() => service.getSite(buyer, 'agency', site.id), ForbiddenException);
      assert.ok(
        (
          await dataSource.query(
            "SELECT 1 FROM audit_logs WHERE action='inventory.site.unpublished'",
          )
        ).length >= 2,
      );
    });
  });
});

describe('legacy invalid inventory publication — real Postgres', { skip: !databaseUrl }, () => {
  it('blocks invalid rows at approval and all current buyer read gates without repairing them', async () => {
    await withSchema(async (dataSource) => {
      await dataSource.query(
        "INSERT INTO organizations(id,name,type) VALUES ('org-partner','Partner','media_partner'),('agency','Agency','agency')",
      );
      await dataSource.query(
        "INSERT INTO memberships(id,user_id,organization_id,role,status) VALUES ('m1','kwame-1','org-partner','inventory_manager','active'),('m2','buyer','agency','planner','active')",
      );
      const service = buildService(dataSource),
        market = new MarketplaceService(new DatabaseService(dataSource));
      const site = await service.createSite(ORG, createDto({ format: 'digital_led' }));
      const face = await service.addFace(USER, ORG, site.id, {
        faceLabel: 'East',
        width: 12,
        height: 3,
        area: 36,
        units: 'm',
        bookable: true,
        pixelWidth: 1920,
        pixelHeight: 1080,
        spotLengthSeconds: 10,
        loopLengthSeconds: 60,
        spotsPerLoop: 6,
      });
      await service.createRateCard(USER, ORG, site.id, {
        currency: 'NGN',
        rates: { perDay: 100 },
        effectiveFrom: '2020-01-01',
      });
      await dataSource.query(
        "INSERT INTO site_assets(site_id,kind,storage_ref,captured_at,media_type,width,height) VALUES ($1,'front','front.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'wide','approach.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'close_up','board.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'panorama','surroundings.jpg',NULL,'image',2000,1000)",
        [site.id],
      );
      await service.submitSite(USER, ORG, site.id);
      await dataSource.query(
        'UPDATE site_faces SET width=-12,height=0,area=-72,spot_length_seconds=15,loop_length_seconds=10 WHERE id=$1',
        [face.id],
      );
      await assert.rejects(() => service.approveSite(USER, ORG, site.id), BadRequestException);
      assert.equal(
        (await dataSource.query('SELECT status FROM billboard_sites WHERE id=$1', [site.id]))[0]
          .status,
        'pending_review',
      );
      await dataSource.query(
        'UPDATE site_faces SET width=12,height=3,area=36,spot_length_seconds=10,loop_length_seconds=60 WHERE id=$1',
        [face.id],
      );
      await service.approveSite(USER, ORG, site.id);
      await dataSource.query('UPDATE site_faces SET spot_length_seconds=75 WHERE id=$1', [face.id]);
      const buyer = { userId: 'buyer', sessionVersion: 0 } as AuthenticatedUser;
      assert.equal((await service.getSite(USER, ORG, site.id)).status, 'draft');
      assert.equal((await service.listSites(USER, ORG, { status: 'listed' })).items.length, 0);
      await assert.rejects(() => service.getSite(buyer, 'agency', site.id), ForbiddenException);
      await assert.rejects(
        () => market.getMarketplaceSite(site.id, undefined, 'agency'),
        NotFoundException,
      );
      assert.equal(
        (await dataSource.query('SELECT status FROM billboard_sites WHERE id=$1', [site.id]))[0]
          .status,
        'listed',
      );
      assert.equal(
        (
          await dataSource.query('SELECT spot_length_seconds FROM site_faces WHERE id=$1', [
            face.id,
          ])
        )[0].spot_length_seconds,
        75,
      );
    });
  });
});

describe('review follow-up — real Postgres semantics', { skip: !databaseUrl }, () => {
  it('owner-reported metadata clears persist and match the audit snapshot', async () => {
    await withSchema(async (dataSource) => {
      await dataSource.query(
        "INSERT INTO organizations(id,name,type) VALUES ('org-partner','Partner','media_partner')",
      );
      await dataSource.query(
        "INSERT INTO memberships(id,user_id,organization_id,role,status) VALUES ('m1','kwame-1','org-partner','inventory_manager','active')",
      );
      const service = buildService(dataSource),
        site = await service.createSite(ORG, createDto());
      const row = await service.addMetadata(USER, ORG, site.id, {
        dimension: 'visibility',
        payload: { score: 0.5 },
        source: 'Owner survey',
        method: 'Owner declaration',
        verification: 'partner_declared',
      });
      const updated = await service.updateMetadata(USER, ORG, row.id, { confidence: 0.6 });
      assert.equal(updated.verification, 'partner_declared');
      const cleared = await service.updateMetadata(USER, ORG, row.id, {
        source: null,
        method: null,
      });
      const saved = (
        await dataSource.query('SELECT source,method,verification FROM site_metadata WHERE id=$1', [
          row.id,
        ])
      )[0];
      assert.equal(saved.source, null);
      assert.equal(saved.method, null);
      assert.equal(saved.verification, 'partner_declared');
      assert.equal(cleared.source, null);
      const audit = (
        await dataSource.query(
          "SELECT after FROM audit_logs WHERE action='inventory.metadata.updated' AND (after->>'source') IS NULL",
        )
      )[0];
      assert.equal(audit.after.source, null);
    });
  });
  it('listing reads use UTC dates in a non-UTC database session', async () => {
    await withSchema(
      async (dataSource) => {
        await dataSource.query(
          "INSERT INTO organizations(id,name,type) VALUES ('org-partner','Partner','media_partner')",
        );
        await dataSource.query(
          "INSERT INTO memberships(id,user_id,organization_id,role,status) VALUES ('m1','kwame-1','org-partner','inventory_manager','active')",
        );
        const service = buildService(dataSource),
          market = new MarketplaceService(new DatabaseService(dataSource)),
          site = await service.createSite(ORG, createDto());
        await service.addFace(USER, ORG, site.id, {
          faceLabel: 'East',
          width: 12,
          height: 3,
          area: 36,
          units: 'm',
          bookable: true,
        });
        const rate = await service.createRateCard(USER, ORG, site.id, {
          currency: 'NGN',
          rates: { perDay: 100 },
          effectiveFrom: '2020-01-01',
        });
        await dataSource.query(
          "INSERT INTO site_assets(site_id,kind,storage_ref,captured_at,media_type,width,height) VALUES ($1,'front','front.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'wide','approach.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'close_up','board.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'panorama','surroundings.jpg',NULL,'image',2000,1000)",
          [site.id],
        );
        await service.submitSite(USER, ORG, site.id);
        await service.approveSite(USER, ORG, site.id);
        await dataSource.query(
          "UPDATE rate_cards SET effective_from = (((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date + INTERVAL '1 day' - INTERVAL '30 minutes') AT TIME ZONE 'UTC') WHERE id=$1",
          [rate.id],
        );
        assert.equal((await service.getSite(USER, ORG, site.id)).status, 'listed');
        assert.equal((await service.listSites(USER, ORG, { status: 'listed' })).total, 1);
        assert.equal((await market.getMarketplaceSite(site.id)).status, 'listed');
        await dataSource.query(
          "UPDATE rate_cards SET effective_from='2020-01-01', effective_to=(((CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - INTERVAL '30 minutes') AT TIME ZONE 'UTC') WHERE id=$1",
          [rate.id],
        );
        assert.equal((await service.getSite(USER, ORG, site.id)).status, 'draft');
        assert.equal((await service.listSites(USER, ORG, { status: 'listed' })).total, 0);
        await assert.rejects(() => market.getMarketplaceSite(site.id), NotFoundException);
      },
      true,
      1,
      'Africa/Lagos',
    );
  });
});

describe(
  'optional digital values on static inventory — real Postgres',
  { skip: !databaseUrl },
  () => {
    it('keeps all read gates consistent for invalid optional values and valid partial values', async () => {
      await withSchema(async (dataSource) => {
        await dataSource.query(
          "INSERT INTO organizations(id,name,type) VALUES ('org-partner','Partner','media_partner'),('agency','Agency','agency')",
        );
        await dataSource.query(
          "INSERT INTO memberships(id,user_id,organization_id,role,status) VALUES ('m1','kwame-1','org-partner','inventory_manager','active'),('m2','buyer','agency','planner','active')",
        );
        const service = buildService(dataSource),
          market = new MarketplaceService(new DatabaseService(dataSource));
        const site = await service.createSite(ORG, createDto({ format: 'static' }));
        const face = await service.addFace(USER, ORG, site.id, {
          faceLabel: 'East',
          width: 12,
          height: 3,
          units: 'm',
          bookable: true,
          spotLengthSeconds: 10,
        });
        await service.createRateCard(USER, ORG, site.id, {
          currency: 'NGN',
          rates: { perDay: 100 },
          effectiveFrom: '2020-01-01',
        });
        await dataSource.query(
          "INSERT INTO site_assets(site_id,kind,storage_ref,captured_at,media_type,width,height) VALUES ($1,'front','front.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'wide','approach.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'close_up','board.jpg',CURRENT_TIMESTAMP,'image',1200,800), ($1,'panorama','surroundings.jpg',NULL,'image',2000,1000)",
          [site.id],
        );
        await service.submitSite(USER, ORG, site.id);
        await service.approveSite(USER, ORG, site.id);
        const buyer = { userId: 'buyer', sessionVersion: 0 } as AuthenticatedUser;
        const assertEligible = async () => {
          assert.equal((await service.getSite(USER, ORG, site.id)).status, 'listed');
          assert.equal((await service.listSites(USER, ORG, { status: 'listed' })).total, 1);
          assert.equal(
            (await market.search({}, undefined, 'agency')).items.some(
              (row: { id: string }) => row.id === site.id,
            ),
            true,
          );
          assert.equal((await service.getSite(buyer, 'agency', site.id)).status, 'listed');
          assert.equal(
            (await market.getMarketplaceSite(site.id, undefined, 'agency')).status,
            'listed',
          );
        };
        await assertEligible(); // Partial optional digital data does not turn a static site into digital.
        const invalid = [
          'spot_length_seconds=75,loop_length_seconds=60',
          'spot_length_seconds=10,loop_length_seconds=60,spots_per_loop=7',
          'spot_length_seconds=10,loop_length_seconds=NULL,spots_per_loop=NULL,pixel_width=0',
          "pixel_width=NULL,spot_length_seconds='Infinity'::float8",
        ];
        for (const values of invalid) {
          await dataSource.query(`UPDATE site_faces SET ${values} WHERE id=$1`, [face.id]);
          assert.equal((await service.getSite(USER, ORG, site.id)).status, 'draft', values);
          assert.equal((await service.listSites(USER, ORG, { status: 'listed' })).total, 0, values);
          assert.equal(
            (await market.search({}, undefined, 'agency')).items.some(
              (row: { id: string }) => row.id === site.id,
            ),
            false,
            values,
          );
          await assert.rejects(() => service.getSite(buyer, 'agency', site.id), ForbiddenException);
          await assert.rejects(
            () => market.getMarketplaceSite(site.id, undefined, 'agency'),
            NotFoundException,
          );
          assert.equal(
            (await dataSource.query('SELECT status FROM billboard_sites WHERE id=$1', [site.id]))[0]
              .status,
            'listed',
          );
        }
        await dataSource.query(
          'UPDATE site_faces SET spot_length_seconds=10,loop_length_seconds=NULL,spots_per_loop=NULL,pixel_width=NULL WHERE id=$1',
          [face.id],
        );
        await assertEligible(); // Read-only projections never rewrote the historical record.
      });
    });
  },
);

describe('main site screen resolution — real Postgres', { skip: !databaseUrl }, () => {
  async function setup(ds: DataSource) {
    await ds.query(
      "INSERT INTO organizations(id,name,type) VALUES ('org-partner','Harbourline Outdoor','media_partner'),('other','Ridgeway Outdoor','media_partner')",
    );
    await ds.query(
      "INSERT INTO memberships(id,user_id,organization_id,role,status) VALUES ('m1','kwame-1','org-partner','inventory_manager','active')",
    );
    return buildService(ds);
  }
  it('creates the draft and first screen atomically, replays once, and audits both', async () => {
    await withSchema(async (ds) => {
      const service = await setup(ds);
      const dto = createDto({
        format: 'digital_led',
        clientRequestId: 'screen-create',
        screenResolutions: [{ pixelWidth: 1920, pixelHeight: 1080 }],
      });
      const site = await service.createSite(ORG, dto, { userId: USER.userId, orgId: ORG });
      assert.equal((await service.createSite(ORG, dto)).id, site.id);
      const faces = await service.listFaces(site.id);
      assert.equal(faces.length, 1);
      assert.equal(faces[0].pixelWidth, 1920);
      assert.equal(faces[0].width, 12);
      assert.equal((await ds.query('SELECT * FROM audit_logs')).length, 2);
      await ds.query(
        "ALTER TABLE audit_logs ADD CONSTRAINT refuse_screen CHECK (action <> 'inventory.face.added') NOT VALID",
      );
      await assert.rejects(() =>
        service.createSite(ORG, { ...dto, clientRequestId: 'screen-failure' }),
      );
      assert.equal((await ds.query('SELECT * FROM billboard_sites')).length, 1);
      assert.equal((await ds.query('SELECT * FROM site_faces')).length, 1);
    });
  });
  it('edits only explicitly named faces; rejects foreign, duplicate and ambiguous targets atomically', async () => {
    await withSchema(async (ds) => {
      const service = await setup(ds);
      const site = await service.createSite(
        ORG,
        createDto({
          format: 'digital_led',
          screenResolutions: [{ pixelWidth: 1920, pixelHeight: 1080 }],
        }),
      );
      const first = (await service.listFaces(site.id))[0];
      const second = await service.addFace(USER, ORG, site.id, {
        faceLabel: 'Outbound',
        width: 6,
        height: 3,
        units: 'm',
        pixelWidth: 1280,
        pixelHeight: 720,
      });
      const other = await service.createSite(
        'other',
        createDto({ format: 'digital_led', screenResolutions: [{ pixelWidth: 800 }] }),
      );
      const foreign = (await service.listFaces(other.id))[0];
      await service.updateSite(USER, ORG, site.id, {
        screenResolutions: [{ faceId: first.id, pixelWidth: 2560 }],
      });
      let faces = await service.listFaces(site.id);
      assert.equal(faces.find((f) => f.id === first.id)?.pixelWidth, 2560);
      assert.equal(faces.find((f) => f.id === second.id)?.pixelWidth, 1280);
      for (const screens of [
        [{ faceId: foreign.id, pixelWidth: 3000 }],
        [{ pixelWidth: 3000 }],
        [
          { faceId: first.id, pixelWidth: 3000 },
          { faceId: first.id, pixelWidth: 4000 },
        ],
        [
          { faceId: first.id, pixelWidth: 3000 },
          { faceId: foreign.id, pixelWidth: 4000 },
        ],
      ]) {
        await assert.rejects(() =>
          service.updateSite(USER, ORG, site.id, { name: 'Changed', screenResolutions: screens }),
        );
      }
      faces = await service.listFaces(site.id);
      assert.equal(faces.find((f) => f.id === first.id)?.pixelWidth, 2560);
      assert.equal(
        (await ds.query('SELECT name FROM billboard_sites WHERE id=$1', [site.id]))[0].name,
        'Ikorodu Road Panel',
      );
    });
  });
  it('rejects invalid pixels on create/edit and preserves values across format changes', async () => {
    await withSchema(async (ds) => {
      const service = await setup(ds);
      const site = await service.createSite(
        ORG,
        createDto({
          format: 'digital_led',
          screenResolutions: [{ pixelWidth: 1920, pixelHeight: 1080 }],
        }),
      );
      const face = (await service.listFaces(site.id))[0];
      for (const value of [0, -1, 1.5, 2147483648, NaN]) {
        await assert.rejects(() =>
          service.createSite(
            ORG,
            createDto({ format: 'digital_led', screenResolutions: [{ pixelWidth: value }] }),
          ),
        );
        await assert.rejects(() =>
          service.updateSite(USER, ORG, site.id, {
            screenResolutions: [{ faceId: face.id, pixelHeight: value }],
          }),
        );
      }
      await assert.rejects(() =>
        service.createSite(ORG, createDto({ screenResolutions: [{ pixelWidth: 1920 }] })),
      );
      await service.updateSite(USER, ORG, site.id, { format: 'static' });
      assert.equal((await service.listFaces(site.id))[0].pixelWidth, 1920);
      await assert.rejects(() =>
        service.updateSite(USER, ORG, site.id, {
          screenResolutions: [{ faceId: face.id, pixelWidth: 800 }],
        }),
      );
      await service.updateSite(USER, ORG, site.id, { format: 'digital_led' });
      assert.equal((await service.listFaces(site.id))[0].pixelHeight, 1080);
    });
  });
  it('creates a first screen on edit only with inventory-create capability and retains incomplete drafts', async () => {
    await withSchema(async (ds) => {
      const service = await setup(ds);
      const site = await service.createSite(ORG, createDto({ format: 'digital_led' }));
      assert.equal((await service.listFaces(site.id)).length, 0);
      await ds.query(
        "INSERT INTO user_capability_overrides(user_id,organization_id,capability,action) VALUES ('kwame-1','org-partner','INVENTORY_CREATE','revoke')",
      );
      await assert.rejects(
        () => service.updateSite(USER, ORG, site.id, { screenResolutions: [{ pixelWidth: 1920 }] }),
        ForbiddenException,
      );
      assert.equal((await service.listFaces(site.id)).length, 0);
      await ds.query('DELETE FROM user_capability_overrides');
      const request = {
        screenResolutions: [{ clientRequestId: randomUUID(), pixelWidth: 1920, pixelHeight: 1080 }],
      };
      await service.updateSite(USER, ORG, site.id, request);
      await service.updateSite(USER, ORG, site.id, request);
      await assert.rejects(
        () =>
          service.updateSite(USER, ORG, site.id, {
            screenResolutions: [{ ...request.screenResolutions[0], pixelWidth: 2048 }],
          }),
        /already saved/,
      );
      assert.equal((await service.listFaces(site.id))[0].pixelWidth, 1920);
      assert.equal((await service.listFaces(site.id)).length, 1);
      await service.removeFace(USER, ORG, (await service.listFaces(site.id))[0].id);
      await assert.rejects(() => service.updateSite(USER, ORG, site.id, request), /was removed/);
      assert.equal((await service.listFaces(site.id)).length, 0);
    });
  });
});

import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DataSource } from 'typeorm';
import { DatabaseService } from '../common/database.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { ENTITIES } from '../common/entities';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import type { CreateSiteDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';
import { PartOneInventoryTrust1720000000007 } from '../migrations/1720000000007-PartOneInventoryTrust';

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
): Promise<void> {
  if (!databaseUrl) throw new Error('POSTGRES_INTEGRATION_URL is required');
  const schema = `inv_trust_${randomUUID().replaceAll('-', '')}`;
  // search_path rides the connection options so every pooled connection sees
  // the throwaway schema, not just the first pooled connection.
  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: ENTITIES,
    extra: { options: `-c search_path=${schema},public` },
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
        bookable boolean NOT NULL DEFAULT true,
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
    if (applyInventoryMigration) {
      await new PartOneInventoryTrust1720000000007().up(dataSource.createQueryRunner());
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
      await migration.up(runner);
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

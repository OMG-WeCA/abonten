import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DataSource } from 'typeorm';
import sharp from 'sharp';
import { DatabaseService } from '../common/database.service';
import { StorageService } from '../common/storage.service';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { InventoryMediaService } from './inventory-media.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { InventoryService } from './inventory.service';
import { InventoryMediaEvidence1760000002000 } from '../migrations/1760000002000-InventoryMediaEvidence';

const url = process.env.POSTGRES_INTEGRATION_URL;
const siteId = '656fd424-f957-480c-9cd2-f68b98b5181d';
const user = { userId: 'synthetic-media-actor' } as AuthenticatedUser;

async function withSchema(work: (db: DataSource, stored: Map<string, Buffer>) => Promise<void>) {
  const schema = `media_evidence_${randomUUID().replaceAll('-', '')}`;
  const db = new DataSource({
    type: 'postgres',
    url,
    synchronize: false,
    entities: [BillboardSiteEntity, SiteAssetEntity, AuditLogEntity],
    extra: { options: `-c search_path=${schema},public` },
  });
  await db.initialize();
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.query(`CREATE TABLE billboard_sites (
      demo_agency_id uuid,
      id uuid PRIMARY KEY, organization_id varchar NOT NULL, code varchar NOT NULL, name varchar NOT NULL,
      type varchar NOT NULL DEFAULT 'billboard', format varchar NOT NULL, sub_format varchar,
      latitude double precision NOT NULL, longitude double precision NOT NULL, geo_polygon json,
      address varchar, city varchar, region varchar, country varchar NOT NULL, market_id varchar,
      orientation_deg double precision, viewing_distance double precision, elevation double precision,
      width double precision, height double precision, area double precision, units varchar,
      illumination_type varchar NOT NULL, illumination_hours varchar, description text,
      status varchar NOT NULL DEFAULT 'draft', rejection_reason text, client_request_id varchar,
      permit_ref varchar, permit_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE site_assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id varchar NOT NULL,
      face_id varchar, kind varchar NOT NULL, storage_ref varchar NOT NULL, captured_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id varchar,
      actor_org_id varchar, action varchar NOT NULL, entity_type varchar, entity_id varchar,
      "before" json, "after" json, at timestamptz DEFAULT now(), ip varchar, request_id varchar,
      created_at timestamptz NOT NULL DEFAULT now())`);
    const runner = db.createQueryRunner();
    try {
      await new InventoryMediaEvidence1760000002000().up(runner);
    } finally {
      await runner.release();
    }
    await db.query(
      `INSERT INTO billboard_sites (id, organization_id, code, name, format, latitude, longitude, country, illumination_type)
      VALUES ($1, 'synthetic-org', 'QA', 'Synthetic LED media fixture', 'digital_led', 5.6037, -0.187, 'Ghana', 'led')`,
      [siteId],
    );
    await work(db, new Map());
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.destroy();
  }
}
function service(db: DataSource, stored: Map<string, Buffer>) {
  const storage = {
    store: async (ref: string, bytes: Buffer) => {
      stored.set(ref, bytes);
      return ref;
    },
    remove: async (ref: string) => {
      stored.delete(ref);
    },
  } as unknown as StorageService;
  return new InventoryMediaService(new DatabaseService(db), storage, {} as InventoryService);
}
const file = async () => ({
  buffer: await sharp({ create: { width: 24, height: 16, channels: 3, background: 'red' } })
    .jpeg()
    .toBuffer(),
  mimetype: 'image/jpeg',
  originalname: 'synthetic.jpg',
});

describe('real PostgreSQL media evidence and audit', { skip: !url }, () => {
  it('serializes simultaneous network retries into one object, one asset and one audit', async () => {
    await withSchema(async (db, stored) => {
      const media = service(db, stored),
        upload = await file(),
        dto = { clientRequestId: randomUUID() };
      const results = await Promise.all([
        media.upload(user, 'synthetic-org', siteId, upload, dto),
        media.upload(user, 'synthetic-org', siteId, upload, dto),
      ]);
      assert.equal(results[0]!.id, results[1]!.id);
      assert.equal(stored.size, 1);
      const [asset] = await db.query('SELECT * FROM site_assets');
      assert.equal(asset.captured_at, null);
      assert.equal(asset.metadata.verification, 'unverified');
      assert.equal(asset.metadata.time.source, 'missing');
      assert.equal(asset.metadata.location.source, 'missing');
      assert.equal((await db.query('SELECT * FROM site_assets')).length, 1);
      const audits = await db.query('SELECT * FROM audit_logs');
      assert.equal(audits.length, 1);
      assert.equal(audits[0].actor_org_id, 'synthetic-org');
      assert.equal(audits[0].after.contentSha256, asset.content_sha256);
    });
  });
  it('rolls back the media row and compensates the object when its audit fails', async () => {
    await withSchema(async (db, stored) => {
      await db.query(
        `ALTER TABLE audit_logs ADD CONSTRAINT simulate_audit_failure CHECK (action <> 'inventory.asset.added')`,
      );
      await assert.rejects(
        service(db, stored).upload(user, 'synthetic-org', siteId, await file(), {}),
      );
      assert.equal((await db.query('SELECT * FROM site_assets')).length, 0);
      assert.equal(stored.size, 0);
    });
  });
  it('recalculates photo distance after a real pin edit without changing stored evidence or its upload audit', async () => {
    await withSchema(async (db, stored) => {
      const asset = await service(db, stored).upload(user, 'synthetic-org', siteId, await file(), {
        captureMethod: 'device_camera',
        deviceLatitude: 5.6037,
        deviceLongitude: -0.187,
        deviceAccuracyMeters: 12,
        deviceCapturedAt: '2026-01-15T10:30:15Z',
      });
      assert.equal(asset.metadata?.evidenceDistanceMeters, 0);
      const [beforeRow] = await db.query('SELECT metadata FROM site_assets WHERE id = $1', [
        asset.id,
      ]);
      const [beforeAudit] = await db.query('SELECT "after" FROM audit_logs WHERE entity_id = $1', [
        asset.id,
      ]);
      await db.query('UPDATE billboard_sites SET latitude = latitude + 0.01 WHERE id = $1', [
        siteId,
      ]);
      const inventory = new InventoryService(
        new DatabaseService(db),
        new CapabilityResolverService(),
        {} as StorageService,
      );
      const projected = (await inventory.listAssets(siteId))[0]!;
      assert.equal(projected.metadata?.evidenceDistanceMeters, 1112);
      assert.equal(projected.metadata?.comparisonScope, 'current_site_pin');
      assert.ok((projected.metadata?.warningCodes as string[]).includes('photo_pin_distance'));
      const [afterRow] = await db.query('SELECT metadata FROM site_assets WHERE id = $1', [
        asset.id,
      ]);
      const [afterAudit] = await db.query('SELECT "after" FROM audit_logs WHERE entity_id = $1', [
        asset.id,
      ]);
      assert.deepEqual(afterRow.metadata, beforeRow.metadata);
      assert.deepEqual(afterAudit.after, beforeAudit.after);
      assert.equal(afterRow.metadata.evidenceDistanceMeters, 0);
      assert.equal(afterAudit.after.evidence.evidenceDistanceMeters, 0);
      assert.equal((await db.query('SELECT * FROM audit_logs')).length, 1);
    });
  });
  it('reverses the additive migration while retaining legacy media', async () => {
    await withSchema(async (db) => {
      await db.query(
        `INSERT INTO site_assets (site_id, kind, storage_ref) VALUES ($1, 'front', 'synthetic/legacy.jpg')`,
        [siteId],
      );
      const runner = db.createQueryRunner();
      try {
        await new InventoryMediaEvidence1760000002000().down(runner);
      } finally {
        await runner.release();
      }
      const rows = await db.query('SELECT * FROM site_assets');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].captured_at, null);
      assert.equal(Object.hasOwn(rows[0], 'metadata'), false);
    });
  });
});

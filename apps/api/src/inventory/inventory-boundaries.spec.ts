import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ForbiddenException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { DatabaseService } from '../common/database.service';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { RateCardEntity } from '../common/entities/rate-card.entity';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { SiteMetadataEntity } from '../common/entities/site-metadata.entity';
import { StorageService } from '../common/storage.service';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { Capability } from '../capabilities/capability.enum';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { REQUIRE_ANY_CAPABILITIES_KEY } from '../capabilities/require-capabilities.decorator';
import { CreateSiteDto } from './dto/inventory.dto';
import { InventoryController } from './inventory.controller';
import { InventoryService, PHOTO_MAX_BYTES } from './inventory.service';

/**
 * Regression tests for the round-13 inventory hardening (red-team fixes):
 * tenant/capability boundaries on listed-site reads, server-side listing
 * completeness at submit + approve, reference-photo upload limits, the
 * last-front-photo guard on asset deletion, and idempotent site creation.
 * The in-memory repository below mirrors the small raw-SQL surface the
 * InventoryService issues (the SELECT/UPDATE/INSERT shapes under test) so
 * these behaviors stay guarded without a live database.
 */

interface Row {
  id?: string;
  [key: string]: unknown;
}

let rowSeq = 0;
const nextRowId = () => `row-${++rowSeq}`;

const toCamel = (col: string) => col.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());

const matches = (row: Row, where: Record<string, unknown>) =>
  Object.entries(where).every(([k, v]) => row[k] === v);

interface RepoOptions {
  /** Replay SELECTs to swallow before returning rows (simulates insert races). */
  replaysToSkip?: { count: number };
  /** INSERTs that should fail with 23505 (concurrent duplicate already committed). */
  conflictsPending?: { count: number };
  /** Assets table consulted by the site repo's front-photo existence probe. */
  assetTable?: Row[];
}

class MemRepo {
  constructor(
    private readonly table: Row[],
    private readonly variant: 'site' | 'asset' | 'plain',
    private readonly opts: RepoOptions = {},
  ) {}

  create(patch: Row): Row {
    return { ...patch };
  }

  async save(row: Row): Promise<Row> {
    if (!row.id) row = { id: nextRowId(), ...row };
    const idx = this.table.findIndex((r) => r.id === row.id);
    if (idx >= 0) this.table[idx] = { ...this.table[idx], ...row };
    else this.table.push({ ...row });
    return row;
  }

  async find({ where }: { where: Record<string, unknown> }): Promise<Row[]> {
    return this.table.filter((r) => matches(r, where));
  }

  async findOne({ where }: { where: Record<string, unknown> }): Promise<Row | null> {
    return (await this.find({ where }))[0] ?? null;
  }

  async delete(where: Record<string, unknown>): Promise<void> {
    for (const r of [...this.table]) {
      if (matches(r, where)) this.table.splice(this.table.indexOf(r), 1);
    }
  }

  async query(sql: string, params: unknown[]): Promise<Row[]> {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (this.variant === 'plain') throw new Error(`Unexpected query on plain repo: ${s}`);
    if (s.startsWith('INSERT INTO billboard_sites')) {
      if ((this.opts.conflictsPending?.count ?? 0) > 0) {
        this.opts.conflictsPending!.count -= 1;
        throw Object.assign(new Error('duplicate key'), { code: '23505' });
      }
      const cols = s
        .slice(s.indexOf('(') + 1, s.indexOf(')'))
        .split(',')
        .map((c) => c.trim());
      const row: Row = { id: nextRowId(), createdAt: 'now', updatedAt: 'now', rejectionReason: null };
      cols.forEach((col, i) => {
        row[toCamel(col)] = params[i];
      });
      this.table.push(row);
      return [row];
    }
    if (s.includes('FROM billboard_sites WHERE organization_id = $1 AND client_request_id = $2')) {
      if ((this.opts.replaysToSkip?.count ?? 0) > 0) {
        this.opts.replaysToSkip!.count -= 1;
        return [];
      }
      return this.table.filter((r) => r.organizationId === params[0] && r.clientRequestId === params[1]);
    }
    if (s.includes('FROM billboard_sites WHERE id =')) {
      return this.table.filter((r) => r.id === params[0]);
    }
    if (this.variant === 'site' && s.startsWith('SELECT 1 FROM site_assets')) {
      const assets = this.opts.assetTable ?? [];
      return assets.some((r) => r.siteId === params[0] && r.kind === 'front') ? [{ ok: 1 }] : [];
    }
    if (this.variant === 'asset' && s.startsWith('SELECT count(*)')) {
      return [{ c: this.table.filter((r) => r.siteId === params[0] && r.kind === 'front').length }];
    }
    if (s.startsWith('UPDATE billboard_sites SET')) {
      const row = this.table.find((r) => r.id === params[params.length - 1]);
      assert.ok(row, 'UPDATE target row missing');
      if (s.includes("SET status = 'decommissioned'")) row.status = 'decommissioned';
      else if (s.includes('rejection_reason')) {
        row.status = params[0];
        row.rejectionReason = params[1];
      } else row.status = params[0];
      return [];
    }
    throw new Error(`Unexpected query: ${s}`);
  }
}

class FakeStorage {
  stored: Array<{ ref: string; buffer: Buffer; contentType: string }> = [];
  removed: string[] = [];
  async store(ref: string, buffer: Buffer, contentType: string) {
    this.stored.push({ ref, buffer, contentType });
    return ref;
  }
  async read() {
    return { body: Buffer.alloc(4), contentType: 'image/png' };
  }
  async remove(ref: string) {
    this.removed.push(ref);
  }
}

interface FixtureOptions {
  site?: Partial<Row>;
  assets?: Row[];
  memberships?: Array<{ userId: string; organizationId: string; role: string }>;
  orgType?: string;
  simulateRace?: boolean;
}

function buildFixture(opts: FixtureOptions = {}) {
  const sites: Row[] = [
    {
      id: 'site-1',
      organizationId: 'org-partner',
      status: 'draft',
      latitude: 5.5297,
      longitude: -0.4137,
      format: 'static',
      width: 12,
      height: 3,
      area: 36,
      rejectionReason: null,
      clientRequestId: null,
      ...opts.site,
    },
  ];
  const assets: Row[] = (opts.assets ?? []).map((a, i) => ({ id: `asset-${i + 1}`, ...a }));
  const memberships = opts.memberships ?? [
    { userId: 'partner-user', organizationId: 'org-partner', role: 'inventory_manager' },
  ];
  const repoFor = async (target: unknown) => {
    if (target === BillboardSiteEntity) {
      return new MemRepo(sites, 'site', {
        replaysToSkip: { count: opts.simulateRace ? 1 : 0 },
        conflictsPending: { count: opts.simulateRace ? 1 : 0 },
        assetTable: assets,
      });
    }
    if (target === SiteAssetEntity) return new MemRepo(assets, 'asset');
    if (target === SiteFaceEntity || target === SiteMetadataEntity || target === RateCardEntity) {
      return new MemRepo([], 'plain');
    }
    if (target === MembershipEntity) {
      return {
        async findOne({ where }: { where: Record<string, unknown> }) {
          return (
            memberships.find(
              (m) =>
                m.userId === where.userId && m.organizationId === where.organizationId && where.status === 'active',
            ) ?? null
          );
        },
      };
    }
    if (target === UserCapabilityOverrideEntity) return { async find() { return []; } };
    if (target === OrganizationEntity) {
      return { async findOne() { return { id: 'org', type: opts.orgType ?? 'media_partner' }; } };
    }
    throw new Error('Unexpected repository');
  };
  const db = { repo: repoFor } as unknown as DatabaseService;
  const storage = new FakeStorage();
  const service = new InventoryService(db, new CapabilityResolverService(), storage as unknown as StorageService);
  return { service, sites, assets, storage };
}

const USER: AuthenticatedUser = { userId: 'partner-user', email: 'kwame@example.test', sessionVersion: 0 };
const OTHER_TENANT: AuthenticatedUser = { userId: 'other-user', email: 'chidi@example.test', sessionVersion: 0 };
const PLANNER: AuthenticatedUser = { userId: 'planner-user', email: 'aisha@example.test', sessionVersion: 0 };
const PLATFORM: AuthenticatedUser = { userId: 'platform-user', email: 'adaora@example.test', sessionVersion: 0 };

const createDto = (patch: Partial<CreateSiteDto> = {}): CreateSiteDto =>
  ({
    name: 'Kasoa Flyover Panel',
    format: 'static',
    latitude: 5.5297,
    longitude: -0.4137,
    city: 'Kasoa',
    country: 'GH',
    width: 12,
    height: 3,
    ...patch,
  }) as CreateSiteDto;

const png = (): { buffer: Buffer; mimetype: string; originalname: string } => ({
  buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]),
  mimetype: 'image/png',
  originalname: 'front.png',
});

describe('inventory boundary regressions (round-13 hardening)', () => {
  describe('listed-site read boundary (assertCanReadSite)', () => {
    it('403s a cross-tenant INVENTORY_VIEW holder on a listed site detail', async () => {
      const { service } = buildFixture({
        site: { status: 'listed' },
        memberships: [{ userId: 'other-user', organizationId: 'org-other', role: 'inventory_manager' }],
      });
      await assert.rejects(() => service.getSite(OTHER_TENANT, 'org-other', 'site-1'), ForbiddenException);
    });

    it('403s the same holder on a listed site asset read (child endpoint)', async () => {
      const { service } = buildFixture({
        site: { status: 'listed' },
        assets: [{ siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/front.png' }],
        memberships: [{ userId: 'other-user', organizationId: 'org-other', role: 'inventory_manager' }],
      });
      await assert.rejects(
        () => service.readAsset(OTHER_TENANT, 'org-other', 'site-1', 'asset-1'),
        ForbiddenException,
      );
    });

    it('admits a MARKETPLACE_VIEW holder for a listed site but not a draft', async () => {
      const listed = buildFixture({
        site: { status: 'listed' },
        memberships: [{ userId: 'planner-user', organizationId: 'org-agency', role: 'planner' }],
        orgType: 'agency',
      });
      const site = await listed.service.getSite(PLANNER, 'org-agency', 'site-1');
      assert.equal(site.id, 'site-1');
      assert.equal(site.status, 'listed');

      const draft = buildFixture({
        memberships: [{ userId: 'planner-user', organizationId: 'org-agency', role: 'planner' }],
        orgType: 'agency',
      });
      await assert.rejects(() => draft.service.getSite(PLANNER, 'org-agency', 'site-1'), ForbiddenException);
    });

    it('admits the owning organization and a platform admin, and streams listed assets', async () => {
      const owner = buildFixture({
        site: { status: 'listed' },
        assets: [{ siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/front.png' }],
      });
      const site = await owner.service.getSite(USER, 'org-partner', 'site-1');
      assert.equal(site.status, 'listed');
      assert.deepEqual(site.faces, []);

      const admin = buildFixture({
        site: { status: 'pending_review' },
        memberships: [{ userId: 'platform-user', organizationId: 'org-platform', role: 'platform_admin' }],
        orgType: 'platform',
      });
      const adminSite = await admin.service.getSite(PLATFORM, 'org-platform', 'site-1');
      assert.equal(adminSite.status, 'pending_review');

      const viewer = buildFixture({
        site: { status: 'listed' },
        assets: [{ siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/front.png' }],
        memberships: [{ userId: 'planner-user', organizationId: 'org-agency', role: 'planner' }],
        orgType: 'agency',
      });
      const file = await viewer.service.readAsset(PLANNER, 'org-agency', 'site-1', 'asset-1');
      assert.deepEqual(file, { body: Buffer.alloc(4), contentType: 'image/png' });
    });
  });

  describe('listing completeness at submit and approve', () => {
    it('rejects a submit without a front-on photo with all server-side problems', async () => {
      const { service } = buildFixture({ site: { format: null, width: 0, latitude: 95, longitude: 200 } });
      await assert.rejects(
        () => service.submitSite('org-partner', 'site-1'),
        (err: unknown) => {
          assert.ok(err instanceof BadRequestException);
          const msg = (err as BadRequestException).message;
          assert.match(msg, /front-on reference photo/);
          assert.match(msg, /latitude must be between -90 and 90/);
          assert.match(msg, /longitude must be between -180 and 180/);
          assert.match(msg, /format is required/);
          assert.match(msg, /width must be greater than 0/);
          return true;
        },
      );
    });

    it('rejects an approve on a pending site that lost its front photo since submission', async () => {
      const { service, assets } = buildFixture({
        site: { status: 'pending_review' },
        assets: [{ siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/gone.png' }],
      });
      assets.length = 0; // photo disappeared after submit (the drift the red team probed)
      await assert.rejects(
        () => service.approveSite('site-1'),
        (err: unknown) => {
          assert.ok(err instanceof BadRequestException);
          assert.match((err as BadRequestException).message, /front-on reference photo/);
          return true;
        },
      );
    });

    it('completes draft -> pending_review -> listed when the site is complete', async () => {
      const { service, sites } = buildFixture({
        assets: [{ siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/front.png' }],
      });
      await service.submitSite('org-partner', 'site-1');
      assert.equal(sites[0].status, 'pending_review');
      const approved = await service.approveSite('site-1');
      assert.equal(approved.status, 'listed');
      assert.equal(sites[0].status, 'listed');
    });
  });

  describe('reference-photo upload limits', () => {
    it('rejects an unknown kind before storing anything', async () => {
      const { service, storage } = buildFixture();
      await assert.rejects(
        () => service.addAsset('org-partner', 'site-1', 'selfie', png()),
        (err: unknown) => {
          assert.ok(err instanceof BadRequestException);
          assert.match((err as BadRequestException).message, /Unknown photo kind/);
          return true;
        },
      );
      assert.equal(storage.stored.length, 0);
    });

    it('rejects a photo larger than 10 MB with 413', async () => {
      const { service, storage } = buildFixture();
      const big = { ...png(), buffer: Buffer.alloc(PHOTO_MAX_BYTES + 1) };
      await assert.rejects(() => service.addAsset('org-partner', 'site-1', 'front', big), PayloadTooLargeException);
      assert.equal(storage.stored.length, 0);
    });

    it('rejects non-image MIME and PNG files with a forged signature', async () => {
      const { service, storage } = buildFixture();
      await assert.rejects(
        () => service.addAsset('org-partner', 'site-1', 'front', { ...png(), mimetype: 'text/plain' }),
        (err: unknown) => {
          assert.ok(err instanceof BadRequestException);
          assert.match((err as BadRequestException).message, /JPEG, PNG, or WebP/);
          return true;
        },
      );
      const forged = { ...png(), buffer: Buffer.alloc(24) }; // claims image/png, wrong magic bytes
      await assert.rejects(() => service.addAsset('org-partner', 'site-1', 'front', forged), BadRequestException);
      assert.equal(storage.stored.length, 0);
    });

    it('checks site ownership before touching storage', async () => {
      const { service, storage } = buildFixture();
      await assert.rejects(() => service.addAsset('org-other', 'site-1', 'front', png()), ForbiddenException);
      assert.equal(storage.stored.length, 0);
    });

    it('stores a valid image and rolls the object back when the DB insert fails', async () => {
      const brokenDb = {
        async repo(target: unknown) {
          if (target === BillboardSiteEntity) {
            return {
              async query(s: string, p: unknown[]) {
                // assertOwnership lookup only
                return [{ organizationId: p[0] === 'site-1' ? 'org-partner' : 'missing' }];
              },
            };
          }
          if (target === SiteAssetEntity) {
            return {
              create: (patch: Row) => ({ ...patch }),
              save: async () => {
                throw new Error('insert failed');
              },
            };
          }
          throw new Error('Unexpected repository');
        },
      } as unknown as DatabaseService;
      const storage = new FakeStorage();
      const broken = new InventoryService(brokenDb, new CapabilityResolverService(), storage as unknown as StorageService);
      await assert.rejects(() => broken.addAsset('org-partner', 'site-1', 'front', png()));
      assert.deepEqual(storage.removed, storage.stored.map((s) => s.ref));
      assert.equal(storage.stored.length, 1);

      const ok = buildFixture();
      const asset = await ok.service.addAsset('org-partner', 'site-1', 'front', png());
      assert.equal(asset.kind, 'front');
      assert.match(String(asset.storageRef), /^assets\/site-1\//);
      assert.equal(ok.storage.stored.length, 1);
    });
  });

  describe('last-front-photo deletion guard', () => {
    it('blocks deleting the only front photo of a pending_review site', async () => {
      const { service, assets, storage } = buildFixture({
        site: { status: 'pending_review' },
        assets: [{ siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/front.png' }],
      });
      await assert.rejects(
        () => service.deleteAsset('org-partner', 'site-1', 'asset-1'),
        (err: unknown) => {
          assert.ok(err instanceof ForbiddenException);
          assert.match((err as ForbiddenException).message, /upload a replacement front-on photo/);
          return true;
        },
      );
      assert.equal(assets.length, 1);
      assert.deepEqual(storage.removed, []);
    });

    it('blocks the same guard on approved and listed sites', async () => {
      for (const status of ['approved', 'listed']) {
        const { service } = buildFixture({
          site: { status },
          assets: [{ siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/front.png' }],
        });
        await assert.rejects(() => service.deleteAsset('org-partner', 'site-1', 'asset-1'), ForbiddenException);
      }
    });

    it('allows a replacement delete when a second front photo exists, and drafts freely', async () => {
      const replacement = buildFixture({
        site: { status: 'pending_review' },
        assets: [
          { siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/old.png' },
          { siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/new.png' },
        ],
      });
      const res = await replacement.service.deleteAsset('org-partner', 'site-1', 'asset-1');
      assert.equal(res.deleted, true);
      assert.equal(replacement.assets.length, 1);
      assert.deepEqual(replacement.storage.removed, ['assets/site-1/old.png']);

      const draft = buildFixture({
        assets: [{ siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/front.png' }],
      });
      await draft.service.deleteAsset('org-partner', 'site-1', 'asset-1');
      assert.equal(draft.assets.length, 0);
    });
  });

  describe('idempotent site creation', () => {
    it('replays the original row when the same clientRequestId is retried', async () => {
      const { service, sites } = buildFixture();
      const first = await service.createSite(
        'org-partner',
        createDto({ clientRequestId: 'req-1', name: 'Kasoa Flyover' }),
      );
      assert.equal(sites.length, 2); // seeded fixture row + the created draft
      const replay = await service.createSite(
        'org-partner',
        createDto({ clientRequestId: 'req-1', name: 'Different name', latitude: 7 }),
      );
      assert.equal(replay.id, first.id);
      assert.equal(replay.name, 'Kasoa Flyover');
      assert.equal(replay.latitude, 5.5297);
      assert.equal(sites.length, 2); // replay added no second row
    });

    it('scopes the idempotency key per organization and ignores absent ids', async () => {
      const { service, sites } = buildFixture();
      const other = await service.createSite(
        'org-other',
        createDto({ clientRequestId: 'req-1', name: 'Other Org Site' }),
      );
      assert.notEqual(other.id, sites[0].id);
      assert.equal(sites.length, 2);

      const a = await service.createSite('org-partner', createDto({ name: 'No Id A' }));
      const b = await service.createSite('org-partner', createDto({ name: 'No Id B' }));
      assert.notEqual(a.id, b.id);
      assert.equal(sites.length, 4);
    });

    it('recovers the stored row when a concurrent insert wins the race (23505)', async () => {
      const { service, sites } = buildFixture({
        simulateRace: true,
        site: { clientRequestId: 'req-race' },
      });
      // The first replay SELECT is raced away; the INSERT then hits the unique
      // index and the catch path must replay the committed row.
      const replayed = await service.createSite(
        'org-partner',
        createDto({ clientRequestId: 'req-race', name: 'Loser of the race' }),
      );
      assert.equal(replayed.name, sites[0].name);
      assert.equal(replayed.id, sites[0].id);
      assert.equal(sites.length, 1);
    });
  });

  describe('detail endpoint capability metadata', () => {
    it('guards GET /sites/:id with auth + any-of (INVENTORY_VIEW, MARKETPLACE_VIEW, PLATFORM_ADMIN)', () => {
      const handler = Object.getOwnPropertyDescriptor(InventoryController.prototype, 'getSite')?.value;
      assert.ok(handler);
      const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
      const caps = Reflect.getMetadata(REQUIRE_ANY_CAPABILITIES_KEY, handler) as Capability[];
      assert.ok(guards.includes(JwtAuthGuard));
      assert.ok(guards.includes(CapabilitiesGuard));
      assert.deepEqual(caps, [Capability.INVENTORY_VIEW, Capability.MARKETPLACE_VIEW, Capability.PLATFORM_ADMIN]);
    });

    it('admits a MARKETPLACE_VIEW holder at the guard; the service decides by status', async () => {
      const memberships = [{ userId: 'planner-user', organizationId: 'org-agency', role: 'planner' }];
      const repoFor = async (target: unknown) => {
        if (target === MembershipEntity) {
          return {
            async findOne({ where }: { where: Record<string, unknown> }) {
              return (
                memberships.find(
                  (m) => m.userId === where.userId && m.organizationId === where.organizationId,
                ) ?? null
              );
            },
          };
        }
        if (target === UserCapabilityOverrideEntity) return { async find() { return []; } };
        if (target === OrganizationEntity) return { async findOne() { return { id: 'org', type: 'agency' }; } };
        throw new Error('Unexpected repository');
      };
      const guard = new CapabilitiesGuard(
        {
          getAllAndOverride: (key: string) =>
            key === REQUIRE_ANY_CAPABILITIES_KEY ? [Capability.MARKETPLACE_VIEW] : undefined,
        } as unknown as Reflector,
        new CapabilityResolverService(),
        { repo: repoFor } as unknown as DatabaseService,
      );
      const context = {
        getHandler: () => () => undefined,
        getClass: () => class InventoryController {},
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-org-id': 'org-agency' },
            user: { userId: 'planner-user', email: 'aisha@example.test', sessionVersion: 0 },
          }),
        }),
      };
      const allowed = await guard.canActivate(context as unknown as ExecutionContext);
      assert.equal(allowed, true);
    });
  });
});
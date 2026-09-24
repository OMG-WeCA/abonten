import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { RateCardEntity } from '../common/entities/rate-card.entity';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { SiteMetadataEntity } from '../common/entities/site-metadata.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import type { CreateSiteDto, UpdateSiteDto } from './dto/inventory.dto';
import { InventoryService } from './inventory.service';

/**
 * Part 1 inventory trust (execution plan §1.4/§1.6, SPEC §5.1/§6.5):
 * - every inventory mutation writes exactly ONE transactional audit row
 *   (actor/org/action/entity/before-after), rolled back with the mutation;
 * - hand-entered structure values require provenance (dimension 'structure');
 * - entry plausibility checks reject the worst errors;
 * - demo-class metadata rows are suppressed from production reads;
 * - front photos carry a capture date.
 *
 * The in-memory transaction harness mirrors the small SQL surface the service
 * issues (raw site SQL + repository CRUD) with snapshot rollback, so rollback
 * and exactly-one-row guarantees stay guarded without a live database. The
 * postgres integration spec proves the same guarantees against real Postgres.
 */

type Row = Record<string, unknown>;

const toCamel = (col: string) => col.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());

// SELECTs return snapshots: a live-row reference would let a post-UPDATE view
// leak into a before/after audit snapshot.
const clone = (r: Row): Row => structuredClone(r);

class MemRepo {
  constructor(
    private readonly table: Row[],
    private readonly assetTable: Row[] = [],
  ) {}

  create(patch: Row): Row {
    return { ...patch };
  }

  async save(row: Row): Promise<Row> {
    if (!row.id) row = { id: `row-${this.table.length + 1}-${Math.random().toString(16).slice(2, 6)}`, ...row };
    const idx = this.table.findIndex((r) => r.id === row.id);
    if (idx >= 0) this.table[idx] = { ...this.table[idx], ...row };
    else this.table.push({ ...row });
    return row;
  }

  async find({ where }: { where?: Record<string, unknown> } = {}): Promise<Row[]> {
    if (!where) return [...this.table];
    return this.table.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  }

  async findOne({ where }: { where: Record<string, unknown> }): Promise<Row | undefined> {
    return (await this.find({ where }))[0];
  }

  async delete(where: Record<string, unknown>): Promise<void> {
    for (const r of [...this.table]) {
      if (Object.entries(where).every(([k, v]) => r[k] === v)) {
        this.table.splice(this.table.indexOf(r), 1);
      }
    }
  }

  async query(sql: string, params: unknown[]): Promise<Row[]> {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/^INSERT INTO billboard_sites/.test(s)) {
      const cols = s
        .slice(s.indexOf('(') + 1, s.indexOf(')'))
        .split(',')
        .map((c) => c.trim());
      const row: Row = { id: `site-${this.table.length + 1}`, createdAt: 'now', updatedAt: 'now' };
      cols.forEach((col, i) => {
        row[toCamel(col)] = params[i];
      });
      this.table.push(row);
      return [row];
    }
    if (s.startsWith('UPDATE billboard_sites SET')) {
      const row = this.table.find((r) => r.id === params[params.length - 1]);
      assert.ok(row, 'UPDATE target row missing');
      const setClause = s.slice(s.indexOf('SET') + 3, s.lastIndexOf('WHERE'));
      for (const pair of setClause.split(', ')) {
        const m = pair.match(/^\s*([a-z_]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const col = toCamel(m[1]);
        const rhs = m[2].replace(/::\w+$/, '');
        if (/^\$\d+$/.test(rhs)) row[col] = params[Number(rhs.slice(1)) - 1];
        else if (rhs === 'NULL') row[col] = null;
        else if (/^\d+(\.\d+)?$/.test(rhs)) row[col] = Number(rhs);
        else row[col] = rhs.replace(/^'|'$/g, '');
      }
      return [];
    }
    if (/FROM billboard_sites WHERE organization_id = \$1 AND client_request_id = \$2/.test(s)) {
      return this.table.filter((r) => r.organizationId === params[0] && r.clientRequestId === params[1]).map(clone);
    }
    if (/FROM billboard_sites WHERE id = \$1/.test(s)) {
      return this.table.filter((r) => r.id === params[0]).map(clone);
    }
    if (/FROM site_metadata WHERE site_id = \$1/.test(s)) {
      // The demo filter is enforced by the query shape itself: apply it only
      // when the SQL actually carries the production predicate in its WHERE
      // clause (the owner variant is unfiltered by design, so the harness
      // must not blur the two reads — that blur made the old assertion false).
      const productionOnly = /WHERE site_id = \$1 AND/.test(s);
      return this.table
        .filter(
          (r) =>
            r.siteId === params[0] && (!productionOnly || (r.dataClass ?? 'production') !== 'demo'),
        )
        .map(clone);
    }
    if (/SELECT 1 FROM site_assets/.test(s)) {
      return this.assetTable.some((r) => r.siteId === params[0] && r.kind === 'front') ? [{ ok: 1 }] : [];
    }
    if (/SELECT count\(\*\)/.test(s)) {
      return [{ c: this.assetTable.filter((r) => r.siteId === params[0] && r.kind === 'front').length }];
    }
    throw new Error(`Unexpected query: ${s}`);
  }
}

interface Harness {
  service: InventoryService;
  sites: Row[];
  faces: Row[];
  assets: Row[];
  metadata: Row[];
  rateCards: Row[];
  audit: Row[];
  storage: { stored: string[]; removed: string[] };
}

function buildHarness(
  options: {
    site?: Row;
    auditFails?: () => boolean;
    memberships?: Array<{ userId: string; organizationId: string; role: string }>;
    organizations?: Array<{ id: string; type: string }>;
  } = {},
): Harness {
  const sites: Row[] = [
    {
      id: 'site-1',
      organizationId: 'org-partner',
      code: 'SITE-1',
      name: 'Fixture Site',
      type: 'billboard',
      format: 'static',
      latitude: 6.6058,
      longitude: 3.3545,
      city: 'Lagos',
      country: 'Nigeria',
      width: 12,
      height: 3,
      area: 36,
      units: 'm',
      illuminationType: 'front_lit',
      status: 'draft',
      rejectionReason: null,
      clientRequestId: null,
      ...options.site,
    },
  ];
  const faces: Row[] = [];
  const assets: Row[] = [];
  const metadata: Row[] = [];
  const rateCards: Row[] = [];
  const audit: Row[] = [];
  const organizations: Row[] = options.organizations ?? [{ id: 'org-partner', type: 'media_partner' }];
  const storage = { stored: [] as string[], removed: [] as string[] };

  // Sync: TypeORM's EntityManager.getRepository is synchronous.
  const repoFor = (target: unknown) => {
    switch (target) {
      case BillboardSiteEntity:
        return new MemRepo(sites, assets);
      case SiteFaceEntity:
        return new MemRepo(faces);
      case SiteAssetEntity:
        return new MemRepo(assets);
      case SiteMetadataEntity:
        return new MemRepo(metadata);
      case RateCardEntity:
        return new MemRepo(rateCards);
      case AuditLogEntity:
        return options.auditFails?.()
          ? {
              create: (patch: Row) => patch,
              save: async () => {
                throw new Error('audit write failed');
              },
            }
          : new MemRepo(audit);
      case MembershipEntity:
        return {
          async findOne({ where }: { where: Record<string, unknown> }) {
            const configured = (options.memberships ?? []).find(
              (m) => m.userId === where.userId && m.organizationId === where.organizationId,
            );
            if (configured) return { ...where, role: configured.role, status: 'active' };
            return { role: 'inventory_manager', ...where, status: 'active' };
          },
        };
      case UserCapabilityOverrideEntity:
        return { async find() { return []; } };
      case OrganizationEntity:
        return new MemRepo(organizations);
      default:
        throw new Error(`Unexpected repository: ${String(target)}`);
    }
  };

  // Raw-SQL executor mirroring the shapes the service issues inside
  // transactions (sites) plus the production metadata read.
  const executeQuery = async (sql: string, params: unknown[]): Promise<Row[]> => {
    if (sql.includes('site_metadata')) return new MemRepo(metadata).query(sql, params);
    if (/site_assets/.test(sql)) return new MemRepo(assets).query(sql, params);
    return new MemRepo(sites, assets).query(sql, params);
  };

  const transaction = async (work: (manager: unknown) => Promise<unknown>) => {
    const snap = {
      sites: structuredClone(sites),
      faces: structuredClone(faces),
      assets: structuredClone(assets),
      metadata: structuredClone(metadata),
      rateCards: structuredClone(rateCards),
      audit: structuredClone(audit),
    };
    const manager = {
      query: executeQuery,
      getRepository: (target: unknown) => repoFor(target),
    };
    try {
      return await work(manager);
    } catch (err) {
      sites.splice(0, sites.length, ...snap.sites);
      faces.splice(0, faces.length, ...snap.faces);
      assets.splice(0, assets.length, ...snap.assets);
      metadata.splice(0, metadata.length, ...snap.metadata);
      rateCards.splice(0, rateCards.length, ...snap.rateCards);
      audit.splice(0, audit.length, ...snap.audit);
      throw err;
    }
  };

  const db = { repo: async (t: unknown) => repoFor(t), transaction } as unknown as DatabaseService;
  const service = new InventoryService(
    db,
    new CapabilityResolverService(),
    {
      async store(ref: string) {
        storage.stored.push(ref);
        return ref;
      },
      async read() {
        return Buffer.alloc(4);
      },
      async remove(ref: string) {
        storage.removed.push(ref);
      },
    } as never,
  );
  return { service, sites, faces, assets, metadata, rateCards, audit, storage };
}

const USER: AuthenticatedUser = { userId: 'kwame-1', email: 'kwame@example.test', sessionVersion: 0 };
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

const png = () => ({
  buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]),
  mimetype: 'image/png',
  originalname: 'front.png',
});

const auditActions = (h: Harness) => h.audit.map((r) => r.action);

// ------------------------------------------------------------------- tests
describe('inventory audit: exactly one transactional row per mutation', () => {
  it('createSite writes exactly one audit row with actor/org/entity/after', async () => {
    const h = buildHarness();
    const site = await h.service.createSite(ORG, createDto(), { userId: USER.userId, orgId: ORG });
    assert.equal(h.audit.length, 1);
    const row = h.audit[0];
    assert.equal(row.action, 'inventory.site.created');
    assert.equal(row.actorUserId, 'kwame-1');
    assert.equal(row.actorOrgId, ORG);
    assert.equal(row.entityType, 'billboard_site');
    assert.equal(row.entityId, (site as unknown as Row).id);
    assert.equal(row.before, null);
    assert.equal((row.after as Row).name, 'Ikorodu Road Panel');
  });

  it('updateSite writes one audit row with before/after snapshots', async () => {
    const h = buildHarness();
    await h.service.updateSite(USER, ORG, 'site-1', {
      name: 'Renamed Site',
      illuminationHours: '24/7',
    } as UpdateSiteDto);
    assert.equal(h.audit.length, 1);
    assert.equal(h.audit[0].action, 'inventory.site.updated');
    assert.equal((h.audit[0].before as Row).name, 'Fixture Site');
    assert.equal((h.audit[0].after as Row).name, 'Renamed Site');
    assert.equal(h.sites[0].name, 'Renamed Site');
  });

  it('deleteSite (decommission) writes one audit row and keeps the snapshot', async () => {
    const h = buildHarness();
    await h.service.deleteSite(USER, ORG, 'site-1');
    assert.deepEqual(auditActions(h), ['inventory.site.deleted']);
    assert.equal(h.sites[0].status, 'decommissioned');
    assert.equal((h.audit[0].before as Row).status, 'draft');
    assert.equal((h.audit[0].after as Row).status, 'decommissioned');
  });

  it('lifecycle mutations each write exactly one audit row', async () => {
    const h = buildHarness({ site: { status: 'draft' } });
    // The server-side submit gate requires a front-on reference photo (SPEC §7.1).
    h.assets.push({ id: 'asset-1', siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/front.png' });
    await h.service.submitSite(USER, ORG, 'site-1');
    await h.service.approveSite(USER, ORG, 'site-1');
    await h.service.suspendSite(USER, ORG, 'site-1');
    await h.service.unsuspendSite(USER, ORG, 'site-1');
    assert.deepEqual(auditActions(h), [
      'inventory.site.submitted',
      'inventory.site.approved',
      'inventory.site.suspended',
      'inventory.site.unsuspended',
    ]);
    const approve = h.audit[1];
    assert.equal((approve.before as Row).status, 'pending_review');
    assert.equal((approve.after as Row).status, 'listed');
    assert.equal(h.sites[0].status, 'listed');

    // A reject returns a pending site to draft with its reason recorded.
    const pending = buildHarness({ site: { status: 'pending_review' } });
    pending.assets.push({ id: 'asset-1', siteId: 'site-1', kind: 'front', storageRef: 'assets/site-1/front.png' });
    await pending.service.rejectSite(USER, ORG, 'site-1', 'blurry photo');
    assert.deepEqual(auditActions(pending), ['inventory.site.rejected']);
    assert.equal(pending.sites[0].status, 'draft');
    assert.equal(pending.sites[0].rejectionReason, 'blurry photo');
    assert.equal((pending.audit[0].after as Row).rejectionReason, 'blurry photo');
  });

  it('face mutations each write one audit row', async () => {
    const h = buildHarness();
    const face = await h.service.addFace(USER, ORG, 'site-1', {
      faceLabel: 'A',
      width: 12,
      height: 3,
      area: 36,
      units: 'm',
      bookable: true,
      printableArea: '11.5 x 2.5 m',
    });
    await h.service.updateFace(USER, ORG, String((face as unknown as Row).id), { bookable: false });
    await h.service.removeFace(USER, ORG, String((face as unknown as Row).id));
    assert.deepEqual(auditActions(h), [
      'inventory.face.added',
      'inventory.face.updated',
      'inventory.face.removed',
    ]);
    assert.equal(h.faces.length, 0);
    assert.equal((h.audit[1].after as Row).bookable, false);
    assert.equal(h.audit[2].after, null);
  });

  it('asset upload + delete write one audit row each; storage removal is post-commit', async () => {
    const h = buildHarness();
    const asset = await h.service.addAsset(USER, ORG, 'site-1', 'front', png(), new Date('2026-08-01'));
    assert.deepEqual(auditActions(h), ['inventory.asset.added']);
    await h.service.deleteAsset(USER, ORG, 'site-1', String((asset as unknown as Row).id));
    assert.deepEqual(auditActions(h), ['inventory.asset.added', 'inventory.asset.deleted']);
    assert.equal(h.audit[1].after, null);
  });

  it('metadata + rate card mutations each write one audit row', async () => {
    const h = buildHarness();
    const m = await h.service.addMetadata(
      USER,
      ORG,
      'site-1',
      { dimension: 'structure', payload: { aadt: 55000 }, source: 'field visit', method: 'count' },
    );
    await h.service.updateMetadata(USER, ORG, String((m as unknown as Row).id), { confidence: 0.9 });
    const rc = await h.service.createRateCard(USER, ORG, 'site-1', {
      currency: 'NGN',
      rates: { perDay: 150000 },
      effectiveFrom: '2026-09-01',
    });
    await h.service.updateRateCard(USER, ORG, String((rc as unknown as Row).id), { seasonalRules: { rule: 'harmattan' } });
    assert.deepEqual(auditActions(h), [
      'inventory.metadata.added',
      'inventory.metadata.updated',
      'inventory.rate_card.created',
      'inventory.rate_card.updated',
    ]);
    assert.equal((h.audit[0].after as Row).dataClass, 'production');
  });

  it('a failing audit insert rolls the whole mutation back (no site, no audit)', async () => {
    const failing = buildHarness({ auditFails: () => true });
    await assert.rejects(
      () => failing.service.createSite(ORG, createDto(), { userId: USER.userId, orgId: ORG }),
      (err: unknown) => String((err as Error).message).includes('audit write failed'),
    );
    assert.equal(failing.sites.length, 1); // only the seeded fixture row; the insert rolled back
    assert.equal(failing.audit.length, 0);
    assert.equal(failing.metadata.length, 0);
    assert.equal(failing.storage.stored.length, 0);
  });

  it('a replayed idempotent create writes no second audit row', async () => {
    const h = buildHarness();
    const dto = createDto({ clientRequestId: 'req-x' });
    const first = await h.service.createSite(ORG, dto, { userId: USER.userId, orgId: ORG });
    const replay = await h.service.createSite(ORG, { ...dto, name: 'Second Try' }, { userId: USER.userId, orgId: ORG });
    assert.equal(h.sites.length, 2); // seeded fixture + one created draft
    assert.equal(h.audit.length, 1); // replay wrote no second audit row
    assert.equal((replay as unknown as Row).id, (first as unknown as Row).id);
    assert.equal((replay as unknown as Row).name, 'Ikorodu Road Panel');
  });

  it('cross-tenant mutations write no audit rows', async () => {
    const h = buildHarness();
    await assert.rejects(() => h.service.deleteSite(USER, 'org-other', 'site-1'), ForbiddenException);
    await assert.rejects(
      () => h.service.updateFace(USER, 'org-other', 'nope', { bookable: false }),
      NotFoundException,
    );
    await assert.rejects(
      () => h.service.addAsset(USER, 'org-other', 'site-1', 'front', png(), new Date()),
      ForbiddenException,
    );
    // Asset deletion is marketplace-visible to other orgs' asset ids; the
    // ownership assert must fire before any row or object is touched.
    await assert.rejects(
      () => h.service.deleteAsset(USER, 'org-other', 'site-1', 'asset-1'),
      ForbiddenException,
    );
    assert.equal(h.audit.length, 0);
    assert.equal(h.assets.length, 0);
    assert.deepEqual(h.storage.removed, []);
  });
});

describe('inventory provenance + plausibility (SPEC §5.1 trust contract)', () => {
  it('requires provenance when orientation/viewing distance/elevation is entered', async () => {
    const h = buildHarness();
    await assert.rejects(
      () => h.service.createSite(ORG, createDto({ orientationDeg: 90 }), { userId: USER.userId, orgId: ORG }),
      BadRequestException,
    );
    await assert.rejects(
      () =>
        h.service.createSite(
          ORG,
          createDto({ orientationDeg: 90, structureProvenance: { source: 'x' } as never }),
          { userId: USER.userId, orgId: ORG },
        ),
      BadRequestException,
    );
    assert.equal(h.sites.length, 1);
    assert.equal(h.audit.length, 0);
    assert.equal(h.metadata.length, 0);
  });

  it('stores a structure metadata row (partner_declared) with valid provenance', async () => {
    const h = buildHarness();
    await h.service.createSite(
      ORG,
      createDto({
        orientationDeg: 90,
        viewingDistance: 40,
        structureProvenance: { source: 'Google Maps street view', method: 'visual estimate', collectedAt: '2026-09-01' },
      }),
      { userId: USER.userId, orgId: ORG },
    );
    assert.equal(h.metadata.length, 1);
    const record = h.metadata[0];
    assert.equal(record.dimension, 'structure');
    assert.equal(record.verification, 'partner_declared');
    assert.equal(record.dataClass, 'production');
    assert.equal(record.source, 'Google Maps street view');
    assert.deepEqual((record.payload as Row).fields, ['orientationDeg', 'viewingDistance']);
  });

  it('updateSite changing orientation without provenance is rejected; with provenance it records it', async () => {
    const h = buildHarness({ site: { orientationDeg: 90 } });
    await assert.rejects(
      () => h.service.updateSite(USER, ORG, 'site-1', { orientationDeg: 300 } as UpdateSiteDto),
      BadRequestException,
    );
    // Unchanged value needs no provenance.
    await h.service.updateSite(USER, ORG, 'site-1', { orientationDeg: 90 } as UpdateSiteDto);
    assert.deepEqual(h.metadata.filter((m) => m.dimension === 'structure'), []);
    await h.service.updateSite(
      USER,
      ORG,
      'site-1',
      {
        orientationDeg: 300,
        structureProvenance: { source: 'Site visit', method: 'compass reading', collectedAt: '2026-09-10' },
      } as UpdateSiteDto,
    );
    const structure = h.metadata.filter((m) => m.dimension === 'structure');
    assert.equal(structure.length, 1);
    assert.equal(structure[0].verification, 'partner_declared');
    assert.equal((structure[0].payload as Row).orientationDeg, 300);
    assert.equal(h.sites[0].orientationDeg, 300);
  });

  it('plausibility: rejects bad orientation, non-positive viewing distance, malformed hours, and out-of-box coordinates', async () => {
    const h = buildHarness();
    await assert.rejects(
      () => h.service.createSite(ORG, createDto({ illuminationHours: 'sometimes' }), { userId: USER.userId, orgId: ORG }),
      (err: BadRequestException) => { assert.match(err.message, /illumination hours/); return true; },
    );
    await assert.rejects(
      () =>
        h.service.createSite(
          ORG,
          createDto({
            orientationDeg: 300,
            viewingDistance: 0,
            structureProvenance: { source: 'site visit', method: 'compass' },
          }),
          { userId: USER.userId, orgId: ORG },
        ),
      (err: BadRequestException) => { assert.match(err.message, /viewing distance/); return true; },
    );
    await assert.rejects(
      () =>
        h.service.createSite(
          ORG,
          createDto({ country: 'Nigeria', latitude: 48.2, longitude: 11.5 }),
          { userId: USER.userId, orgId: ORG },
        ),
      (err: BadRequestException) => { assert.match(err.message, /outside nigeria's bounding box/i); return true; },
    );
    await assert.rejects(
      () => h.service.createSite(ORG, createDto({ orientationDeg: 360 }), { userId: USER.userId, orgId: ORG }),
      (err: BadRequestException) => { assert.match(err.message, /between 0 and 359/); return true; },
    );
    // Same shape as retained seed data is accepted.
    const ok = await h.service.createSite(
      ORG,
      createDto({ illuminationHours: '18:00-06:00' }),
      { userId: USER.userId, orgId: ORG },
    );
    assert.ok(ok);
  });

  it('front photos require a capture date; other kinds may omit it', async () => {
    const h = buildHarness();
    await assert.rejects(
      () => h.service.addAsset(USER, ORG, 'site-1', 'front', png()),
      (err: BadRequestException) => { assert.match(err.message, /capture date/); return true; },
    );
    const context = await h.service.addAsset(USER, ORG, 'site-1', 'context', png());
    assert.ok(context);
  });
});

describe('demo metadata suppression (truth reset §1.4.1)', () => {
  const seedRows = (h: Harness) => {
    h.metadata.push(
      {
        id: 'demo-1',
        siteId: 'site-1',
        dimension: 'traffic',
        payload: { aadt: 85000 },
        source: 'LAMATA',
        method: 'count',
        dataClass: 'demo',
        verification: 'unverified',
      },
      {
        id: 'prod-1',
        siteId: 'site-1',
        dimension: 'structure',
        payload: { orientationDeg: 90 },
        source: 'compass',
        method: 'reading',
        dataClass: 'production',
        verification: 'partner_declared',
      },
    );
  };

  it('listMetadata (the production read) excludes demo rows and includes production rows', async () => {
    const h = buildHarness();
    seedRows(h);
    const visible = await h.service.listMetadata('site-1');
    assert.deepEqual(
      (visible as Row[]).map((r) => r.id),
      ['prod-1'],
    );
  });

  it('getSite metadata follows the reader: owner sees labelled demo rows; marketplace viewer gets the production set', async () => {
    const h = buildHarness({
      site: { status: 'listed' },
      memberships: [{ userId: 'aisha-1', organizationId: 'org-agency', role: 'planner' }],
      organizations: [
        { id: 'org-partner', type: 'media_partner' },
        { id: 'org-agency', type: 'agency' },
      ],
    });
    seedRows(h);
    // The owning partner reads through the unfiltered owner view (the UI
    // labels demo rows): demo-1 and prod-1 both come back.
    const ownerSite = await h.service.getSite(
      { userId: 'kwame-1', email: 'x', sessionVersion: 0 } as AuthenticatedUser,
      ORG,
      'site-1',
    );
    assert.deepEqual((ownerSite.metadata as Row[]).map((r) => r.id), ['demo-1', 'prod-1']);
    assert.equal(ownerSite.organizationId, 'org-partner');

    // A cross-org MARKETPLACE_VIEW planner reads the same route as a buyer:
    // production rows only, and the owning organization id is minimized away
    // exactly like /marketplace/:id.
    const buyerSite = await h.service.getSite(
      { userId: 'aisha-1', email: 'aisha@example.test', sessionVersion: 0 } as AuthenticatedUser,
      'org-agency',
      'site-1',
    );
    assert.deepEqual((buyerSite.metadata as Row[]).map((r) => r.id), ['prod-1']);
    assert.equal(buyerSite.organizationId, undefined);
  });

  it('partner-entered metadata is always production-class even if a demo flag is attempted', async () => {
    const h = buildHarness();
    const record = await h.service.addMetadata(
      USER,
      ORG,
      'site-1',
      { dimension: 'traffic', payload: {}, verification: 'partner_declared', dataClass: 'demo' } as never,
    );
    const row = record as unknown as Row;
    assert.equal(row.dataClass, 'production');
    assert.equal(row.verification, 'partner_declared');
  });
});
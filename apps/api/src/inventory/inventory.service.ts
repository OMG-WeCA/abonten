import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { StorageService } from '../common/storage.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { Capability } from '../capabilities/capability.enum';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { SiteMetadataEntity } from '../common/entities/site-metadata.entity';
import { METADATA_COLUMNS, PRODUCTION_METADATA_WHERE } from '../common/metadata-filter';
import { RateCardEntity } from '../common/entities/rate-card.entity';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import {
  INVENTORY_AUDIT_ENTITY,
  writeInventoryAudit,
  type InventoryAuditAction,
} from './inventory-audit';
import {
  plausibilityProblems,
  structureFieldsTouched,
  type StructureProvenance,
} from './inventory-validation';
import type {
  CreateFaceDto,
  CreateMetadataDto,
  CreateRateCardDto,
  CreateSiteDto,
  ListSitesQueryDto,
  UpdateFaceDto,
  UpdateMetadataDto,
  UpdateRateCardDto,
  UpdateSiteDto,
} from './dto/inventory.dto';

const SITE_DETAIL_COLUMNS =
  'id, organization_id AS "organizationId", code, name, type, format, sub_format AS "subFormat", ' +
  'latitude, longitude, geo_polygon AS "geoPolygon", ' +
  'address, city, region, country, market_id AS "marketId", orientation_deg AS "orientationDeg", ' +
  'viewing_distance AS "viewingDistance", elevation, width, height, area, units, ' +
  'illumination_type AS "illuminationType", illumination_hours AS "illuminationHours", ' +
  'description, status, rejection_reason AS "rejectionReason", permit_ref AS "permitRef", permit_expires_at AS "permitExpiresAt", ' +
  'created_at AS "createdAt", updated_at AS "updatedAt"';

// Same columns as SITE_DETAIL_COLUMNS but table-qualified with `s.` for the list
// query, which lateral-joins the newest front photo for list thumbnails.
const LIST_SITE_COLUMNS =
  's.id, s.organization_id AS "organizationId", s.code, s.name, s.type, s.format, s.sub_format AS "subFormat", ' +
  's.latitude, s.longitude, s.geo_polygon AS "geoPolygon", ' +
  's.address, s.city, s.region, s.country, s.market_id AS "marketId", s.orientation_deg AS "orientationDeg", ' +
  's.viewing_distance AS "viewingDistance", s.elevation, s.width, s.height, s.area, s.units, ' +
  's.illumination_type AS "illuminationType", s.illumination_hours AS "illuminationHours", ' +
  's.description, s.status, s.rejection_reason AS "rejectionReason", s.permit_ref AS "permitRef", s.permit_expires_at AS "permitExpiresAt", ' +
  's.created_at AS "createdAt", s.updated_at AS "updatedAt"';

/** Reference-photo constraints enforced server-side (SPEC §6.2) so the
 * advertised 10 MB JPEG/PNG/WebP limit cannot be bypassed with direct multipart
 * posts. Magic bytes are checked too — the claimed MIME alone is not trusted. */
export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PHOTO_KINDS = new Set(['front', 'context', 'night', 'diagram']);

/** Production metadata filter (execution plan §1.4.1): demo-class rows are
 * excluded from every production read — site detail, context surfaces, and any
 * future model input. Enforced in the query itself, never in a post-filter. */
function hasImageSignature(mimetype: string, buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  if (mimetype === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') {
    return (
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
      buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
    );
  }
  if (mimetype === 'image/webp') {
    return (
      buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return false;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 16) || 'site'
  );
}

function randomSuffix(): string {
  return Math.random().toString(16).slice(2, 8);
}

interface InsertEntry {
  col: string;
  val?: unknown;
  sql?: 'geo_polygon';
}

/** Acting user + organization for an inventory mutation; audit rows carry it. */
interface Actor {
  userId?: string;
  orgId?: string;
}

const actorOf = (user: AuthenticatedUser, orgId: string | undefined): Actor => ({
  userId: user.userId,
  orgId: orgId,
});

@Injectable()
export class InventoryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly resolver: CapabilityResolverService,
    private readonly storage: StorageService,
  ) {}

  // ----------------------------------------------------------------- sites
  async createSite(orgId: string, dto: CreateSiteDto, actor: Actor = {}) {
    await this.assertMediaPartnerOrg(orgId);
    const repo = await this.db.repo(BillboardSiteEntity);
    // Idempotent create (ambiguous-network retry): a client-supplied operation
    // id replays the original draft instead of creating a second one — and a
    // replay writes no second audit row.
    if (dto.clientRequestId) {
      const replayed = await repo.query(
        `SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE organization_id = $1 AND client_request_id = $2`,
        [orgId, dto.clientRequestId],
      );
      if (replayed[0]) return replayed[0];
    }
    const code = dto.code ?? `${slug(dto.name)}-${randomSuffix()}`.toUpperCase();
    const area = dto.area ?? dto.width * dto.height;
    const illuminationType = dto.illuminationType ?? 'none';

    // Entry plausibility checks (SPEC §5.1 trust contract 6): catch the worst
    // errors before anything is stored.
    const problems = plausibilityProblems({
      latitude: dto.latitude,
      longitude: dto.longitude,
      country: dto.country,
      orientationDeg: dto.orientationDeg,
      viewingDistance: dto.viewingDistance,
      elevation: dto.elevation,
      illuminationHours: dto.illuminationHours,
    });
    if (problems.length > 0) {
      throw new BadRequestException(`Please fix: ${problems.join('; ')}.`);
    }

    // Provenance contract (SPEC §5.1 trust contract 3): a hand-entered
    // orientation/viewing distance/elevation must say how it is known.
    const structureFields = structureFieldsTouched(dto);
    if (structureFields.length > 0) {
      this.assertStructureProvenance(dto.structureProvenance);
    }

    const entries: InsertEntry[] = [
      { col: 'organization_id', val: orgId },
      { col: 'code', val: code },
      { col: 'name', val: dto.name },
      { col: 'type', val: dto.type ?? 'billboard' },
      { col: 'format', val: dto.format },
      { col: 'latitude', val: dto.latitude },
      { col: 'longitude', val: dto.longitude },
      { col: 'city', val: dto.city },
      { col: 'country', val: dto.country },
      { col: 'width', val: dto.width },
      { col: 'height', val: dto.height },
      { col: 'area', val: area },
      { col: 'units', val: dto.units ?? 'm' },
      { col: 'illumination_type', val: illuminationType },
      { col: 'status', val: 'draft' },
    ];
    const addOpt = (col: string, value: unknown) => {
      if (value !== undefined) entries.push({ col, val: value });
    };
    if (dto.clientRequestId) addOpt('client_request_id', dto.clientRequestId);
    addOpt('sub_format', dto.subFormat);
    addOpt('address', dto.address);
    addOpt('region', dto.region);
    addOpt('market_id', dto.marketId);
    addOpt('orientation_deg', dto.orientationDeg);
    addOpt('viewing_distance', dto.viewingDistance);
    addOpt('elevation', dto.elevation);
    addOpt('illumination_hours', dto.illuminationHours);
    addOpt('description', dto.description);
    addOpt('permit_ref', dto.permitRef);
    addOpt('permit_expires_at', dto.permitExpiresAt ? new Date(dto.permitExpiresAt) : undefined);
    if (dto.geoPolygon && dto.geoPolygon.length >= 3) {
      entries.push({ col: 'geo_polygon', sql: 'geo_polygon' });
    }

    const cols: string[] = [];
    const placeholders: string[] = [];
    const params: unknown[] = [];
    let i = 0;
    for (const e of entries) {
      cols.push(e.col);
      if (e.sql === 'geo_polygon') {
        i += 1;
        const n = i;
        params.push(JSON.stringify(dto.geoPolygon!));
        placeholders.push(`$${n}::json`);
      } else {
        i += 1;
        params.push(e.val);
        placeholders.push(`$${i}`);
      }
    }
    const sql = `INSERT INTO billboard_sites (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${SITE_DETAIL_COLUMNS}`;
    try {
      return await this.db.transaction(async (manager) => {
        const rows = await manager.query(sql, params);
        const site = rows[0];
        // One audit row per inventory mutation (SPEC §6.5): written in the same
        // transaction; the structure-provenance metadata row is part of this
        // mutation and surfaced through the site audit entry.
        if (structureFields.length > 0 && dto.structureProvenance) {
          await this.writeStructureProvenance(manager, site.id, dto.structureProvenance, dto);
        }
        await writeInventoryAudit(manager, actor, {
          action: 'inventory.site.created',
          entityType: INVENTORY_AUDIT_ENTITY.site,
          entityId: site.id,
          before: null,
          after: this.siteAuditSnapshot(site, dto.structureProvenance),
        });
        return site;
      });
    } catch (err) {
      const e = err as { code?: string };
      // A concurrent duplicate of the same client request lost the race:
      // replay the stored row instead of failing the client. The losing
      // transaction leaves no audit row behind (rolled back with the insert).
      if (e?.code === '23505' && dto.clientRequestId) {
        const existing = await repo.query(
          `SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE organization_id = $1 AND client_request_id = $2`,
          [orgId, dto.clientRequestId],
        );
        if (existing[0]) return existing[0];
      }
      throw err;
    }
  }

  /** List sites: a partner sees their org's sites; a planner sees all listed sites. */
  async listSites(user: AuthenticatedUser, orgId: string | undefined, q: ListSitesQueryDto) {
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    const caps = await this.effectiveCapabilities(user.userId, orgId);

    const repo = await this.db.repo(BillboardSiteEntity);
    const where: string[] = [];
    const params: unknown[] = [];
    const push = (clause: string, ...values: unknown[]) => {
      const start = params.length + 1;
      for (const v of values) params.push(v);
      let n = start;
      where.push(clause.replace(/\?/g, () => `$${n++}`));
    };

    if (caps.has(Capability.PLATFORM_ADMIN)) {
      // Platform admins browse all sites across orgs (review workflow).
      if (q.status) push('status = ?', q.status);
    } else if (caps.has(Capability.INVENTORY_VIEW) && orgId) {
      push('organization_id = ?', orgId);
      if (q.status) push('status = ?', q.status);
    } else if (caps.has(Capability.MARKETPLACE_VIEW)) {
      where.push("status = 'listed'");
    } else {
      throw new ForbiddenException('No inventory or marketplace access');
    }
    if (q.format) push('format = ?', q.format);
    if (q.city) push('city ILIKE ?', `%${q.city}%`);
    if (q.country) push('country = ?', q.country);
    if (q.search) push('(name ILIKE ? OR description ILIKE ?)', `%${q.search}%`, `%${q.search}%`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const offset = (page - 1) * limit;
    // Lateral join picks the newest front photo so lists can render a thumbnail
    // without N+1 asset requests. frontAssetId is null when no photo exists.
    const rows = await repo.query(
      `SELECT ${LIST_SITE_COLUMNS}, sa.id AS "frontAssetId", sa.storage_ref AS "frontAssetRef" ` +
        `FROM billboard_sites s ` +
        `LEFT JOIN LATERAL (` +
        `  SELECT a.id, a.storage_ref FROM site_assets a WHERE a.site_id::text = s.id::text AND a.kind = 'front' ORDER BY a.created_at DESC LIMIT 1` +
        `) sa ON true ` +
        `${whereSql} ` +
        `ORDER BY s.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const totalRows = await repo.query(`SELECT count(*)::int AS c FROM billboard_sites s ${whereSql}`, params);
    const total = totalRows[0]?.c ?? 0;
    return { items: rows, total, page, limit };
  }

  async getSite(user: AuthenticatedUser, orgId: string | undefined, siteId: string) {
    const repo = await this.db.repo(BillboardSiteEntity);
    const rows = await repo.query(`SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE id = $1`, [siteId]);
    const site = rows[0];
    if (!site) throw new NotFoundException('Site not found');
    const reader = await this.assertCanReadSite(user, orgId, siteId, site.status);
    const [faces, assets, rateCards] = await Promise.all([
      this.listFaces(siteId),
      this.listAssets(siteId),
      this.listRateCards(siteId),
    ]);
    // Metadata follows the reader, not the route: the unfiltered owner view
    // (demo-class rows visible, labelled in the UI) is for the owning partner
    // and platform admins only. A marketplace viewer gets the same
    // production-filtered set as /marketplace/:id — seeded showcase fiction
    // never reaches a planner/buyer through this route.
    const metadata =
      reader === 'marketplace'
        ? await this.listMetadata(siteId)
        : await this.listSiteMetadataForOwner(siteId);
    if (reader === 'marketplace') {
      // Match the marketplace surface's minimization: cross-org buyers do not
      // receive the owning organization's internal id.
      const rest = { ...(site as Record<string, unknown>) };
      delete rest.organizationId;
      return { ...rest, faces, assets, metadata, rateCards };
    }
    return { ...site, faces, assets, metadata, rateCards };
  }

  async updateSite(user: AuthenticatedUser, orgId: string, siteId: string, dto: UpdateSiteDto) {
    await this.assertOwnership(orgId, siteId);
    await this.db.transaction(async (manager) => {
      const currentRows = await manager.query(
        `SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE id = $1`,
        [siteId],
      );
      const current = currentRows[0];
      if (!current) throw new NotFoundException('Site not found');

      const sets: string[] = [];
      const params: unknown[] = [];
      // Nullable strings may be cleared with an explicit null; numeric core
      // fields must not (a null wipe would corrupt live inventory data).
      const NUMERIC_KEYS = new Set<keyof UpdateSiteDto>([
        'latitude', 'longitude', 'width', 'height', 'area',
        'orientationDeg', 'viewingDistance', 'elevation',
      ]);
      const map: Array<[string, keyof UpdateSiteDto]> = [
        ['name', 'name'], ['code', 'code'], ['type', 'type'], ['format', 'format'],
        ['sub_format', 'subFormat'], ['address', 'address'], ['city', 'city'], ['region', 'region'],
        ['country', 'country'], ['market_id', 'marketId'], ['orientation_deg', 'orientationDeg'],
        ['viewing_distance', 'viewingDistance'], ['elevation', 'elevation'], ['width', 'width'],
        ['height', 'height'], ['area', 'area'], ['units', 'units'], ['illumination_type', 'illuminationType'],
        ['illumination_hours', 'illuminationHours'], ['description', 'description'], ['permit_ref', 'permitRef'],
      ];
      for (const [col, key] of map) {
        const v = dto[key];
        if (v === undefined || (v === null && NUMERIC_KEYS.has(key))) continue;
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      }
      if (dto.permitExpiresAt !== undefined) {
        params.push(dto.permitExpiresAt ? new Date(dto.permitExpiresAt) : null);
        sets.push(`permit_expires_at = $${params.length}`);
      }
      // Numeric core fields: an explicit null must never wipe a stored number
      // (locale-mangled input must be fixed in the client, not destroyed here).
      if (dto.latitude != null) {
        params.push(dto.latitude);
        sets.push(`latitude = $${params.length}`);
      }
      if (dto.longitude != null) {
        params.push(dto.longitude);
        sets.push(`longitude = $${params.length}`);
      }
      if (dto.geoPolygon !== undefined) {
        if (dto.geoPolygon && dto.geoPolygon.length >= 3) {
          params.push(JSON.stringify(dto.geoPolygon));
          sets.push(`geo_polygon = $${params.length}::json`);
        } else {
          sets.push('geo_polygon = NULL');
        }
      }
      // Keep the derived area consistent with corrected dimensions (SPEC §6.2).
      if (dto.area === undefined && (dto.width !== undefined || dto.height !== undefined)) {
        const newWidth = dto.width ?? Number(current.width ?? 0);
        const newHeight = dto.height ?? Number(current.height ?? 0);
        if (newWidth > 0 && newHeight > 0) {
          params.push(newWidth * newHeight);
          sets.push(`area = $${params.length}`);
        }
      }

      if (sets.length > 0) {
        // Plausibility on the values actually being written: an update that
        // leaves a field untouched must not fail on unrelated stored values.
        const incoming: Parameters<typeof plausibilityProblems>[0] = {};
        if (dto.orientationDeg !== undefined) incoming.orientationDeg = dto.orientationDeg;
        if (dto.viewingDistance !== undefined) incoming.viewingDistance = dto.viewingDistance;
        if (dto.elevation !== undefined) incoming.elevation = dto.elevation;
        if (dto.illuminationHours != null) incoming.illuminationHours = dto.illuminationHours;
        if (
          dto.latitude !== undefined ||
          dto.longitude !== undefined ||
          dto.country !== undefined
        ) {
          // The bounding-box check needs the effective (post-patch) combination.
          incoming.latitude = dto.latitude ?? Number(current.latitude);
          incoming.longitude = dto.longitude ?? Number(current.longitude);
          incoming.country = dto.country ?? current.country;
        }
        const problems = plausibilityProblems(incoming);
        if (problems.length > 0) {
          throw new BadRequestException(`Please fix: ${problems.join('; ')}.`);
        }

        // Provenance contract: a changed hand-entered structure value must say
        // how it is known (SPEC §5.1 trust contract 3).
        const touched = structureFieldsTouched(dto, current);
        if (touched.length > 0 && !dto.structureProvenance) {
          throw new BadRequestException(
            'Provenance required: say how you know the orientation, viewing distance, or elevation you are changing (source and method).',
          );
        }

        params.push(siteId);
        await manager.query(
          `UPDATE billboard_sites SET ${sets.join(', ')} WHERE id = $${params.length}`,
          params,
        );
        const afterRows = await manager.query(
          `SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE id = $1`,
          [siteId],
        );
        if (touched.length > 0 && dto.structureProvenance) {
          await this.writeStructureProvenance(manager, siteId, dto.structureProvenance, {
            orientationDeg: dto.orientationDeg,
            viewingDistance: dto.viewingDistance,
            elevation: dto.elevation,
          });
        }
        await writeInventoryAudit(manager, actorOf(user, orgId), {
          action: 'inventory.site.updated',
          entityType: INVENTORY_AUDIT_ENTITY.site,
          entityId: siteId,
          before: this.siteAuditSnapshot(current),
          after: this.siteAuditSnapshot(afterRows[0], dto.structureProvenance),
        });
      }
    });
    // Read-back happens on a fresh connection after the commit, so the caller
    // always sees the persisted state, never pre-commit rows.
    return this.getSite(user, orgId, siteId);
  }

  async deleteSite(user: AuthenticatedUser, orgId: string, siteId: string) {
    await this.assertOwnership(orgId, siteId);
    await this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE id = $1`,
        [siteId],
      );
      if (!rows[0]) throw new NotFoundException('Site not found');
      await manager.query(`UPDATE billboard_sites SET status = 'decommissioned' WHERE id = $1`, [siteId]);
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.site.deleted',
        entityType: INVENTORY_AUDIT_ENTITY.site,
        entityId: siteId,
        before: this.siteAuditSnapshot(rows[0]),
        after: { status: 'decommissioned' },
      });
    });
    return { id: siteId, status: 'decommissioned' };
  }

  async submitSite(user: AuthenticatedUser, orgId: string, siteId: string) {
    await this.assertOwnership(orgId, siteId);
    // SPEC §7.1 step 2: coordinates, format, dimensions and a reference image
    // are validated server-side at submit — not only in the browser.
    const problems = await this.listingProblems(siteId);
    if (problems.length > 0) {
      throw new BadRequestException(`Site is not ready for review: ${problems.join('; ')}.`);
    }
    await this.transitionWithAudit(user, orgId, siteId, 'draft', 'pending_review', {
      action: 'inventory.site.submitted',
      reason: null,
    });
    return { id: siteId, status: 'pending_review' };
  }

  async approveSite(user: AuthenticatedUser, orgId: string | undefined, siteId: string) {
    // SPEC §5.1 lifecycle: pending_review → approved → listed (two steps); clear any rejection reason.
    // Re-validate completeness at approval: inventory may have changed since submission.
    const problems = await this.listingProblems(siteId);
    if (problems.length > 0) {
      throw new BadRequestException(`Site cannot be listed yet: ${problems.join('; ')}.`);
    }
    await this.db.transaction(async (manager) => {
      const rows = await manager.query(`SELECT status FROM billboard_sites WHERE id = $1`, [siteId]);
      if (!rows[0]) throw new NotFoundException('Site not found');
      if (rows[0].status !== 'pending_review') {
        throw new ForbiddenException(`Site is ${rows[0].status}, expected pending_review`);
      }
      // One endpoint mutation = one audit row: the two-step transition lands in
      // a single audit record (before pending_review, after listed).
      await manager.query(
        `UPDATE billboard_sites SET status = 'approved', rejection_reason = NULL WHERE id = $1`,
        [siteId],
      );
      await manager.query(`UPDATE billboard_sites SET status = 'listed' WHERE id = $1`, [siteId]);
      await writeInventoryAudit(manager, { userId: user.userId, orgId }, {
        action: 'inventory.site.approved',
        entityType: INVENTORY_AUDIT_ENTITY.site,
        entityId: siteId,
        before: { status: 'pending_review' },
        after: { status: 'listed' },
      });
    });
    return { id: siteId, status: 'listed' };
  }

  async rejectSite(user: AuthenticatedUser, orgId: string | undefined, siteId: string, reason: string) {
    await this.transitionWithAudit(user, orgId, siteId, 'pending_review', 'draft', {
      action: 'inventory.site.rejected',
      reason,
    });
    return { id: siteId, status: 'draft', rejectionReason: reason };
  }

  async suspendSite(user: AuthenticatedUser, orgId: string | undefined, siteId: string) {
    await this.transitionWithAudit(user, orgId, siteId, ['listed', 'approved'], 'suspended', {
      action: 'inventory.site.suspended',
    });
    return { id: siteId, status: 'suspended' };
  }

  async unsuspendSite(user: AuthenticatedUser, orgId: string | undefined, siteId: string) {
    await this.transitionWithAudit(user, orgId, siteId, 'suspended', 'listed', {
      action: 'inventory.site.unsuspended',
    });
    return { id: siteId, status: 'listed' };
  }

  // ----------------------------------------------------------------- faces
  async addFace(user: AuthenticatedUser, orgId: string, siteId: string, dto: CreateFaceDto) {
    await this.assertOwnership(orgId, siteId);
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(SiteFaceEntity);
      const face = await repo.save(
        repo.create({
          siteId,
          faceLabel: dto.faceLabel,
          width: dto.width,
          height: dto.height,
          area: dto.area,
          units: dto.units,
          printableArea: dto.printableArea,
          bookable: dto.bookable ?? true,
          pixelWidth: dto.pixelWidth,
          pixelHeight: dto.pixelHeight,
          spotLengthSeconds: dto.spotLengthSeconds,
          loopLengthSeconds: dto.loopLengthSeconds,
          spotsPerLoop: dto.spotsPerLoop,
          proofOfPlay: dto.proofOfPlay,
        }),
      );
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.face.added',
        entityType: INVENTORY_AUDIT_ENTITY.face,
        entityId: (face as { id: string }).id,
        before: null,
        after: faceAuditSnapshot(face),
      });
      return face;
    });
  }

  async listFaces(siteId: string) {
    const repo = await this.db.repo(SiteFaceEntity);
    return repo.find({ where: { siteId } });
  }

  async updateFace(user: AuthenticatedUser, orgId: string, faceId: string, dto: UpdateFaceDto) {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(SiteFaceEntity);
      const face = await repo.findOne({ where: { id: faceId } });
      if (!face) throw new NotFoundException('Face not found');
      await this.assertOwnership(orgId, (face as { siteId: string }).siteId);
      const before = faceAuditSnapshot(face);
      Object.assign(face, {
        ...(dto.faceLabel !== undefined && { faceLabel: dto.faceLabel }),
        ...(dto.width !== undefined && { width: dto.width }),
        ...(dto.height !== undefined && { height: dto.height }),
        ...(dto.area !== undefined && { area: dto.area }),
        ...(dto.units !== undefined && { units: dto.units }),
        ...(dto.printableArea !== undefined && { printableArea: dto.printableArea }),
        ...(dto.bookable !== undefined && { bookable: dto.bookable }),
        ...(dto.pixelWidth !== undefined && { pixelWidth: dto.pixelWidth }),
        ...(dto.pixelHeight !== undefined && { pixelHeight: dto.pixelHeight }),
        ...(dto.spotLengthSeconds !== undefined && { spotLengthSeconds: dto.spotLengthSeconds }),
        ...(dto.loopLengthSeconds !== undefined && { loopLengthSeconds: dto.loopLengthSeconds }),
        ...(dto.spotsPerLoop !== undefined && { spotsPerLoop: dto.spotsPerLoop }),
        ...(dto.proofOfPlay !== undefined && { proofOfPlay: dto.proofOfPlay }),
      });
      const saved = await repo.save(face);
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.face.updated',
        entityType: INVENTORY_AUDIT_ENTITY.face,
        entityId: faceId,
        before,
        after: faceAuditSnapshot(saved),
      });
      return saved;
    });
  }

  async removeFace(user: AuthenticatedUser, orgId: string, faceId: string) {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(SiteFaceEntity);
      const face = await repo.findOne({ where: { id: faceId } });
      if (!face) throw new NotFoundException('Face not found');
      await this.assertOwnership(orgId, (face as { siteId: string }).siteId);
      await repo.delete({ id: faceId });
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.face.removed',
        entityType: INVENTORY_AUDIT_ENTITY.face,
        entityId: faceId,
        before: faceAuditSnapshot(face),
        after: null,
      });
      return { id: faceId, deleted: true };
    });
  }

  // ----------------------------------------------------------------- assets
  async addAsset(
    user: AuthenticatedUser,
    orgId: string,
    siteId: string,
    kind: string,
    file: { buffer: Buffer; mimetype: string; originalname: string },
    capturedAt?: Date,
  ) {
    // Validate ownership BEFORE storing, so an invalid/non-owned site does not
    // create an orphan object.
    await this.assertOwnership(orgId, siteId);
    // Server-side constraints (client checks are advisory only): a controlled
    // 4xx/413 instead of unbounded memory/storage use.
    if (!PHOTO_KINDS.has(kind)) {
      throw new BadRequestException('Unknown photo kind.');
    }
    if (file.buffer.length > PHOTO_MAX_BYTES) {
      throw new PayloadTooLargeException('Reference photos are limited to 10 MB.');
    }
    if (!PHOTO_MIME_TYPES.has(file.mimetype) || !hasImageSignature(file.mimetype, file.buffer)) {
      throw new BadRequestException('Only JPEG, PNG, or WebP images are accepted.');
    }
    // Provenance for reference photos (SPEC §5.1 trust contract 5): a front-on
    // photo must carry its capture date; other kinds may but need not.
    if (kind === 'front' && !capturedAt) {
      throw new BadRequestException('Front photos need a capture date (capturedAt).');
    }
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const storageRef = `assets/${siteId}/${Date.now()}-${safeName}`;
    await this.storage.store(storageRef, file.buffer, file.mimetype);
    try {
      return await this.db.transaction(async (manager) => {
        const repo = manager.getRepository(SiteAssetEntity);
        const asset = await repo.save(repo.create({ siteId, kind, storageRef, capturedAt }));
        await writeInventoryAudit(manager, actorOf(user, orgId), {
          action: 'inventory.asset.added',
          entityType: INVENTORY_AUDIT_ENTITY.asset,
          entityId: (asset as { id: string }).id,
          before: null,
          after: {
            kind,
            storageRef,
            capturedAt: capturedAt ? capturedAt.toISOString() : null,
          },
        });
        return asset;
      });
    } catch (err) {
      // DB insert failed — remove the stored object to avoid orphans. This is
      // best-effort compensation around a single-system transaction, not a
      // cross-system ACID guarantee (execution plan §1.6 gate 4 note).
      await this.storage.remove(storageRef).catch(() => undefined);
      throw err;
    }
  }

  async listAssets(siteId: string) {
    const repo = await this.db.repo(SiteAssetEntity);
    return repo.find({ where: { siteId } });
  }

  /** Read a stored asset for streaming to an authenticated owner/admin (SPEC §6.2).
  * Seeded placeholder assets store an external URL, returned for redirection. */
  async readAsset(user: AuthenticatedUser, orgId: string | undefined, siteId: string, assetId: string) {
    await this.assertCanReadSite(user, orgId, siteId);
    const repo = await this.db.repo(SiteAssetEntity);
    const asset = await repo.findOne({ where: { id: assetId, siteId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (/^https?:\/\//i.test(asset.storageRef)) {
      return { redirect: asset.storageRef };
    }
    return this.storage.read(asset.storageRef);
  }

  async deleteAsset(user: AuthenticatedUser, orgId: string, siteId: string, assetId: string) {
    // Tenant boundary first (same as every sibling mutation): without this a
    // caller with INVENTORY_EDIT in their own org could delete another
    // organization's reference photos via the marketplace-visible site ids,
    // and the post-commit storage removal below would make it irreversible.
    await this.assertOwnership(orgId, siteId);
    let storageRef: string | undefined;
    await this.db.transaction(async (manager) => {
      const repo = manager.getRepository(SiteAssetEntity);
      const asset = await repo.findOne({ where: { id: assetId, siteId } });
      if (!asset) throw new NotFoundException('Asset not found');
      // A listed or in-review site must keep its front-on reference photo
      // (SPEC §7.1): deleting the last one would leave invalid live inventory.
      if ((asset as { kind: string }).kind === 'front') {
        const siteRows = await manager.query(`SELECT status FROM billboard_sites WHERE id = $1`, [siteId]);
        const status = siteRows[0]?.status;
        if (status === 'pending_review' || status === 'approved' || status === 'listed') {
          const fronts = await manager.query(
            `SELECT count(*)::int AS c FROM site_assets WHERE site_id = $1 AND kind = 'front'`,
            [siteId],
          );
          if ((fronts[0]?.c ?? 0) <= 1) {
            throw new ForbiddenException(
              'This site is in review or listed — upload a replacement front-on photo before removing this one.',
            );
          }
        }
      }
      storageRef = (asset as { storageRef: string }).storageRef;
      await repo.delete({ id: assetId, siteId });
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.asset.deleted',
        entityType: INVENTORY_AUDIT_ENTITY.asset,
        entityId: assetId,
        before: { kind: (asset as { kind: string }).kind, storageRef },
        after: null,
      });
    });
    // Post-commit compensation: the DB row and its audit entry are already
    // durable; the object-storage delete is best-effort. A failed removal
    // leaves an unreferenced object — never a broken reference. This boundary
    // is explicitly not a cross-system ACID transaction.
    if (storageRef) {
      await this.storage.remove(storageRef).catch(() => undefined);
    }
    return { id: assetId, deleted: true };
  }

  // ----------------------------------------------------------------- metadata
  async addMetadata(user: AuthenticatedUser, orgId: string, siteId: string, dto: CreateMetadataDto) {
    await this.assertOwnership(orgId, siteId);
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(SiteMetadataEntity);
      // Partner-entered enrichment is always production-class data: the demo
      // class exists for seeded showcase data (execution plan §1.4.1).
      const record = await repo.save(
        repo.create({
          siteId,
          dimension: dto.dimension,
          payload: dto.payload,
          source: dto.source,
          method: dto.method,
          confidence: dto.confidence,
          collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : undefined,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
          verification: dto.verification ?? 'unverified',
          dataClass: 'production',
        }),
      );
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.metadata.added',
        entityType: INVENTORY_AUDIT_ENTITY.metadata,
        entityId: (record as { id: string }).id,
        before: null,
        after: metadataAuditSnapshot(record),
      });
      return record;
    });
  }

  /**
   * Metadata reads are production surfaces: demo-class rows (seeded showcase
   * data) are suppressed here — in the query, not in a post-filter — so no
   * planning surface or future model input can pick them up silently.
   */
  async listMetadata(siteId: string) {
    const repo = await this.db.repo(SiteMetadataEntity);
    return repo.query(
      `SELECT ${METADATA_COLUMNS} FROM site_metadata WHERE site_id = $1 AND ${PRODUCTION_METADATA_WHERE} ORDER BY created_at ASC`,
      [siteId],
    );
  }

  /**
   * The owning partner's (and platform admin's) site detail shows every
   * attached record — including demo-class showcase rows — so the partner can
   * see exactly what is attached to their site (the UI labels demo rows).
   * Suppression of demo data stays on production/planning reads
   * (listMetadata) and on every cross-org marketplace read (getSite).
   */
  async listSiteMetadataForOwner(siteId: string) {
    const repo = await this.db.repo(SiteMetadataEntity);
    return repo.query(
      `SELECT ${METADATA_COLUMNS} FROM site_metadata WHERE site_id = $1 ORDER BY created_at ASC`,
      [siteId],
    );
  }

  async updateMetadata(user: AuthenticatedUser, orgId: string, metadataId: string, dto: UpdateMetadataDto) {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(SiteMetadataEntity);
      const m = await repo.findOne({ where: { id: metadataId } });
      if (!m) throw new NotFoundException('Metadata not found');
      await this.assertOwnership(orgId, (m as { siteId: string }).siteId);
      const before = metadataAuditSnapshot(m);
      Object.assign(m, {
        ...(dto.dimension !== undefined && { dimension: dto.dimension }),
        ...(dto.payload !== undefined && { payload: dto.payload }),
        ...(dto.source !== undefined && { source: dto.source }),
        ...(dto.method !== undefined && { method: dto.method }),
        ...(dto.confidence !== undefined && { confidence: dto.confidence }),
        ...(dto.collectedAt !== undefined && { collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : null }),
        ...(dto.expiresAt !== undefined && { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
        ...(dto.verification !== undefined && { verification: dto.verification }),
      });
      const saved = await repo.save(m);
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.metadata.updated',
        entityType: INVENTORY_AUDIT_ENTITY.metadata,
        entityId: metadataId,
        before,
        after: metadataAuditSnapshot(saved),
      });
      return saved;
    });
  }

  // ----------------------------------------------------------------- rate cards
  async createRateCard(user: AuthenticatedUser, orgId: string, siteId: string, dto: CreateRateCardDto) {
    await this.assertMediaPartnerOrg(orgId);
    await this.assertOwnership(orgId, siteId);
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(RateCardEntity);
      const card = await repo.save(
        repo.create({
          organizationId: orgId,
          siteId,
          currency: dto.currency,
          rates: dto.rates,
          seasonalRules: dto.seasonalRules ?? null,
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
        }),
      );
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.rate_card.created',
        entityType: INVENTORY_AUDIT_ENTITY.rateCard,
        entityId: (card as { id: string }).id,
        before: null,
        after: rateCardAuditSnapshot(card),
      });
      return card;
    });
  }

  async listRateCards(siteId: string) {
    const repo = await this.db.repo(RateCardEntity);
    return repo.find({ where: { siteId } });
  }

  async updateRateCard(user: AuthenticatedUser, orgId: string, rateCardId: string, dto: UpdateRateCardDto) {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(RateCardEntity);
      const rc = await repo.findOne({ where: { id: rateCardId } });
      if (!rc) throw new NotFoundException('Rate card not found');
      if ((rc as { organizationId: string }).organizationId !== orgId) {
        throw new ForbiddenException('Not your rate card');
      }
      const before = rateCardAuditSnapshot(rc);
      Object.assign(rc, {
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.rates !== undefined && { rates: dto.rates }),
        ...(dto.seasonalRules !== undefined && { seasonalRules: dto.seasonalRules }),
        ...(dto.effectiveFrom !== undefined && { effectiveFrom: new Date(dto.effectiveFrom) }),
        ...(dto.effectiveTo !== undefined && { effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null }),
      });
      const saved = await repo.save(rc);
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.rate_card.updated',
        entityType: INVENTORY_AUDIT_ENTITY.rateCard,
        entityId: rateCardId,
        before,
        after: rateCardAuditSnapshot(saved),
      });
      return saved;
    });
  }

  // ------------------------------------------------------- provenance helper
  /** Store the "how do you know this?" record for a hand-entered structure
   * attribute (SPEC §5.1 trust contract 3) inside the mutation's transaction. */
  private async writeStructureProvenance(
    manager: import('typeorm').EntityManager,
    siteId: string,
    provenance: StructureProvenance,
    values: { orientationDeg?: number | null; viewingDistance?: number | null; elevation?: number | null },
  ): Promise<void> {
    const repo = manager.getRepository(SiteMetadataEntity);
    const fields = structureFieldsTouched(values);
    await repo.save(
      repo.create({
        siteId,
        dimension: 'structure',
        payload: {
          fields,
          ...(values.orientationDeg !== undefined && { orientationDeg: values.orientationDeg }),
          ...(values.viewingDistance !== undefined && { viewingDistance: values.viewingDistance }),
          ...(values.elevation !== undefined && { elevation: values.elevation }),
        },
        source: provenance.source,
        method: provenance.method,
        collectedAt: provenance.collectedAt ? new Date(provenance.collectedAt) : new Date(),
        verification: 'partner_declared',
        dataClass: 'production',
      }),
    );
  }

  private assertStructureProvenance(provenance?: StructureProvenance): void {
    if (!provenance || !provenance.source?.trim() || !provenance.method?.trim()) {
      throw new BadRequestException(
        'Provenance required: say how you measured the orientation, viewing distance, or elevation (source and method).',
      );
    }
  }

  private siteAuditSnapshot(
    row: Record<string, unknown> | undefined,
    structureProvenance?: StructureProvenance,
  ): Record<string, unknown> {
    if (!row) return {};
    const snapshot = { ...row };
    delete snapshot.geoPolygon;
    if (structureProvenance) {
      snapshot.structureProvenance = {
        source: structureProvenance.source,
        method: structureProvenance.method,
        ...(structureProvenance.collectedAt ? { collectedAt: structureProvenance.collectedAt } : {}),
      };
    }
    return snapshot;
  }

  /** Tenant-safe read gate for a site and its children (faces/assets/metadata/
  * rate cards): the owning organization (INVENTORY_VIEW), a platform admin, or
  * — only for listed inventory — a marketplace viewer. A plain INVENTORY_VIEW
  * holder from another organization never passes, listed or not (SPEC §4.5). */
  /**
   * Who is reading, and therefore which metadata variant the detail response
   * may carry: 'owner' sees every attached record (demo rows labelled in the
   * UI), 'platform' sees the same for moderation, and 'marketplace' — any
   * cross-org MARKETPLACE_VIEW holder on a listed site — reads the
   * production-filtered set (see getSite). Throws for everyone else.
   */
  async assertCanReadSite(
    user: AuthenticatedUser,
    orgId: string | undefined,
    siteId: string,
    knownStatus?: string,
  ): Promise<'owner' | 'platform' | 'marketplace'> {
    const repo = await this.db.repo(BillboardSiteEntity);
    let status = knownStatus;
    let organizationId: string | undefined;
    if (status === undefined || orgId === undefined) {
      const rows = await repo.query(
        `SELECT organization_id AS "organizationId", status FROM billboard_sites WHERE id = $1`,
        [siteId],
      );
      if (!rows[0]) throw new NotFoundException('Site not found');
      organizationId = rows[0].organizationId;
      status = rows[0].status;
    } else {
      const rows = await repo.query(
        `SELECT organization_id AS "organizationId" FROM billboard_sites WHERE id = $1`,
        [siteId],
      );
      if (!rows[0]) throw new NotFoundException('Site not found');
      organizationId = rows[0].organizationId;
    }
    const caps = await this.effectiveCapabilities(user.userId, orgId);
    const isOwner = organizationId === orgId && caps.has(Capability.INVENTORY_VIEW);
    const isPlatformAdmin = caps.has(Capability.PLATFORM_ADMIN);
    const isMarketplaceViewer = caps.has(Capability.MARKETPLACE_VIEW) && status === 'listed';
    if (isOwner) return 'owner';
    if (isPlatformAdmin) return 'platform';
    if (isMarketplaceViewer) return 'marketplace';
    throw new ForbiddenException('Site not available');
  }

  /** Only media-partner organizations can create/manage billboard inventory. */
  private async assertMediaPartnerOrg(orgId: string | undefined): Promise<void> {
    if (!orgId) throw new ForbiddenException('No active organization context');
    const orgs = await this.db.repo(OrganizationEntity);
    const org = await orgs.findOne({ where: { id: orgId } }).catch(() => null);
    if (!org || org.type !== 'media_partner') {
      throw new ForbiddenException('Only media-partner organizations can manage billboard inventory');
    }
  }

  // ----------------------------------------------------------------- helpers
  /** SPEC §7.1 listing-completeness problems, checked server-side at submit
  * and again at approval: valid coordinates, a format, positive dimensions,
  * and a front-on reference photo. Empty array = ready. */
  private async listingProblems(siteId: string): Promise<string[]> {
    const repo = await this.db.repo(BillboardSiteEntity);
    const rows = await repo.query(
      `SELECT latitude, longitude, format, width, height FROM billboard_sites WHERE id = $1`,
      [siteId],
    );
    if (!rows[0]) throw new NotFoundException('Site not found');
    const s = rows[0];
    const problems: string[] = [];
    const lat = Number(s.latitude);
    const lon = Number(s.longitude);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90) problems.push('latitude must be between -90 and 90');
    if (!Number.isFinite(lon) || Math.abs(lon) > 180) problems.push('longitude must be between -180 and 180');
    if (!s.format) problems.push('format is required');
    if (!(Number(s.width) > 0)) problems.push('width must be greater than 0');
    if (!(Number(s.height) > 0)) problems.push('height must be greater than 0');
    const front = await repo.query(
      `SELECT 1 FROM site_assets WHERE site_id = $1 AND kind = 'front' LIMIT 1`,
      [siteId],
    );
    if (!front[0]) problems.push('a front-on reference photo is required');
    return problems;
  }

  private async assertOwnership(orgId: string | undefined, siteId: string) {
    const repo = await this.db.repo(BillboardSiteEntity);
    const rows = await repo.query(
      `SELECT organization_id AS "organizationId" FROM billboard_sites WHERE id = $1`,
      [siteId],
    );
    if (!rows[0]) throw new NotFoundException('Site not found');
    if (rows[0].organizationId !== orgId) throw new ForbiddenException('Not your site');
  }

  /** One lifecycle transition + its audit row in a single transaction. */
  private async transitionWithAudit(
    user: AuthenticatedUser,
    orgId: string | undefined,
    siteId: string,
    from: string | string[],
    to: string,
    opts: { action: InventoryAuditAction; reason?: string | null },
  ) {
    await this.db.transaction(async (manager) => {
      const fromList = Array.isArray(from) ? from : [from];
      const rows = await manager.query(`SELECT status FROM billboard_sites WHERE id = $1`, [siteId]);
      if (!rows[0]) throw new NotFoundException('Site not found');
      const beforeStatus = rows[0].status;
      if (!fromList.includes(beforeStatus)) {
        throw new ForbiddenException(`Site is ${beforeStatus}, expected ${fromList.join('/')}`);
      }
      if (opts.reason !== undefined) {
        await manager.query(
          `UPDATE billboard_sites SET status = $1, rejection_reason = $2 WHERE id = $3`,
          [to, opts.reason, siteId],
        );
      } else {
        await manager.query(`UPDATE billboard_sites SET status = $1 WHERE id = $2`, [to, siteId]);
      }
      await writeInventoryAudit(manager, { userId: user.userId, orgId }, {
        action: opts.action,
        entityType: INVENTORY_AUDIT_ENTITY.site,
        entityId: siteId,
        before: { status: beforeStatus },
        after: { status: to, ...(opts.reason !== undefined ? { rejectionReason: opts.reason } : {}) },
      });
    });
  }

  private async effectiveCapabilities(userId: string, orgId: string | undefined) {
    if (!orgId) return new Set<Capability>();
    const memberships = await this.db.repo(MembershipEntity);
    const m = await memberships
      .findOne({ where: { userId, organizationId: orgId, status: 'active' } })
      .catch(() => null);
    if (!m) return new Set<Capability>();
    const overrides = await this.db
      .repo(UserCapabilityOverrideEntity)
      .then((r) => r.find({ where: { userId, organizationId: orgId } }))
      .catch(() => []);
    const orgs = await this.db.repo(OrganizationEntity);
    const org = await orgs.findOne({ where: { id: orgId } }).catch(() => null);
    return this.resolver.resolveScoped(m.role as never, overrides, org?.type);
  }
}

function faceAuditSnapshot(face: unknown): Record<string, unknown> {
  const f = face as Record<string, unknown>;
  return {
    siteId: f.siteId,
    faceLabel: f.faceLabel,
    width: f.width,
    height: f.height,
    area: f.area,
    units: f.units,
    printableArea: f.printableArea ?? null,
    bookable: f.bookable,
    pixelWidth: f.pixelWidth ?? null,
    pixelHeight: f.pixelHeight ?? null,
    spotLengthSeconds: f.spotLengthSeconds ?? null,
    loopLengthSeconds: f.loopLengthSeconds ?? null,
    spotsPerLoop: f.spotsPerLoop ?? null,
    proofOfPlay: f.proofOfPlay ?? null,
  };
}

function metadataAuditSnapshot(m: unknown): Record<string, unknown> {
  const r = m as Record<string, unknown>;
  return {
    siteId: r.siteId,
    dimension: r.dimension,
    payload: r.payload,
    source: r.source ?? null,
    method: r.method ?? null,
    confidence: r.confidence ?? null,
    collectedAt: r.collectedAt ?? null,
    expiresAt: r.expiresAt ?? null,
    verification: r.verification ?? 'unverified',
    dataClass: r.dataClass ?? 'production',
  };
}

function rateCardAuditSnapshot(card: unknown): Record<string, unknown> {
  const c = card as Record<string, unknown>;
  return {
    organizationId: c.organizationId,
    siteId: c.siteId ?? null,
    currency: c.currency,
    rates: c.rates,
    seasonalRules: c.seasonalRules ?? null,
    effectiveFrom: c.effectiveFrom,
    effectiveTo: c.effectiveTo ?? null,
  };
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  Optional,
} from '@nestjs/common';
import { LocationVerificationService } from './location/location-verification.service';
import {
  locationFingerprint,
  locationMessage,
  locationRecheckMessage,
  type LocationInput,
  type LocationVerification,
} from './location/location-verification';
import { projectMediaAssetEvidence } from './inventory-media-projection';
import type { EntityManager } from 'typeorm';
import { findMarket } from '../common/supported-markets';
import { DatabaseService } from '../common/database.service';
import { StorageService } from '../common/storage.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { Capability } from '../capabilities/capability.enum';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { demoVisibilitySql, demoDisclosure } from '../common/demo-inventory';
import { researchDisclosure } from '../common/research-inventory';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { SiteMetadataEntity } from '../common/entities/site-metadata.entity';
import { METADATA_COLUMNS, PRODUCTION_METADATA_WHERE } from '../common/metadata-filter';
import { RateCardEntity } from '../common/entities/rate-card.entity';
import { FaceBlackoutEntity } from '../common/entities/face-blackout.entity';
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
  CreateBlackoutDto,
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
  'id, organization_id AS "organizationId", (demo_agency_id IS NOT NULL) AS "isDemo", (research_agency_id IS NOT NULL) AS "isResearchReference", research_provenance AS "researchProvenance", code, name, type, format, sub_format AS "subFormat", ' +
  'latitude, longitude, geo_polygon AS "geoPolygon", ' +
  'address, city, region, country, market_id AS "marketId", orientation_deg AS "orientationDeg", ' +
  'viewing_distance AS "viewingDistance", elevation, width, height, area, units, ' +
  'illumination_type AS "illuminationType", illumination_hours AS "illuminationHours", ' +
  'location_verification AS "locationVerification", description, status, rejection_reason AS "rejectionReason", permit_ref AS "permitRef", permit_expires_at AS "permitExpiresAt", ' +
  'created_at AS "createdAt", updated_at AS "updatedAt"';

// Same columns as SITE_DETAIL_COLUMNS but table-qualified with `s.` for the list
// query, which lateral-joins the newest front photo for list thumbnails.
const LIST_SITE_COLUMNS =
  's.id, s.organization_id AS "organizationId", (s.demo_agency_id IS NOT NULL) AS "isDemo", (s.research_agency_id IS NOT NULL) AS "isResearchReference", s.research_provenance AS "researchProvenance", s.code, s.name, s.type, s.format, s.sub_format AS "subFormat", ' +
  's.latitude, s.longitude, s.geo_polygon AS "geoPolygon", ' +
  's.address, s.city, s.region, s.country, s.market_id AS "marketId", s.orientation_deg AS "orientationDeg", ' +
  's.viewing_distance AS "viewingDistance", s.elevation, s.width, s.height, s.area, s.units, ' +
  's.illumination_type AS "illuminationType", s.illumination_hours AS "illuminationHours", ' +
  's.location_verification AS "locationVerification", s.description, s.status, s.rejection_reason AS "rejectionReason", s.permit_ref AS "permitRef", s.permit_expires_at AS "permitExpiresAt", ' +
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
  if (mimetype === 'image/jpeg')
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimetype === 'image/png') {
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimetype === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
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

function assertRateDetails(
  currency: string,
  rates: { perDay?: number; perWeek?: number; perMonth?: number },
  effectiveFrom: Date,
  effectiveTo?: Date | null,
  minBookingDays?: number | null,
): void {
  const prices =
    rates && [rates.perDay, rates.perWeek, rates.perMonth].filter((price) => price !== undefined);
  if (!prices?.length || prices.some((price) => !Number.isFinite(price) || price! <= 0)) {
    throw new BadRequestException('Add at least one positive daily, weekly, or monthly rate.');
  }
  if (!/^[A-Z]{3}$/.test(currency))
    throw new BadRequestException('Use a three-letter currency code.');
  if (
    !Number.isFinite(effectiveFrom.getTime()) ||
    (effectiveTo && (!Number.isFinite(effectiveTo.getTime()) || effectiveTo < effectiveFrom))
  ) {
    throw new BadRequestException('Rate end date must be on or after its start date.');
  }
  if (minBookingDays != null && (!Number.isInteger(minBookingDays) || minBookingDays < 1)) {
    throw new BadRequestException('Minimum booking length must be at least one day.');
  }
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
    @Optional()
    private readonly locationVerifier: LocationVerificationService = new LocationVerificationService(),
  ) {}

  // ----------------------------------------------------------------- sites
  async createSite(orgId: string, dto: CreateSiteDto, actor: Actor = {}) {
    dto = { ...dto, country: findMarket(dto.country)?.name ?? dto.country };
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
    params.push(orgId ?? null);
    where.push(demoVisibilitySql('s', `$${params.length}`));
    if (q.format) push('format = ?', q.format);
    if (q.city) push('city ILIKE ?', `%${q.city}%`);
    if (q.country) push('country = ?', findMarket(q.country)?.name ?? q.country);
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
    const totalRows = await repo.query(
      `SELECT count(*)::int AS c FROM billboard_sites s ${whereSql}`,
      params,
    );
    const total = totalRows[0]?.c ?? 0;
    if (!caps.has(Capability.PLATFORM_ADMIN) && !(caps.has(Capability.INVENTORY_VIEW) && orgId)) {
      // Private automated-review evidence is for the owner and moderation team.
      for (const row of rows) delete row.locationVerification;
    }
    return {
      items: rows.map((row: Record<string, unknown>) => ({
        ...row,
        ...demoDisclosure(row.isDemo === true),
        ...researchDisclosure(row.isResearchReference === true, row.researchProvenance),
      })),
      total,
      page,
      limit,
    };
  }

  async getSite(user: AuthenticatedUser, orgId: string | undefined, siteId: string) {
    const repo = await this.db.repo(BillboardSiteEntity);
    const rows = await repo.query(
      `SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE id = $1`,
      [siteId],
    );
    const site = rows[0];
    if (!site) throw new NotFoundException('Site not found');
    const reader = await this.assertCanReadSite(user, orgId, siteId, site.status);
    const [faces, assets, rateCards] = await Promise.all([
      this.listFaces(siteId),
      this.listAssets(siteId, site),
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
      delete rest.locationVerification;
      return {
        ...rest,
        ...demoDisclosure(site.isDemo === true),
        ...researchDisclosure(site.isResearchReference === true, site.researchProvenance),
        faces,
        assets,
        metadata,
        rateCards,
      };
    }
    return {
      ...site,
      ...demoDisclosure(site.isDemo === true),
      ...researchDisclosure(site.isResearchReference === true, site.researchProvenance),
      faces,
      assets,
      metadata,
      rateCards,
    };
  }

  async updateSite(user: AuthenticatedUser, orgId: string, siteId: string, dto: UpdateSiteDto) {
    if (dto.country != null)
      dto = { ...dto, country: findMarket(dto.country)?.name ?? dto.country };
    await this.assertOwnership(orgId, siteId);
    await this.db.transaction(async (manager) => {
      const currentRows = await manager.query(
        `SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE id = $1 FOR UPDATE`,
        [siteId],
      );
      const current = currentRows[0];
      if (!current) throw new NotFoundException('Site not found');

      const sets: string[] = [];
      const params: unknown[] = [];
      // Nullable strings may be cleared with an explicit null; numeric core
      // fields must not (a null wipe would corrupt live inventory data).
      const NUMERIC_KEYS = new Set<keyof UpdateSiteDto>([
        'latitude',
        'longitude',
        'width',
        'height',
        'area',
        'orientationDeg',
        'viewingDistance',
        'elevation',
      ]);
      const map: Array<[string, keyof UpdateSiteDto]> = [
        ['name', 'name'],
        ['code', 'code'],
        ['type', 'type'],
        ['format', 'format'],
        ['sub_format', 'subFormat'],
        ['address', 'address'],
        ['city', 'city'],
        ['region', 'region'],
        ['country', 'country'],
        ['market_id', 'marketId'],
        ['orientation_deg', 'orientationDeg'],
        ['viewing_distance', 'viewingDistance'],
        ['elevation', 'elevation'],
        ['width', 'width'],
        ['height', 'height'],
        ['area', 'area'],
        ['units', 'units'],
        ['illumination_type', 'illuminationType'],
        ['illumination_hours', 'illuminationHours'],
        ['description', 'description'],
        ['permit_ref', 'permitRef'],
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

        const effectiveLocation = {
          address: dto.address === undefined ? current.address : dto.address,
          city: dto.city === undefined ? current.city : dto.city,
          region: dto.region === undefined ? current.region : dto.region,
          country: dto.country ?? current.country,
          latitude: dto.latitude ?? current.latitude,
          longitude: dto.longitude ?? current.longitude,
        };
        if (locationFingerprint(effectiveLocation) !== locationFingerprint(current)) {
          sets.push('location_verification = NULL', 'rejection_reason = NULL');
          // A corrected pin/address must be reviewed again before public discovery.
          // Decommissioned inventory cannot be revived by editing its location.
          if (current.status !== 'decommissioned') sets.push("status = 'draft'");
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
      await manager.query(`UPDATE billboard_sites SET status = 'decommissioned' WHERE id = $1`, [
        siteId,
      ]);
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

  /** A check uses saved tenant-owned facts; the client cannot nominate a provider result. */
  async verifySiteLocation(user: AuthenticatedUser, orgId: string, siteId: string, locale = 'en') {
    await this.assertOwnership(orgId, siteId);
    const current = await this.locationSnapshot(siteId);
    const cached = current.locationVerification;
    const age = cached ? Date.now() - new Date(cached.checkedAt).getTime() : Infinity;
    if (
      cached &&
      cached.status !== 'unable_to_verify' &&
      age >= 0 &&
      age < 24 * 60 * 60 * 1000 &&
      cached.inputFingerprint === locationFingerprint(current)
    ) {
      const decision = this.localizedLocationDecision(cached, locale);
      // An unchanged retry should not create another provider call or audit.
      // Legacy pending mismatch evidence still needs its rejection transition.
      if (!(current.status === 'pending_review' && decision.status === 'mismatch')) return decision;
      return this.persistLocationDecision(user, orgId, siteId, current, decision, false, locale);
    }
    const decision = await this.locationVerifier.verify(current, locale);
    return this.persistLocationDecision(user, orgId, siteId, current, decision, false, locale);
  }

  async submitSite(user: AuthenticatedUser, orgId: string, siteId: string, locale = 'en') {
    await this.assertOwnership(orgId, siteId);
    const current = await this.locationSnapshot(siteId);
    // An ambiguous retry replays the persisted submission without a second provider request/audit.
    if (
      (current.status === 'pending_review' ||
        (current.status === 'rejected' && current.locationVerification?.status === 'mismatch')) &&
      current.locationVerification?.inputFingerprint === locationFingerprint(current)
    ) {
      return {
        id: siteId,
        status: current.status,
        rejectionReason: current.rejectionReason ?? null,
        locationVerification: this.localizedLocationDecision(current.locationVerification, locale),
      };
    }
    if (!['draft', 'rejected'].includes(current.status)) {
      throw new ForbiddenException(`Site is ${current.status}, expected draft/rejected`);
    }
    const problems = await this.listingProblems(siteId);
    if (problems.length > 0) {
      throw new BadRequestException(`Site is not ready for review: ${problems.join('; ')}.`);
    }
    const cached = current.locationVerification;
    const age = cached ? Date.now() - new Date(cached.checkedAt).getTime() : Infinity;
    // Cache our persisted decision only when unchanged and recent. Unknown outcomes may retry.
    const decision =
      cached &&
      cached.status !== 'unable_to_verify' &&
      age >= 0 &&
      age < 24 * 60 * 60 * 1000 &&
      cached.inputFingerprint === locationFingerprint(current)
        ? this.localizedLocationDecision(cached, locale)
        : await this.locationVerifier.verify(current, locale);
    return this.persistLocationDecision(user, orgId, siteId, current, decision, true, locale);
  }

  private localizedLocationDecision(
    decision: LocationVerification,
    locale: string,
  ): LocationVerification {
    return {
      ...decision,
      message: locationMessage(decision.status, locale),
      ...(decision.lastAttempt && {
        lastAttempt: { ...decision.lastAttempt, message: locationRecheckMessage(locale) },
      }),
    };
  }

  private async locationSnapshot(siteId: string): Promise<
    LocationInput & {
      status: string;
      locationVerification?: LocationVerification | null;
      rejectionReason?: string | null;
    }
  > {
    const repo = await this.db.repo(BillboardSiteEntity);
    const rows = await repo.query(
      `SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE id = $1`,
      [siteId],
    );
    if (!rows[0]) throw new NotFoundException('Site not found');
    return rows[0];
  }

  private async persistLocationDecision(
    user: AuthenticatedUser,
    orgId: string,
    siteId: string,
    snapshot: LocationInput & { status: string },
    decision: LocationVerification,
    submit: boolean,
    locale: string,
  ) {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE id = $1 FOR UPDATE`,
        [siteId],
      );
      const current = rows[0];
      if (!current) throw new NotFoundException('Site not found');
      if (current.organizationId !== orgId) throw new ForbiddenException('Not your site');
      if (locationFingerprint(current) !== locationFingerprint(snapshot)) {
        throw new ConflictException(
          'Location changed during verification. Check the saved address and pin, then retry.',
        );
      }
      if (
        submit &&
        (current.status === 'pending_review' ||
          (current.status === 'rejected' && snapshot.status !== 'rejected')) &&
        current.locationVerification
      ) {
        return {
          id: siteId,
          status: current.status,
          rejectionReason: current.rejectionReason ?? null,
          locationVerification: current.locationVerification,
        };
      }
      if (submit && !['draft', 'rejected'].includes(current.status)) {
        throw new ConflictException(
          'Site status changed during verification. Refresh the site before retrying.',
        );
      }
      if (!submit && current.status !== snapshot.status) {
        throw new ConflictException(
          'Site status changed during verification. Refresh the site before retrying.',
        );
      }
      if (submit) {
        // The provider call deliberately holds no locks. Re-read readiness under
        // this parent lock, shared with readiness-affecting child mutations.
        const problems = await this.listingProblems(siteId, manager);
        if (problems.length > 0) {
          throw new BadRequestException(`Site is not ready for review: ${problems.join('; ')}.`);
        }
      }
      const previous = current.locationVerification as LocationVerification | null;
      // The 24 h cache controls provider reuse, not the validity of confirmed
      // mismatch evidence. Resolve it only with changed inputs or a definitive
      // new result; outages and ambiguity cannot reopen approval or listing.
      if (
        decision.status === 'unable_to_verify' &&
        previous?.status === 'mismatch' &&
        previous.inputFingerprint === locationFingerprint(current)
      ) {
        decision = {
          ...this.localizedLocationDecision(previous, locale),
          lastAttempt: {
            status: 'unable_to_verify',
            reasonCode: decision.reasonCode,
            checkedAt: decision.checkedAt,
            provider: decision.provider,
            message: locationRecheckMessage(locale),
          },
        };
      }
      const automaticallyRejected =
        decision.status === 'mismatch' && (submit || current.status === 'pending_review');
      const status = automaticallyRejected
        ? 'rejected'
        : submit
          ? 'pending_review'
          : current.status;
      const reason = automaticallyRejected
        ? decision.message
        : submit
          ? null
          : (current.rejectionReason ?? null);
      // Prevent a check on already-published inventory from leaving a known mismatch public.
      const persistedStatus =
        !submit && decision.status === 'mismatch' && ['listed', 'approved'].includes(status)
          ? 'suspended'
          : status;
      await manager.query(
        'UPDATE billboard_sites SET location_verification = $1::jsonb, status = $2, rejection_reason = $3 WHERE id = $4',
        [JSON.stringify(decision), persistedStatus, reason, siteId],
      );
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: automaticallyRejected
          ? 'inventory.site.rejected'
          : submit
            ? 'inventory.site.submitted'
            : 'inventory.site.updated',
        entityType: INVENTORY_AUDIT_ENTITY.site,
        entityId: siteId,
        before: {
          status: current.status,
          locationVerification: current.locationVerification ?? null,
        },
        after: {
          status: persistedStatus,
          rejectionReason: reason,
          locationVerification: decision,
          reviewMethod: 'address_pin_automatic_check',
        },
      });
      return submit
        ? {
            id: siteId,
            status: persistedStatus,
            rejectionReason: reason,
            locationVerification: decision,
          }
        : decision;
    });
  }

  async approveSite(user: AuthenticatedUser, orgId: string | undefined, siteId: string) {
    // SPEC §5.1 lifecycle: pending_review → approved → listed (two steps); clear any rejection reason.
    await this.db.transaction(async (manager) => {
      const rows = await manager.query(
        `SELECT status, research_agency_id AS "researchAgencyId", location_verification AS "locationVerification" FROM billboard_sites WHERE id = $1 FOR UPDATE`,
        [siteId],
      );
      if (!rows[0]) throw new NotFoundException('Site not found');
      if (rows[0].researchAgencyId)
        throw new ForbiddenException('Research references are read-only');
      if (rows[0].locationVerification?.status === 'mismatch') {
        throw new BadRequestException(
          'Correct the address/pin mismatch and resubmit before listing this site.',
        );
      }
      if (rows[0].status !== 'pending_review') {
        throw new ForbiddenException(`Site is ${rows[0].status}, expected pending_review`);
      }
      const problems = await this.listingProblems(siteId, manager);
      if (problems.length > 0) {
        throw new BadRequestException(`Site cannot be listed yet: ${problems.join('; ')}.`);
      }
      // One endpoint mutation = one audit row: the two-step transition lands in
      // a single audit record (before pending_review, after listed).
      await manager.query(
        `UPDATE billboard_sites SET status = 'approved', rejection_reason = NULL WHERE id = $1`,
        [siteId],
      );
      await manager.query(`UPDATE billboard_sites SET status = 'listed' WHERE id = $1`, [siteId]);
      await writeInventoryAudit(
        manager,
        { userId: user.userId, orgId },
        {
          action: 'inventory.site.approved',
          entityType: INVENTORY_AUDIT_ENTITY.site,
          entityId: siteId,
          before: { status: 'pending_review' },
          after: { status: 'listed' },
        },
      );
    });
    return { id: siteId, status: 'listed' };
  }

  async rejectSite(
    user: AuthenticatedUser,
    orgId: string | undefined,
    siteId: string,
    reason: string,
  ) {
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
      await this.lockOwnedSite(manager, orgId, siteId);
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
          bleedMm: dto.bleedMm,
          substrate: dto.substrate,
          fileRequirements: dto.fileRequirements,
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
      let face = await repo.findOne({ where: { id: faceId } });
      if (!face) throw new NotFoundException('Face not found');
      await this.lockOwnedSite(manager, orgId, face.siteId);
      face = await repo.findOne({ where: { id: faceId } });
      if (!face) throw new NotFoundException('Face not found');
      const before = faceAuditSnapshot(face);
      Object.assign(face, {
        ...(dto.faceLabel !== undefined && { faceLabel: dto.faceLabel }),
        ...(dto.width !== undefined && { width: dto.width }),
        ...(dto.height !== undefined && { height: dto.height }),
        ...(dto.area !== undefined && { area: dto.area }),
        ...(dto.units !== undefined && { units: dto.units }),
        ...(dto.printableArea !== undefined && { printableArea: dto.printableArea }),
        ...(dto.bleedMm !== undefined && { bleedMm: dto.bleedMm }),
        ...(dto.substrate !== undefined && { substrate: dto.substrate }),
        ...(dto.fileRequirements !== undefined && { fileRequirements: dto.fileRequirements }),
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
      let face = await repo.findOne({ where: { id: faceId } });
      if (!face) throw new NotFoundException('Face not found');
      await this.lockOwnedSite(manager, orgId, face.siteId);
      face = await repo.findOne({ where: { id: faceId } });
      if (!face) throw new NotFoundException('Face not found');
      const locked = await manager.query('SELECT id FROM site_faces WHERE id = $1 FOR UPDATE', [
        faceId,
      ]);
      if (!locked[0]) throw new NotFoundException('Face not found');
      const blackout = await manager
        .getRepository(FaceBlackoutEntity)
        .findOne({ where: { faceId } });
      if (blackout) {
        throw new ConflictException(
          'Remove this face’s unavailable periods before removing the face.',
        );
      }
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
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
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

  async listAssets(siteId: string, currentSitePin?: { latitude: unknown; longitude: unknown }) {
    const repo = await this.db.repo(SiteAssetEntity);
    const assets = await repo.find({ where: { siteId } });
    const pin =
      currentSitePin ??
      (
        await (
          await this.db.repo(BillboardSiteEntity)
        ).query('SELECT latitude, longitude FROM billboard_sites WHERE id = $1', [siteId])
      )[0];
    return assets.map((asset) =>
      projectMediaAssetEvidence(asset, pin ?? { latitude: null, longitude: null }),
    );
  }

  /** Read a stored asset for streaming to an authenticated owner/admin (SPEC §6.2).
   * Seeded placeholder assets store an external URL, returned for redirection. */
  async readAsset(
    user: AuthenticatedUser,
    orgId: string | undefined,
    siteId: string,
    assetId: string,
  ) {
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
      if (
        (asset as { kind: string; capturedAt?: Date | null }).kind === 'front' &&
        asset.capturedAt
      ) {
        const siteRows = await manager.query(
          `SELECT status FROM billboard_sites WHERE id = $1 FOR UPDATE`,
          [siteId],
        );
        const status = siteRows[0]?.status;
        if (status === 'pending_review' || status === 'approved' || status === 'listed') {
          const fronts = await manager.query(
            `SELECT count(*)::int AS c FROM site_assets WHERE site_id = $1 AND kind = 'front' AND captured_at IS NOT NULL`,
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
  async addMetadata(
    user: AuthenticatedUser,
    orgId: string,
    siteId: string,
    dto: CreateMetadataDto,
  ) {
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

  async updateMetadata(
    user: AuthenticatedUser,
    orgId: string,
    metadataId: string,
    dto: UpdateMetadataDto,
  ) {
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
        ...(dto.collectedAt !== undefined && {
          collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : null,
        }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
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
  async createRateCard(
    user: AuthenticatedUser,
    orgId: string,
    siteId: string,
    dto: CreateRateCardDto,
  ) {
    await this.assertMediaPartnerOrg(orgId);
    await this.assertOwnership(orgId, siteId);
    assertRateDetails(
      dto.currency,
      dto.rates,
      new Date(dto.effectiveFrom),
      dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      dto.minBookingDays,
    );
    return this.db.transaction(async (manager) => {
      await this.lockOwnedSite(manager, orgId, siteId);
      if (dto.faceId) {
        const faces = await manager.query(
          `SELECT 1 FROM site_faces WHERE id = $1 AND site_id = $2`,
          [dto.faceId, siteId],
        );
        if (!faces[0])
          throw new BadRequestException('The selected face does not belong to this site.');
      }
      const repo = manager.getRepository(RateCardEntity);
      const card = await repo.save(
        repo.create({
          organizationId: orgId,
          siteId,
          faceId: dto.faceId,
          minBookingDays: dto.minBookingDays,
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

  async updateRateCard(
    user: AuthenticatedUser,
    orgId: string,
    rateCardId: string,
    dto: UpdateRateCardDto,
  ) {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(RateCardEntity);
      let rc = await repo.findOne({ where: { id: rateCardId } });
      if (!rc) throw new NotFoundException('Rate card not found');
      if ((rc as { organizationId: string }).organizationId !== orgId) {
        throw new ForbiddenException('Not your rate card');
      }
      if (rc.siteId) await this.lockOwnedSite(manager, orgId, rc.siteId);
      rc = await repo.findOne({ where: { id: rateCardId } });
      if (!rc) throw new NotFoundException('Rate card not found');
      if (dto.faceId) {
        const faces = await manager.query(
          `SELECT 1 FROM site_faces WHERE id = $1 AND site_id = $2`,
          [dto.faceId, rc.siteId],
        );
        if (!faces[0])
          throw new BadRequestException('The selected face does not belong to this site.');
      }
      const before = rateCardAuditSnapshot(rc);
      Object.assign(rc, {
        ...(dto.faceId !== undefined && { faceId: dto.faceId }),
        ...(dto.minBookingDays !== undefined && { minBookingDays: dto.minBookingDays }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.rates !== undefined && { rates: dto.rates }),
        ...(dto.seasonalRules !== undefined && { seasonalRules: dto.seasonalRules }),
        ...(dto.effectiveFrom !== undefined && { effectiveFrom: new Date(dto.effectiveFrom) }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
      });
      assertRateDetails(
        rc.currency,
        rc.rates,
        new Date(rc.effectiveFrom),
        rc.effectiveTo ? new Date(rc.effectiveTo) : null,
        rc.minBookingDays,
      );
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

  async withdrawFutureRateCard(user: AuthenticatedUser, orgId: string, rateCardId: string) {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(RateCardEntity);
      let card = await repo.findOne({ where: { id: rateCardId } });
      if (!card) throw new NotFoundException('Rate card not found');
      if (card.organizationId !== orgId) throw new ForbiddenException('Not your rate card');
      if (card.siteId) await this.lockOwnedSite(manager, orgId, card.siteId);
      card = await repo.findOne({ where: { id: rateCardId } });
      if (!card) throw new NotFoundException('Rate card not found');
      if (
        new Date(card.effectiveFrom).toISOString().slice(0, 10) <=
        new Date().toISOString().slice(0, 10)
      ) {
        throw new ConflictException(
          'Only future rate cards can be withdrawn. End a current rate instead.',
        );
      }
      await repo.delete({ id: rateCardId });
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.rate_card.withdrawn',
        entityType: INVENTORY_AUDIT_ENTITY.rateCard,
        entityId: rateCardId,
        before: rateCardAuditSnapshot(card),
        after: null,
      });
      return { id: rateCardId, withdrawn: true };
    });
  }

  // ------------------------------------------------------ partner availability
  async listBlackouts(orgId: string, faceId: string) {
    const faces = await this.db.repo(SiteFaceEntity);
    const face = await faces.findOne({ where: { id: faceId } });
    if (!face) throw new NotFoundException('Face not found');
    await this.assertOwnership(orgId, face.siteId);
    const repo = await this.db.repo(FaceBlackoutEntity);
    return repo.find({ where: { faceId }, order: { startDate: 'ASC' } });
  }

  async addBlackout(
    user: AuthenticatedUser,
    orgId: string,
    faceId: string,
    dto: CreateBlackoutDto,
  ) {
    await this.assertMediaPartnerOrg(orgId);
    const start = Date.parse(dto.startDate + 'T00:00:00Z');
    const end = Date.parse(dto.endDate + 'T00:00:00Z');
    const days = (end - start) / 86_400_000;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      !Number.isInteger(days) ||
      days < 1 ||
      days > 366 ||
      new Date(start).toISOString().slice(0, 10) !== dto.startDate ||
      new Date(end).toISOString().slice(0, 10) !== dto.endDate
    ) {
      throw new BadRequestException(
        'Choose a valid period of 1 to 366 days. The end date is the first available day.',
      );
    }
    if (!dto.reason.trim())
      throw new BadRequestException('Give a reason for the unavailable period.');
    return this.db.transaction(async (manager) => {
      // Lock the face so future booking confirmation uses the same concurrency boundary.
      const faces = (await manager.query(
        `SELECT f.site_id AS "siteId", s.organization_id AS "organizationId"
         FROM site_faces f JOIN billboard_sites s ON s.id::text = f.site_id
         WHERE f.id = $1 FOR UPDATE OF f`,
        [faceId],
      )) as Array<{ siteId: string; organizationId: string }>;
      if (!faces[0]) throw new NotFoundException('Face not found');
      if (faces[0].organizationId !== orgId) throw new ForbiddenException('Not your face');
      const conflicts = (await manager.query(
        `SELECT
          EXISTS(SELECT 1 FROM face_blackouts WHERE face_id = $1 AND start_date < $3::date AND end_date > $2::date) AS blackout,
          EXISTS(SELECT 1 FROM bookings WHERE face_id = $1 AND status IN ('held', 'confirmed', 'live')
            AND start_date < $3::date AND end_date > $2::date) AS booking`,
        [faceId, dto.startDate, dto.endDate],
      )) as Array<{ blackout: boolean; booking: boolean }>;
      if (conflicts[0]?.blackout)
        throw new ConflictException('An unavailable period already overlaps these dates.');
      if (conflicts[0]?.booking)
        throw new ConflictException('A reservation already overlaps these dates.');
      const repo = manager.getRepository(FaceBlackoutEntity);
      const blackout = await repo.save(
        repo.create({
          faceId,
          organizationId: orgId,
          startDate: dto.startDate,
          endDate: dto.endDate,
          reason: dto.reason.trim(),
        }),
      );
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.blackout.created',
        entityType: 'face_blackout',
        entityId: blackout.id,
        before: null,
        after: { faceId, startDate: dto.startDate, endDate: dto.endDate, reason: blackout.reason },
      });
      return blackout;
    });
  }

  async removeBlackout(user: AuthenticatedUser, orgId: string, blackoutId: string) {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(FaceBlackoutEntity);
      const blackout = await repo.findOne({ where: { id: blackoutId } });
      if (!blackout) throw new NotFoundException('Unavailable period not found');
      if (blackout.organizationId !== orgId)
        throw new ForbiddenException('Not your unavailable period');
      const faces = await manager.query(`SELECT id FROM site_faces WHERE id = $1 FOR UPDATE`, [
        blackout.faceId,
      ]);
      if (!faces[0]) throw new NotFoundException('Face not found');
      await repo.delete({ id: blackoutId });
      await writeInventoryAudit(manager, actorOf(user, orgId), {
        action: 'inventory.blackout.removed',
        entityType: 'face_blackout',
        entityId: blackoutId,
        before: {
          faceId: blackout.faceId,
          startDate: blackout.startDate,
          endDate: blackout.endDate,
          reason: blackout.reason,
        },
        after: null,
      });
      return { id: blackoutId, removed: true };
    });
  }

  // ------------------------------------------------------- provenance helper
  /** Store the "how do you know this?" record for a hand-entered structure
   * attribute (SPEC §5.1 trust contract 3) inside the mutation's transaction. */
  private async writeStructureProvenance(
    manager: import('typeorm').EntityManager,
    siteId: string,
    provenance: StructureProvenance,
    values: {
      orientationDeg?: number | null;
      viewingDistance?: number | null;
      elevation?: number | null;
    },
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
        ...(structureProvenance.collectedAt
          ? { collectedAt: structureProvenance.collectedAt }
          : {}),
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
    let demoAgencyId: string | null | undefined;
    let researchAgencyId: string | null | undefined;
    if (status === undefined || orgId === undefined) {
      const rows = await repo.query(
        `SELECT organization_id AS "organizationId", demo_agency_id AS "demoAgencyId", research_agency_id AS "researchAgencyId", status FROM billboard_sites WHERE id = $1`,
        [siteId],
      );
      if (!rows[0]) throw new NotFoundException('Site not found');
      organizationId = rows[0].organizationId;
      demoAgencyId = rows[0].demoAgencyId;
      researchAgencyId = rows[0].researchAgencyId;
      status = rows[0].status;
    } else {
      const rows = await repo.query(
        `SELECT organization_id AS "organizationId", demo_agency_id AS "demoAgencyId", research_agency_id AS "researchAgencyId" FROM billboard_sites WHERE id = $1`,
        [siteId],
      );
      if (!rows[0]) throw new NotFoundException('Site not found');
      organizationId = rows[0].organizationId;
      demoAgencyId = rows[0].demoAgencyId;
      researchAgencyId = rows[0].researchAgencyId;
    }
    if (demoAgencyId && orgId !== demoAgencyId && orgId !== organizationId)
      throw new NotFoundException('Site not found');
    if (researchAgencyId && orgId !== researchAgencyId && orgId !== organizationId)
      throw new NotFoundException('Site not found');
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
      throw new ForbiddenException(
        'Only media-partner organizations can manage billboard inventory',
      );
    }
  }

  // ----------------------------------------------------------------- helpers
  /** SPEC §7.1 listing-completeness problems, checked at submit and approval. */
  private async listingProblems(siteId: string, manager?: EntityManager): Promise<string[]> {
    const repo = manager
      ? manager.getRepository(BillboardSiteEntity)
      : await this.db.repo(BillboardSiteEntity);
    const rows = await repo.query(
      `SELECT latitude, longitude, format, width, height, permit_expires_at::date::text AS "permitExpiresAt"
       FROM billboard_sites WHERE id = $1`,
      [siteId],
    );
    if (!rows[0]) throw new NotFoundException('Site not found');
    const s = rows[0];
    const problems: string[] = [];
    const lat = Number(s.latitude);
    const lon = Number(s.longitude);
    if (!Number.isFinite(lat) || Math.abs(lat) > 90)
      problems.push('latitude must be between -90 and 90');
    if (!Number.isFinite(lon) || Math.abs(lon) > 180)
      problems.push('longitude must be between -180 and 180');
    if (!s.format) problems.push('format is required');
    if (!(Number(s.width) > 0)) problems.push('width must be greater than 0');
    if (!(Number(s.height) > 0)) problems.push('height must be greater than 0');
    const front = await repo.query(
      `SELECT 1 FROM site_assets WHERE site_id = $1 AND kind = 'front' AND captured_at IS NOT NULL LIMIT 1`,
      [siteId],
    );
    if (!front[0])
      problems.push('a front-on reference photo with a known capture date is required');
    if (s.permitExpiresAt && s.permitExpiresAt < new Date().toISOString().slice(0, 10)) {
      problems.push('the recorded permit has expired');
    }
    const allFaces = manager
      ? await manager.getRepository(SiteFaceEntity).find({ where: { siteId } })
      : await this.listFaces(siteId);
    const faces = allFaces.filter((face) => face.bookable);
    if (faces.length === 0) problems.push('add at least one bookable face');
    if (
      s.format === 'digital_led' &&
      faces.some(
        (face) =>
          !face.pixelWidth ||
          !face.pixelHeight ||
          !face.spotLengthSeconds ||
          !face.loopLengthSeconds ||
          !face.spotsPerLoop,
      )
    )
      problems.push('complete the pixel and loop/spot details for each bookable digital face');
    if (faces.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const rates = manager
        ? await manager.getRepository(RateCardEntity).find({ where: { siteId } })
        : await this.listRateCards(siteId);
      const priced = (faceId: string) =>
        rates.some(
          (rate) =>
            (!rate.faceId || rate.faceId === faceId) &&
            new Date(rate.effectiveFrom).toISOString().slice(0, 10) <= today &&
            (!rate.effectiveTo || new Date(rate.effectiveTo).toISOString().slice(0, 10) >= today) &&
            Object.values(rate.rates).some(
              (price) => typeof price === 'number' && Number.isFinite(price) && price > 0,
            ),
        );
      if (faces.some((face) => !priced(face.id)))
        problems.push('add a current rate for each bookable face');
    }
    return problems;
  }

  private async lockOwnedSite(
    manager: EntityManager,
    orgId: string,
    siteId: string,
  ): Promise<void> {
    const rows = await manager.query(
      'SELECT organization_id AS "organizationId", research_agency_id AS "researchAgencyId" FROM billboard_sites WHERE id = $1 FOR UPDATE',
      [siteId],
    );
    if (!rows[0]) throw new NotFoundException('Site not found');
    if (rows[0].researchAgencyId) throw new ForbiddenException('Research references are read-only');
    if (rows[0].organizationId !== orgId) throw new ForbiddenException('Not your site');
  }

  private async assertOwnership(orgId: string | undefined, siteId: string) {
    const repo = await this.db.repo(BillboardSiteEntity);
    const rows = await repo.query(
      `SELECT organization_id AS "organizationId", research_agency_id AS "researchAgencyId" FROM billboard_sites WHERE id = $1`,
      [siteId],
    );
    if (!rows[0]) throw new NotFoundException('Site not found');
    if (rows[0].researchAgencyId) throw new ForbiddenException('Research references are read-only');
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
      const rows = await manager.query(
        `SELECT status, research_agency_id AS "researchAgencyId", location_verification AS "locationVerification" FROM billboard_sites WHERE id = $1 FOR UPDATE`,
        [siteId],
      );
      if (!rows[0]) throw new NotFoundException('Site not found');
      if (rows[0].researchAgencyId)
        throw new ForbiddenException('Research references are read-only');
      if (to === 'listed' && rows[0].locationVerification?.status === 'mismatch') {
        throw new BadRequestException(
          'Correct the address/pin mismatch and resubmit before relisting this site.',
        );
      }
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
      await writeInventoryAudit(
        manager,
        { userId: user.userId, orgId },
        {
          action: opts.action,
          entityType: INVENTORY_AUDIT_ENTITY.site,
          entityId: siteId,
          before: { status: beforeStatus },
          after: {
            status: to,
            ...(opts.reason !== undefined ? { rejectionReason: opts.reason } : {}),
          },
        },
      );
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
    bleedMm: f.bleedMm ?? null,
    substrate: f.substrate ?? null,
    fileRequirements: f.fileRequirements ?? null,
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
    faceId: c.faceId ?? null,
    minBookingDays: c.minBookingDays ?? null,
    currency: c.currency,
    rates: c.rates,
    seasonalRules: c.seasonalRules ?? null,
    effectiveFrom: c.effectiveFrom,
    effectiveTo: c.effectiveTo ?? null,
  };
}

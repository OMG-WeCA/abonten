import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { Capability } from '../capabilities/capability.enum';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { SiteMetadataEntity } from '../common/entities/site-metadata.entity';
import { RateCardEntity } from '../common/entities/rate-card.entity';
import type { AuthenticatedUser } from '../auth/authenticated-user';
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
  'ST_X(location) AS longitude, ST_Y(location) AS latitude, ' +
  'address, city, region, country, market_id AS "marketId", orientation_deg AS "orientationDeg", ' +
  'viewing_distance AS "viewingDistance", elevation, width, height, area, units, ' +
  'illumination_type AS "illuminationType", illumination_hours AS "illuminationHours", ' +
  'description, status, permit_ref AS "permitRef", permit_expires_at AS "permitExpiresAt", ' +
  'created_at AS "createdAt", updated_at AS "updatedAt"';

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
  sql?: 'location' | 'geo_polygon';
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly resolver: CapabilityResolverService,
  ) {}

  // ----------------------------------------------------------------- sites
  async createSite(orgId: string, dto: CreateSiteDto) {
    const repo = await this.db.repo(BillboardSiteEntity);
    const code = dto.code ?? `${slug(dto.name)}-${randomSuffix()}`.toUpperCase();
    const area = dto.area ?? dto.width * dto.height;
    const illuminationType = dto.illuminationType ?? 'none';

    const entries: InsertEntry[] = [
      { col: 'organization_id', val: orgId },
      { col: 'code', val: code },
      { col: 'name', val: dto.name },
      { col: 'type', val: dto.type ?? 'billboard' },
      { col: 'format', val: dto.format },
      { col: 'location', sql: 'location' },
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
      if (e.sql === 'location') {
        i += 1;
        const lngN = i;
        params.push(dto.longitude);
        i += 1;
        const latN = i;
        params.push(dto.latitude);
        placeholders.push(`ST_SetSRID(ST_MakePoint($${lngN}, $${latN}), 4326)`);
      } else if (e.sql === 'geo_polygon') {
        i += 1;
        const n = i;
        params.push(this.polygonSql(dto.geoPolygon!));
        placeholders.push(`ST_GeomFromGeoJSON($${n})`);
      } else {
        i += 1;
        params.push(e.val);
        placeholders.push(`$${i}`);
      }
    }
    const sql = `INSERT INTO billboard_sites (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${SITE_DETAIL_COLUMNS}`;
    const rows = await repo.query(sql, params);
    return rows[0];
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

    if (caps.has(Capability.INVENTORY_VIEW) && orgId) {
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
    const rows = await repo.query(
      `SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites ${whereSql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const totalRows = await repo.query(`SELECT count(*)::int AS c FROM billboard_sites ${whereSql}`, params);
    const total = totalRows[0]?.c ?? 0;
    return { items: rows, total, page, limit };
  }

  async getSite(user: AuthenticatedUser, orgId: string | undefined, siteId: string) {
    const repo = await this.db.repo(BillboardSiteEntity);
    const rows = await repo.query(`SELECT ${SITE_DETAIL_COLUMNS} FROM billboard_sites WHERE id = $1`, [siteId]);
    const site = rows[0];
    if (!site) throw new NotFoundException('Site not found');
    const caps = await this.effectiveCapabilities(user.userId, orgId);
    const isOwner = site.organizationId === orgId && caps.has(Capability.INVENTORY_VIEW);
    if (!isOwner && site.status !== 'listed') {
      throw new ForbiddenException('Site not available');
    }
    const [faces, assets, metadata, rateCards] = await Promise.all([
      this.listFaces(siteId),
      this.listAssets(siteId),
      this.listMetadata(siteId),
      this.listRateCards(siteId),
    ]);
    return { ...site, faces, assets, metadata, rateCards };
  }

  async updateSite(orgId: string, siteId: string, dto: UpdateSiteDto) {
    await this.assertOwnership(orgId, siteId);
    const repo = await this.db.repo(BillboardSiteEntity);
    const sets: string[] = [];
    const params: unknown[] = [];
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
      if (v !== undefined) {
        params.push(v);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (dto.permitExpiresAt !== undefined) {
      params.push(dto.permitExpiresAt ? new Date(dto.permitExpiresAt) : null);
      sets.push(`permit_expires_at = $${params.length}`);
    }
    if (dto.latitude !== undefined && dto.longitude !== undefined) {
      params.push(dto.longitude, dto.latitude);
      sets.push(`location = ST_SetSRID(ST_MakePoint($${params.length - 1}, $${params.length}), 4326)`);
    }
    if (dto.geoPolygon !== undefined) {
      if (dto.geoPolygon && dto.geoPolygon.length >= 3) {
        params.push(this.polygonSql(dto.geoPolygon));
        sets.push(`geo_polygon = ST_GeomFromGeoJSON($${params.length})`);
      } else {
        sets.push('geo_polygon = NULL');
      }
    }
    if (sets.length === 0) return this.getSite({ userId: '' } as AuthenticatedUser, orgId, siteId);
    params.push(siteId);
    await repo.query(`UPDATE billboard_sites SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    return this.getSite({ userId: '' } as AuthenticatedUser, orgId, siteId);
  }

  async deleteSite(orgId: string, siteId: string) {
    await this.assertOwnership(orgId, siteId);
    const repo = await this.db.repo(BillboardSiteEntity);
    await repo.query(`UPDATE billboard_sites SET status = 'decommissioned' WHERE id = $1`, [siteId]);
    return { id: siteId, status: 'decommissioned' };
  }

  async submitSite(orgId: string, siteId: string) {
    await this.assertOwnership(orgId, siteId);
    await this.transition(siteId, 'draft', 'pending_review');
    return { id: siteId, status: 'pending_review' };
  }

  async approveSite(siteId: string) {
    await this.transition(siteId, 'pending_review', 'listed');
    return { id: siteId, status: 'listed' };
  }

  async rejectSite(siteId: string, reason: string) {
    await this.transition(siteId, 'pending_review', 'draft');
    return { id: siteId, status: 'draft', reason };
  }

  async suspendSite(siteId: string) {
    await this.transition(siteId, ['listed', 'approved'], 'suspended');
    return { id: siteId, status: 'suspended' };
  }

  async unsuspendSite(siteId: string) {
    await this.transition(siteId, 'suspended', 'listed');
    return { id: siteId, status: 'listed' };
  }

  // ----------------------------------------------------------------- faces
  async addFace(orgId: string, siteId: string, dto: CreateFaceDto) {
    await this.assertOwnership(orgId, siteId);
    const repo = await this.db.repo(SiteFaceEntity);
    return repo.save(
      repo.create({
        siteId,
        faceLabel: dto.faceLabel,
        width: dto.width,
        height: dto.height,
        area: dto.area,
        units: dto.units,
        printableArea: dto.printableArea,
        bookable: dto.bookable ?? true,
      }),
    );
  }

  async listFaces(siteId: string) {
    const repo = await this.db.repo(SiteFaceEntity);
    return repo.find({ where: { siteId } });
  }

  async updateFace(orgId: string, faceId: string, dto: UpdateFaceDto) {
    const repo = await this.db.repo(SiteFaceEntity);
    const face = await repo.findOne({ where: { id: faceId } });
    if (!face) throw new NotFoundException('Face not found');
    await this.assertOwnership(orgId, face.siteId);
    Object.assign(face, {
      ...(dto.faceLabel !== undefined && { faceLabel: dto.faceLabel }),
      ...(dto.width !== undefined && { width: dto.width }),
      ...(dto.height !== undefined && { height: dto.height }),
      ...(dto.area !== undefined && { area: dto.area }),
      ...(dto.units !== undefined && { units: dto.units }),
      ...(dto.printableArea !== undefined && { printableArea: dto.printableArea }),
      ...(dto.bookable !== undefined && { bookable: dto.bookable }),
    });
    return repo.save(face);
  }

  async removeFace(orgId: string, faceId: string) {
    const repo = await this.db.repo(SiteFaceEntity);
    const face = await repo.findOne({ where: { id: faceId } });
    if (!face) throw new NotFoundException('Face not found');
    await this.assertOwnership(orgId, face.siteId);
    await repo.delete({ id: faceId });
    return { id: faceId, deleted: true };
  }

  // ----------------------------------------------------------------- assets
  async addAsset(orgId: string, siteId: string, kind: string, storageRef: string, capturedAt?: Date) {
    await this.assertOwnership(orgId, siteId);
    const repo = await this.db.repo(SiteAssetEntity);
    return repo.save(repo.create({ siteId, kind, storageRef, capturedAt }));
  }

  async listAssets(siteId: string) {
    const repo = await this.db.repo(SiteAssetEntity);
    return repo.find({ where: { siteId } });
  }

  async deleteAsset(orgId: string, siteId: string, assetId: string) {
    await this.assertOwnership(orgId, siteId);
    const repo = await this.db.repo(SiteAssetEntity);
    await repo.delete({ id: assetId, siteId });
    return { id: assetId, deleted: true };
  }

  // ----------------------------------------------------------------- metadata
  async addMetadata(orgId: string, siteId: string, dto: CreateMetadataDto) {
    await this.assertOwnership(orgId, siteId);
    const repo = await this.db.repo(SiteMetadataEntity);
    return repo.save(
      repo.create({
        siteId,
        dimension: dto.dimension,
        payload: dto.payload,
        source: dto.source,
        method: dto.method,
        confidence: dto.confidence,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      }),
    );
  }

  async listMetadata(siteId: string) {
    const repo = await this.db.repo(SiteMetadataEntity);
    return repo.find({ where: { siteId } });
  }

  async updateMetadata(orgId: string, metadataId: string, dto: UpdateMetadataDto) {
    const repo = await this.db.repo(SiteMetadataEntity);
    const m = await repo.findOne({ where: { id: metadataId } });
    if (!m) throw new NotFoundException('Metadata not found');
    await this.assertOwnership(orgId, m.siteId);
    Object.assign(m, {
      ...(dto.dimension !== undefined && { dimension: dto.dimension }),
      ...(dto.payload !== undefined && { payload: dto.payload }),
      ...(dto.source !== undefined && { source: dto.source }),
      ...(dto.method !== undefined && { method: dto.method }),
      ...(dto.confidence !== undefined && { confidence: dto.confidence }),
      ...(dto.collectedAt !== undefined && { collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : null }),
      ...(dto.expiresAt !== undefined && { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
    });
    return repo.save(m);
  }

  // ----------------------------------------------------------------- rate cards
  async createRateCard(orgId: string, siteId: string, dto: CreateRateCardDto) {
    await this.assertOwnership(orgId, siteId);
    const repo = await this.db.repo(RateCardEntity);
    return repo.save(
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
  }

  async listRateCards(siteId: string) {
    const repo = await this.db.repo(RateCardEntity);
    return repo.find({ where: { siteId } });
  }

  async updateRateCard(orgId: string, rateCardId: string, dto: UpdateRateCardDto) {
    const repo = await this.db.repo(RateCardEntity);
    const rc = await repo.findOne({ where: { id: rateCardId } });
    if (!rc) throw new NotFoundException('Rate card not found');
    if (rc.organizationId !== orgId) throw new ForbiddenException('Not your rate card');
    Object.assign(rc, {
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.rates !== undefined && { rates: dto.rates }),
      ...(dto.seasonalRules !== undefined && { seasonalRules: dto.seasonalRules }),
      ...(dto.effectiveFrom !== undefined && { effectiveFrom: new Date(dto.effectiveFrom) }),
      ...(dto.effectiveTo !== undefined && { effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null }),
    });
    return repo.save(rc);
  }

  // ----------------------------------------------------------------- helpers
  private async assertOwnership(orgId: string | undefined, siteId: string) {
    const repo = await this.db.repo(BillboardSiteEntity);
    const rows = await repo.query(
      `SELECT organization_id AS "organizationId" FROM billboard_sites WHERE id = $1`,
      [siteId],
    );
    if (!rows[0]) throw new NotFoundException('Site not found');
    if (rows[0].organizationId !== orgId) throw new ForbiddenException('Not your site');
  }

  private async transition(siteId: string, from: string | string[], to: string) {
    const repo = await this.db.repo(BillboardSiteEntity);
    const fromList = Array.isArray(from) ? from : [from];
    const rows = await repo.query(`SELECT status FROM billboard_sites WHERE id = $1`, [siteId]);
    if (!rows[0]) throw new NotFoundException('Site not found');
    if (!fromList.includes(rows[0].status)) {
      throw new ForbiddenException(`Site is ${rows[0].status}, expected ${fromList.join('/')}`);
    }
    await repo.query(`UPDATE billboard_sites SET status = $1 WHERE id = $2`, [to, siteId]);
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
    return this.resolver.resolve(m.role as never, overrides);
  }

  /** Build a closed GeoJSON Polygon SQL string from an array of points. */
  private polygonSql(points: { longitude: number; latitude: number }[]): string {
    const ring = points.map((p) => [p.longitude, p.latitude]);
    ring.push(ring[0]); // close the ring
    return JSON.stringify({ type: 'Polygon', coordinates: [ring] });
  }
}
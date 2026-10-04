import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { SiteMetadataEntity } from '../common/entities/site-metadata.entity';
import { RateCardEntity } from '../common/entities/rate-card.entity';
import { METADATA_COLUMNS, PRODUCTION_METADATA_WHERE } from '../common/metadata-filter';
import type { MarketplaceQueryDto } from './dto/marketplace.dto';

const SITE_COLUMNS =
  'id, code, name, type, format, sub_format AS "subFormat", address, city, region, country, ' +
  'market_id AS "marketId", orientation_deg AS "orientationDeg", viewing_distance AS "viewingDistance", ' +
  'elevation, width, height, area, units, illumination_type AS "illuminationType", illumination_hours AS "illuminationHours", ' +
  'description, status, permit_ref AS "permitRef", permit_expires_at AS "permitExpiresAt", ' +
  'latitude, longitude, ' +
  'created_at AS "createdAt", updated_at AS "updatedAt"';

@Injectable()
export class MarketplaceService {
  constructor(private readonly db: DatabaseService) {}

  private postgisCache: boolean | undefined;
  /** True when the PostGIS extension is installed (enables ST_DWithin). */
  private async hasPostgis(): Promise<boolean> {
    if (this.postgisCache !== undefined) return this.postgisCache;
    const repo = await this.db.repo(BillboardSiteEntity);
    const rows = await repo
      .query("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis')::bool AS has")
      .catch(() => [{ has: false }]);
    this.postgisCache = !!rows[0]?.has;
    return this.postgisCache;
  }

  /** Search listed sites available for booking, with filters + spatial radius. */
  async search(q: MarketplaceQueryDto) {
    if (q.startDate && q.endDate && q.startDate >= q.endDate) {
      throw new BadRequestException('End date must be after start date.');
    }
    if (Boolean(q.startDate) !== Boolean(q.endDate)) {
      throw new BadRequestException('Choose both a start and end date.');
    }
    const page = Math.max(1, q.page ?? 1);
    const limit = Math.min(100, Math.max(1, q.limit ?? 20));
    const repo = await this.db.repo(BillboardSiteEntity);

    const params: unknown[] = [];
    const hasWindow = Boolean(q.startDate && q.endDate);
    if (hasWindow) params.push(q.startDate, q.endDate);
    const periodStart = hasWindow ? '$1::date' : 'CURRENT_DATE';
    const periodEnd = hasWindow ? "($2::date - INTERVAL '1 day')" : 'CURRENT_DATE';
    const bookableFace =
      "f.bookable AND (s.format <> 'digital_led' OR " +
      '(f.pixel_width > 0 AND f.pixel_height > 0 AND f.spot_length_seconds > 0 ' +
      'AND f.loop_length_seconds > 0 AND f.spots_per_loop > 0))';
    const faceAvailable = hasWindow
      ? "AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.face_id = f.id::text AND b.status IN ('held','confirmed','live') " +
        'AND b.start_date < $2::date AND b.end_date > $1::date) ' +
        'AND NOT EXISTS (SELECT 1 FROM face_blackouts x WHERE x.face_id = f.id::text ' +
        'AND x.start_date < $2::date AND x.end_date > $1::date)'
      : '';
    const validPrice = (alias: string) =>
      `((${alias}.rates->>'perDay')::numeric > 0 OR (${alias}.rates->>'perWeek')::numeric > 0 ` +
      `OR (${alias}.rates->>'perMonth')::numeric > 0)`;
    const rateScope = (start: string, end: string) =>
      `r.site_id = s.id::text AND (r.face_id = f.id::text OR (r.face_id IS NULL AND NOT EXISTS (` +
      `SELECT 1 FROM rate_cards specific WHERE specific.site_id = s.id::text AND specific.face_id = f.id::text ` +
      `AND specific.effective_from::date <= ${end} ` +
      `AND (specific.effective_to IS NULL OR specific.effective_to::date >= ${start}) ` +
      `AND ${validPrice('specific')})))`;
    const currentRateForFace = `${rateScope('CURRENT_DATE', 'CURRENT_DATE')} AND r.effective_from::date <= CURRENT_DATE ` +
      `AND (r.effective_to IS NULL OR r.effective_to::date >= CURRENT_DATE) AND ${validPrice('r')}`;
    const rateForFace =
      `${rateScope(periodStart, periodEnd)} ` +
      `AND r.effective_from::date <= ${periodStart} ` +
      `AND (r.effective_to IS NULL OR r.effective_to::date >= ${periodEnd}) ` +
      (hasWindow ? 'AND (r.min_booking_days IS NULL OR r.min_booking_days <= ($2::date - $1::date)) ' : '') +
      `AND ${validPrice('r')}`;
    // One eligibility rule drives both visibility and displayed/budget price.
    // A partial face override suppresses the default for the whole query window;
    // agency-side quoting will resolve windows that need multiple rate segments.
    const priceSql =
      "(SELECT min((r.rates->>'perDay')::numeric) FROM site_faces f JOIN rate_cards r " +
      'ON r.site_id = s.id::text ' +
      `WHERE f.site_id = s.id::text AND ${bookableFace} ${faceAvailable} AND ${rateForFace})`;
    const where: string[] = [
      "s.status = 'listed'",
      `(s.permit_expires_at IS NULL OR (s.permit_expires_at::date >= CURRENT_DATE AND s.permit_expires_at::date >= ${periodEnd}))`,
      "EXISTS (SELECT 1 FROM site_assets a WHERE a.site_id = s.id::text AND a.kind = 'front')",
      'NOT EXISTS (SELECT 1 FROM site_faces f WHERE f.site_id = s.id::text AND f.bookable ' +
        `AND ((${bookableFace}) IS NOT TRUE OR NOT EXISTS (SELECT 1 FROM rate_cards r WHERE ${currentRateForFace})))`,
      'EXISTS (SELECT 1 FROM site_faces f WHERE f.site_id = s.id::text AND ' +
        bookableFace + ' ' + faceAvailable + ' AND EXISTS (SELECT 1 FROM rate_cards r WHERE ' + rateForFace + '))',
    ];
    const push = (clause: string, ...values: unknown[]) => {
      const start = params.length + 1;
      for (const v of values) params.push(v);
      let n = start;
      where.push(clause.replace(/\?/g, () => `$${n++}`));
    };

    if (q.country) push('s.country = ?', q.country);
    if (q.city) push('s.city ILIKE ?', `%${q.city}%`);
    if (q.market) push('s.market_id = ?', q.market);
    if (q.format) push('s.format = ?', q.format);
    if (q.illumination) push('s.illumination_type = ?', q.illumination);
    if (q.search) {
      const term = `%${q.search}%`;
      push(
        '(s.name ILIKE ? OR s.description ILIKE ? OR s.city ILIKE ? OR s.address ILIKE ? ' +
          'OR s.region ILIKE ? OR s.country ILIKE ? OR EXISTS (SELECT 1 FROM markets m WHERE m.id::text = s.market_id AND m.name ILIKE ?))',
        term,
        term,
        term,
        term,
        term,
        term,
        term,
      );
    }
    if (q.minSize !== undefined) push('COALESCE(s.area, s.width * s.height) >= ?', q.minSize);
    if (q.maxSize !== undefined) push('COALESCE(s.area, s.width * s.height) <= ?', q.maxSize);
    if (q.minPrice !== undefined) {
      push(`${priceSql} >= ?`, q.minPrice);
    }
    if (q.maxPrice !== undefined) {
      push(`${priceSql} <= ?`, q.maxPrice);
    }
    if (q.lat !== undefined && q.lng !== undefined && q.radius !== undefined) {
      if (await this.hasPostgis()) {
        // PostGIS available: ST_DWithin on geometry built from the float columns (meters).
        push(
          'ST_DWithin(ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography, ST_SetSRID(ST_MakePoint(?, ?), 4326)::geography, ?)',
          q.lng,
          q.lat,
          q.radius * 1000,
        );
      } else {
        // No PostGIS: Haversine great-circle distance in km on the float columns.
        push(
          '(6371 * acos(LEAST(1, sin(radians(?)) * sin(radians(s.latitude)) + cos(radians(?)) * cos(radians(s.latitude)) * cos(radians(s.longitude - ?))))) <= ?',
          q.lat,
          q.lat,
          q.lng,
          q.radius,
        );
      }
    }
    const whereSql = where.join(' AND ');
    const offset = (page - 1) * limit;
    // Demo-class rows (seeded showcase fiction) never aggregate into the
    // planner's key-metadata map: the predicate lives inside the subselect so
    // the aggregate physically cannot include one.
    const rows = await repo.query(
      `SELECT s.id, s.code, s.name, s.format, s.city, s.country, s.illumination_type AS "illuminationType",
        s.width, s.height, s.area, s.latitude, s.longitude,
        (SELECT count(*) FROM site_faces WHERE site_id = s.id::text) AS "faceCount",
        ${priceSql} AS "startingPrice",
        (SELECT storage_ref FROM site_assets WHERE site_id = s.id::text AND kind = 'front' ORDER BY created_at DESC LIMIT 1) AS "thumbnail",
        (SELECT jsonb_object_agg(dimension, payload) FROM site_metadata WHERE site_id = s.id::text AND ${PRODUCTION_METADATA_WHERE}) AS "keyMetadata"
       FROM billboard_sites s WHERE ${whereSql} ORDER BY s.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const totalRows = await repo.query(`SELECT count(*)::int AS c FROM billboard_sites s WHERE ${whereSql}`, params);
    return { items: rows, total: totalRows[0]?.c ?? 0, page, limit };
  }

  /** Authenticated buyer detail of a listed site (faces, assets, metadata, rate cards). */
  async getMarketplaceSite(siteId: string) {
    const repo = await this.db.repo(BillboardSiteEntity);
    const rows = await repo.query(`SELECT ${SITE_COLUMNS} FROM billboard_sites WHERE id = $1`, [siteId]);
    const site = rows[0];
    if (!site) throw new NotFoundException('Site not found');
    if (site.status !== 'listed') {
      throw new NotFoundException('Site not listed');
    }
    const [faces, assets, metadata, rateCards] = await Promise.all([
      this.db.repo(SiteFaceEntity).then((r) => r.find({ where: { siteId } })),
      this.db.repo(SiteAssetEntity).then((r) => r.find({ where: { siteId } })),
      // Demo-class rows never reach the buyer detail surface (§1.4.1).
      this.db.repo(SiteMetadataEntity).then((r) =>
        r.query(
          `SELECT ${METADATA_COLUMNS} FROM site_metadata WHERE site_id = $1 AND ${PRODUCTION_METADATA_WHERE} ORDER BY created_at ASC`,
          [siteId],
        ),
      ),
      this.db.repo(RateCardEntity).then((r) => r.find({ where: { siteId } })),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const bookable = faces.filter((face) => face.bookable);
    const ready = (!site.permitExpiresAt || new Date(site.permitExpiresAt).toISOString().slice(0, 10) >= today) &&
      assets.some((asset) => asset.kind === 'front') && bookable.length > 0 &&
      bookable.every((face) =>
        (site.format !== 'digital_led' || Boolean(
          face.pixelWidth && face.pixelHeight && face.spotLengthSeconds && face.loopLengthSeconds && face.spotsPerLoop
        )) && rateCards.some((rate) =>
          (!rate.faceId || rate.faceId === face.id) &&
          new Date(rate.effectiveFrom).toISOString().slice(0, 10) <= today &&
          (!rate.effectiveTo || new Date(rate.effectiveTo).toISOString().slice(0, 10) >= today) &&
          Object.values(rate.rates).some((price) => typeof price === 'number' && price > 0),
        ),
      );
    if (!ready) throw new NotFoundException('Site is not ready for the marketplace');
    return { ...site, faces, assets, metadata, rateCards };
  }
}

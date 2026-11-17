import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { isUUID } from 'class-validator';
import type { EntityManager } from 'typeorm';
import type {
  AgencyCampaignBooking,
  AgencyCampaignDetail,
  AgencyCampaignList,
  AgencyCampaignPermissions,
  AgencyCampaignProofRecord,
  AgencyCampaignSummary,
  AgencyCurrencyTotal,
} from '@abonten/contracts/agency-campaign';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { Capability } from '../capabilities/capability.enum';
import type { OrganizationRole } from '../capabilities/organization-roles';
import { DatabaseService } from '../common/database.service';
import { StorageService } from '../common/storage.service';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { PLANNING_CURRENCIES } from './planning-math';

interface Actor {
  userId: string;
  organizationId: string;
}
interface CampaignRow extends AgencyCampaignSummary {
  objective: string | null;
  targetAudience: string | null;
}
interface BookingRow extends AgencyCampaignBooking {
  campaignItemId: string;
}

const validAmount = (amount: number | null | undefined): number | null =>
  typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null;
const currency = (value: string | null | undefined): string | null =>
  PLANNING_CURRENCIES.some((candidate) => candidate === value) ? value! : null;

/** The shared scope follows campaign ownership, never a face-only POP/issue join. */
const campaignScope = `
WITH owned AS (
  SELECT c.*, client.name AS client_name FROM campaigns c
  LEFT JOIN organizations client ON client.id::text = c.client_org_id AND client.type = 'brand'
  WHERE c.organization_id = $1 AND c.scenario_of IS NULL
    AND ($2::uuid IS NULL OR c.id = $2::uuid)
), scoped_items AS (
  SELECT i.* FROM campaign_items i JOIN owned c ON c.id::text = i.campaign_id
), scoped_bookings AS (
  SELECT b.*, i.campaign_id FROM bookings b
  JOIN scoped_items i ON i.id::text = b.campaign_item_id AND i.face_id = b.face_id
), scoped_proofs AS (
  SELECT p.*, b.campaign_id, b.campaign_item_id FROM proofs_of_performance p
  JOIN scoped_bookings b ON b.id::text = p.booking_id
  WHERE (p.face_id IS NULL OR p.face_id = b.face_id)
), scoped_issues AS (
  SELECT issue.*, COALESCE(issue.campaign_id, b.campaign_id, p.campaign_id) AS owned_campaign_id
  FROM issues issue
  LEFT JOIN scoped_bookings b ON b.id::text = issue.booking_id
  LEFT JOIN scoped_proofs p ON p.id::text = issue.pop_id
  JOIN owned c ON c.id::text = COALESCE(issue.campaign_id, b.campaign_id, p.campaign_id)
  WHERE (issue.campaign_id IS NULL OR issue.campaign_id = c.id::text)
    AND (issue.booking_id IS NULL OR b.campaign_id = c.id::text)
    AND (issue.pop_id IS NULL OR p.campaign_id = c.id::text)
    AND (issue.booking_id IS NULL OR issue.pop_id IS NULL OR p.booking_id = issue.booking_id)
), scoped_quotes AS (
  SELECT q.*, COALESCE(q.campaign_id, b.campaign_id) AS owned_campaign_id FROM quotes q
  LEFT JOIN scoped_bookings b ON b.id::text = q.booking_id
  JOIN owned c ON c.id::text = COALESCE(q.campaign_id, b.campaign_id)
  WHERE (q.campaign_id IS NULL OR q.campaign_id = c.id::text)
    AND (q.booking_id IS NULL OR b.campaign_id = c.id::text)
), firm_costs AS (
  SELECT b.id, b.campaign_id,
    CASE WHEN COUNT(q.id) = 1 AND MIN(q.currency) = c.currency
      AND c.currency IN ('NGN','GHS','XAF','XOF','USD','EUR')
      AND BOOL_AND(q.campaign_id IS NULL OR q.campaign_id = c.id::text)
      AND MIN(q.subtotal) >= 0 AND MIN(q.subtotal) < 'Infinity'::double precision
      THEN MIN(q.subtotal) ELSE NULL END AS amount
  FROM scoped_bookings b JOIN owned c ON c.id::text = b.campaign_id
  LEFT JOIN quotes q ON q.booking_id = b.id::text AND q.status IN ('issued','paid')
  WHERE b.status IN ('confirmed','live','completed')
  GROUP BY b.id, b.campaign_id, c.id, c.currency
)`;

@Injectable()
export class AgencyCampaignsService {
  private activePhotoReads = 0;
  constructor(
    private readonly db: DatabaseService,
    private readonly capabilities: CapabilityResolverService,
    private readonly storage: StorageService,
  ) {}

  private async authorize(manager: EntityManager, actor: Actor) {
    if (!isUUID(actor.userId) || !isUUID(actor.organizationId))
      throw new ForbiddenException('Active agency membership required.');
    const org = await manager
      .getRepository(OrganizationEntity)
      .findOne({ where: { id: actor.organizationId, type: 'agency', status: 'active' } });
    const membership = await manager.getRepository(MembershipEntity).findOne({
      where: { userId: actor.userId, organizationId: actor.organizationId, status: 'active' },
    });
    const user = await manager
      .getRepository(UserEntity)
      .findOne({ where: { id: actor.userId, status: 'active' } });
    if (!org || !membership || !user)
      throw new ForbiddenException('Active agency membership required.');
    const overrides = await manager
      .getRepository(UserCapabilityOverrideEntity)
      .find({ where: { userId: actor.userId, organizationId: actor.organizationId } });
    const caps = this.capabilities.resolveScoped(
      membership.role as OrganizationRole,
      overrides,
      org.type,
    );
    if (!caps.has(Capability.CAMPAIGN_VIEW))
      throw new ForbiddenException('Campaign-view capability required.');
    return {
      defaultCurrency: org.defaultCurrency,
      permissions: {
        bookings: caps.has(Capability.BOOKING_VIEW),
        proof: caps.has(Capability.MONITORING_VIEW),
        issues: caps.has(Capability.ISSUE_VIEW),
      },
    };
  }

  private async rows(
    manager: EntityManager,
    organizationId: string,
    id: string | null = null,
  ): Promise<CampaignRow[]> {
    return manager.query<CampaignRow[]>(
      `${campaignScope},
      item_stats AS (
        SELECT campaign_id, COUNT(DISTINCT face_id) FILTER (WHERE status <> 'cancelled')::int AS faces
        FROM scoped_items GROUP BY campaign_id
      ), booking_stats AS (
        SELECT campaign_id, COUNT(*)::int AS bookings,
          COUNT(*) FILTER (WHERE status IN ('requested','held'))::int AS pending,
          COUNT(*) FILTER (WHERE status IN ('confirmed','live','completed'))::int AS firm
        FROM scoped_bookings GROUP BY campaign_id
      ), proof_stats AS (
        SELECT campaign_id, MAX(captured_at) FILTER (WHERE sync_state = 'synced') AS latest
        FROM scoped_proofs GROUP BY campaign_id
      ), issue_stats AS (
        SELECT owned_campaign_id, COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed'))::int AS open
        FROM scoped_issues GROUP BY owned_campaign_id
      ), money_stats AS (
        SELECT campaign_id, SUM(amount) AS known,
          COUNT(*) FILTER (WHERE amount IS NULL)::int AS missing
        FROM firm_costs GROUP BY campaign_id
      )
      SELECT c.id, c.name, c.status, c.client_name AS "clientName", c.currency,
        c.flight_start AS "flightStart", c.flight_end AS "flightEnd",
        c.total_budget AS "planningBudget", c.objective, c.target_audience AS "targetAudience",
        CASE WHEN COALESCE(m.missing,0) = 0 THEN COALESCE(m.known,0) ELSE NULL END AS "committedBudget",
        COALESCE(m.known,0) AS "committedKnownSubtotal", COALESCE(m.missing,0) AS "commitmentMissingCount",
        COALESCE(i.faces,0) AS "faceCount", COALESCE(b.bookings,0) AS "bookingCount",
        COALESCE(b.pending,0) AS "pendingBookingCount", COALESCE(b.firm,0) AS "firmBookingCount",
        p.latest AS "latestProofAt", COALESCE(issue.open,0) AS "openIssueCount", c.updated_at AS "updatedAt"
      FROM owned c LEFT JOIN item_stats i ON i.campaign_id = c.id::text
      LEFT JOIN booking_stats b ON b.campaign_id = c.id::text
      LEFT JOIN proof_stats p ON p.campaign_id = c.id::text
      LEFT JOIN issue_stats issue ON issue.owned_campaign_id = c.id::text
      LEFT JOIN money_stats m ON m.campaign_id = c.id::text
      ORDER BY c.updated_at DESC, c.id ASC`,
      [organizationId, id],
    );
  }

  private summary(row: CampaignRow, permissions: AgencyCampaignPermissions): AgencyCampaignSummary {
    const { objective: _objective, targetAudience: _targetAudience, ...result } = row;
    result.currency = currency(row.currency);
    result.planningBudget = result.currency ? validAmount(row.planningBudget) : null;
    if (!permissions.bookings) {
      result.committedBudget = result.committedKnownSubtotal = result.commitmentMissingCount = null;
      result.bookingCount = result.pendingBookingCount = result.firmBookingCount = null;
    }
    if (!permissions.proof) result.latestProofAt = null;
    if (!permissions.issues) result.openIssueCount = null;
    return result;
  }

  async list(
    actor: Actor,
    query: { status?: string; limit: number; offset: number },
  ): Promise<AgencyCampaignList> {
    return this.db.transaction(async (manager) => {
      const auth = await this.authorize(manager, actor);
      const rows = (await this.rows(manager, actor.organizationId)).map((row) =>
        this.summary(row, auth.permissions),
      );
      const statusCounts: Record<string, number> = {};
      const totals = new Map<string, AgencyCurrencyTotal>();
      for (const row of rows) {
        statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
        if (!row.currency) continue;
        const total = totals.get(row.currency) ?? {
          currency: row.currency,
          campaignCount: 0,
          planningBudget: 0,
          planningKnownSubtotal: 0,
          planningMissingCount: 0,
          committedBudget: auth.permissions.bookings ? 0 : null,
          committedKnownSubtotal: auth.permissions.bookings ? 0 : null,
          commitmentMissingCount: auth.permissions.bookings ? 0 : null,
        };
        total.campaignCount++;
        if (row.planningBudget === null) total.planningMissingCount++;
        else total.planningKnownSubtotal += row.planningBudget;
        total.planningBudget = total.planningMissingCount ? null : total.planningKnownSubtotal;
        if (auth.permissions.bookings) {
          total.committedKnownSubtotal! += row.committedKnownSubtotal!;
          total.commitmentMissingCount! += row.commitmentMissingCount!;
          total.committedBudget = total.commitmentMissingCount
            ? null
            : total.committedKnownSubtotal;
        }
        totals.set(row.currency, total);
      }
      const filtered = query.status ? rows.filter((row) => row.status === query.status) : rows;
      return {
        items: filtered.slice(query.offset, query.offset + query.limit),
        total: filtered.length,
        limit: query.limit,
        offset: query.offset,
        asOf: new Date().toISOString(),
        commitmentBasis: 'quote_subtotal',
        ...auth,
        statusCounts,
        currencyTotals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
        currencyMissingCount: rows.filter((row) => !row.currency).length,
      };
    });
  }

  async get(actor: Actor, id: string): Promise<AgencyCampaignDetail> {
    return this.db.transaction(async (manager) => {
      const { permissions } = await this.authorize(manager, actor);
      const [row] = await this.rows(manager, actor.organizationId, id);
      if (!row) throw new NotFoundException('Campaign not found.');
      const params = [actor.organizationId, id];
      const items = await manager.query<AgencyCampaignDetail['items']>(
        `${campaignScope}
        SELECT i.id, i.face_id AS "faceId", CASE WHEN site.id IS NOT NULL THEN f.face_label END AS "faceLabel", site.id AS "siteId",
          site.name AS "siteName", site.city, site.country, i.start_date::text AS "startDate", i.end_date::text AS "endDate", i.status
        FROM scoped_items i LEFT JOIN site_faces f ON f.id::text = i.face_id
        LEFT JOIN billboard_sites site ON site.id::text = f.site_id
          AND (site.demo_agency_id IS NULL OR site.demo_agency_id::text = $1)
          AND (site.research_agency_id IS NULL OR site.research_agency_id::text = $1)
        ORDER BY i.start_date, i.id`,
        params,
      );
      let bookings: BookingRow[] = [];
      if (permissions.bookings) {
        bookings = await manager.query<BookingRow[]>(
          `${campaignScope}
          SELECT b.id, b.campaign_item_id AS "campaignItemId", b.status, b.start_date::text AS "startDate", b.end_date::text AS "endDate",
            b.hold_expires_at AS "holdExpiresAt", b.currency, b.rate AS "recordedRate",
            c.currency AS "committedCurrency",
            CASE WHEN b.status IN ('confirmed','live','completed') THEN cost.amount ELSE 0 END AS "committedBudget"
          FROM scoped_bookings b JOIN owned c ON c.id::text = b.campaign_id
          LEFT JOIN firm_costs cost ON cost.id = b.id ORDER BY b.start_date, b.id`,
          params,
        );
      }
      const proofs = permissions.proof
        ? await manager.query<(AgencyCampaignProofRecord & { bookingId: string })[]>(
            `${campaignScope}
          SELECT p.id, p.booking_id AS "bookingId", p.campaign_item_id AS "campaignItemId", p.check_date::text AS "checkDate", p.status,
            p.captured_at AS "capturedAt", p.sync_state AS "syncState", p.condition_notes AS "conditionNotes",
            (SELECT COUNT(*)::int FROM pop_photos photo WHERE photo.pop_id = p.id::text AND NULLIF(photo.storage_ref,'') IS NOT NULL) AS "photoCount",
            (SELECT COUNT(*)::int FROM pop_photos photo WHERE photo.pop_id = p.id::text AND photo.kind = 'creative_visible' AND NULLIF(photo.storage_ref,'') IS NOT NULL) AS "creativeVisiblePhotoCount",
            (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', photo.id, 'kind', photo.kind) ORDER BY photo.created_at, photo.id), '[]'::jsonb)
             FROM pop_photos photo WHERE photo.pop_id = p.id::text AND NULLIF(photo.storage_ref,'') IS NOT NULL) AS photos
          FROM scoped_proofs p WHERE p.sync_state = 'synced' AND (
            p.id IN (SELECT DISTINCT ON (latest.booking_id) latest.id FROM scoped_proofs latest
              WHERE latest.sync_state = 'synced'
              ORDER BY latest.booking_id, latest.check_date DESC, latest.captured_at DESC NULLS LAST, latest.created_at DESC, latest.id DESC)
            OR ($3::boolean AND EXISTS (SELECT 1 FROM scoped_issues issue WHERE issue.pop_id = p.id::text AND issue.status NOT IN ('resolved','closed')))
          )
          ORDER BY p.check_date DESC, p.captured_at DESC NULLS LAST, p.created_at DESC, p.id DESC`,
            [...params, permissions.issues],
          )
        : [];
      const issues = permissions.issues
        ? await manager.query<NonNullable<AgencyCampaignDetail['issues']>>(
            `${campaignScope}
        SELECT id, type, severity, status, summary, booking_id AS "bookingId", pop_id AS "popId", due_at AS "dueAt"
        FROM scoped_issues WHERE status NOT IN ('resolved','closed')
        ORDER BY due_at ASC NULLS LAST, created_at ASC, id`,
            params,
          )
        : null;
      const quotes = permissions.bookings
        ? await manager.query<NonNullable<AgencyCampaignDetail['quotes']>>(
            `${campaignScope}
        SELECT id, booking_id AS "bookingId", currency, status, subtotal, taxes, total
        FROM scoped_quotes ORDER BY created_at DESC, id`,
            params,
          )
        : null;
      for (const item of items) {
        item.bookings = permissions.bookings
          ? bookings
              .filter((booking) => booking.campaignItemId === item.id)
              .map((booking) => {
                const { campaignItemId: _campaignItemId, ...result } = booking;
                result.currency = currency(booking.currency);
                result.committedCurrency = currency(booking.committedCurrency);
                result.recordedRate = validAmount(booking.recordedRate);
                const proof = proofs.find((candidate) => candidate.bookingId === booking.id);
                if (proof) {
                  const { bookingId: _bookingId, campaignItemId: _itemId, ...visible } = proof;
                  result.latestProof = visible;
                } else result.latestProof = null;
                return result;
              })
          : null;
      }
      for (const issue of issues ?? []) {
        if (!permissions.bookings) issue.bookingId = null;
        if (!permissions.proof) issue.popId = null;
      }
      for (const quote of quotes ?? []) {
        quote.subtotal = validAmount(quote.subtotal);
        quote.taxes = validAmount(quote.taxes);
        quote.total = validAmount(quote.total);
      }
      return {
        campaign: this.summary(row, permissions),
        commitmentBasis: 'quote_subtotal',
        permissions,
        objective: row.objective,
        targetAudience: row.targetAudience,
        items,
        proofs: permissions.proof
          ? proofs.map((proof) => ({
              ...proof,
              bookingId: permissions.bookings ? proof.bookingId : null,
            }))
          : null,
        issues,
        quotes,
      };
    });
  }

  async photo(actor: Actor, campaignId: string, proofId: string, photoId: string) {
    const ref = await this.db.transaction(async (manager) => {
      const { permissions } = await this.authorize(manager, actor);
      if (!permissions.proof) throw new ForbiddenException('Monitoring-view capability required.');
      const [photo] = await manager.query<{ storageRef: string | null }[]>(
        `${campaignScope}
        SELECT photo.storage_ref AS "storageRef" FROM pop_photos photo
        JOIN scoped_proofs p ON p.id::text = photo.pop_id AND p.sync_state = 'synced'
        WHERE p.id = $3::uuid AND photo.id = $4::uuid`,
        [actor.organizationId, campaignId, proofId, photoId],
      );
      const key = photo?.storageRef;
      if (
        !key ||
        !/^[A-Za-z0-9][A-Za-z0-9_./-]{0,500}$/.test(key) ||
        key.split('/').some((part) => part === '.' || part === '..')
      )
        throw new NotFoundException('Proof photo not found.');
      return key;
    });
    if (this.activePhotoReads >= 2)
      throw new ServiceUnavailableException('Photo previews are busy. Retry shortly.');
    this.activePhotoReads++;
    try {
      let buffer: Buffer;
      try {
        buffer = await this.storage.read(ref, 10 * 1024 * 1024);
      } catch (error) {
        const failure = error as {
          code?: string;
          name?: string;
          $metadata?: { httpStatusCode?: number };
        };
        if (
          error instanceof RangeError ||
          ['ENOENT', 'ENOTDIR'].includes(failure.code ?? '') ||
          ['NoSuchKey', 'NotFound'].includes(failure.name ?? '') ||
          failure.$metadata?.httpStatusCode === 404
        )
          throw new NotFoundException('Proof photo not found.');
        throw error;
      }
      try {
        const image = sharp(buffer, { failOn: 'warning', limitInputPixels: 40_000_000 }).timeout({
          seconds: 8,
        });
        const meta = await image.metadata();
        if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1)
          throw new Error('Unsupported proof image');
        // Serve a stripped preview; preserve the immutable original and its evidence.
        return await image
          .rotate()
          .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch {
        throw new NotFoundException('Proof photo not found.');
      }
    } finally {
      this.activePhotoReads--;
    }
  }
}

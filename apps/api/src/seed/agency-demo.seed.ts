import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { DataSource, EntityManager } from 'typeorm';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { Capability } from '../capabilities/capability.enum';
import type { OrganizationRole } from '../capabilities/organization-roles';
import { normalizePlanningDraft } from '../planning/planning-drafts.validation';
import { DEMO_PROVENANCE } from '../common/demo-inventory';

export const AGENCY_DEMO_VERSION = 'mediareach-lagos-demo-v1';
export const AGENCY_DEMO_EXPECTED_NAME = 'mediaReach OMD Lagos';
export const AGENCY_DEMO_CONTACT = 'planning-demo@mediareach-lagos.example';
export const AGENCY_DEMO_BOARDS = [
  {
    key: 'ikeja',
    name: 'DEMO · Ikeja Airport Approach',
    address: 'Mobolaji Bank Anthony Way, Ikeja',
    latitude: 6.5912,
    longitude: 3.3535,
    format: 'static',
    width: 12,
    height: 6,
    faces: 2,
    perDay: 50000,
  },
  {
    key: 'maryland',
    name: 'DEMO · Maryland Corridor',
    address: 'Ikorodu Road, Maryland',
    latitude: 6.5732,
    longitude: 3.3671,
    format: 'static',
    width: 10,
    height: 5,
    faces: 2,
    perDay: 35000,
  },
  {
    key: 'ojota',
    name: 'DEMO · Ojota Interchange',
    address: 'Ikorodu Road, Ojota',
    latitude: 6.5852,
    longitude: 3.3866,
    format: 'static',
    width: 12,
    height: 6,
    faces: 1,
    perDay: 30000,
  },
  {
    key: 'oworonshoki',
    name: 'DEMO · Mainland Bridge Approach',
    address: 'Third Mainland Bridge approach, Oworonshoki',
    latitude: 6.5531,
    longitude: 3.4022,
    format: 'static',
    width: 14,
    height: 7,
    faces: 1,
    perDay: 60000,
  },
  {
    key: 'victoria',
    name: 'DEMO · Victoria Island LED',
    address: 'Ahmadu Bello Way, Victoria Island',
    latitude: 6.4271,
    longitude: 3.4204,
    format: 'digital_led',
    width: 8,
    height: 4,
    faces: 1,
    perDay: 95000,
  },
  {
    key: 'lekki',
    name: 'DEMO · Lekki Phase 1 LED',
    address: 'Admiralty Way, Lekki Phase 1',
    latitude: 6.4472,
    longitude: 3.4641,
    format: 'digital_led',
    width: 10,
    height: 5,
    faces: 1,
    perDay: 120000,
  },
] as const;

/** Deterministic, namespaced fixture identifiers; no guessed user identities. */
export function agencyDemoId(orgId: string, key: string): string {
  const bytes = createHash('sha256')
    .update(`${AGENCY_DEMO_VERSION}:${orgId.toLowerCase()}:${key}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export interface AgencyDemoOptions {
  organizationId: string;
  expectedName: string;
  apply?: boolean;
  now?: Date;
}
interface PlannerRow {
  userId: string;
  role: OrganizationRole;
}
export interface AgencyDemoReport {
  applied: boolean;
  organizationId: string;
  organizationName: string;
  version: string;
  boards: { id: string; name: string; faceIds: string[] }[];
  planners: { userId: string; draftIds: string[] }[];
  inserted: { sites: number; faces: number; rateCards: number; drafts: number; audits: number };
}

async function insert(manager: EntityManager, sql: string, params: unknown[]): Promise<boolean> {
  return (
    (await manager.query(`${sql} ON CONFLICT (id) DO NOTHING RETURNING id`, params)).length > 0
  );
}
async function audit(
  manager: EntityManager,
  orgId: string,
  entityId: string,
  action: string,
  entityType: string,
  userId?: string,
) {
  await manager.query(
    `INSERT INTO audit_logs (actor_user_id, actor_org_id, action, entity_type, entity_id, "after") VALUES ($1,$2,$3,$4,$5,$6::json)`,
    [
      userId ?? null,
      orgId,
      action,
      entityType,
      entityId,
      JSON.stringify(
        entityType === 'personal_planning_draft'
          ? { revision: 1 }
          : { demo: true, version: AGENCY_DEMO_VERSION },
      ),
    ],
  );
}

/** Dedicated additive seed. Never invokes generic seeders or migrations, creates
 * identities, grants rights, or updates conflicts. Dry-run is the default. */
export async function seedAgencyDemo(
  db: DataSource,
  options: AgencyDemoOptions,
): Promise<AgencyDemoReport> {
  if (!isUUID(options.organizationId) || options.expectedName !== AGENCY_DEMO_EXPECTED_NAME)
    throw new Error(
      'Specify the independently verified mediaReach OMD agency UUID and exact organization name.',
    );
  const orgId = options.organizationId.toLowerCase();
  return db.transaction(async (manager) => {
    const organizations = await manager.query(
      `SELECT id, name, type, status FROM organizations WHERE id = $1${options.apply ? ' FOR UPDATE' : ''}`,
      [orgId],
    );
    const org = organizations[0];
    if (
      !org ||
      org.name !== options.expectedName ||
      org.type !== 'agency' ||
      org.status !== 'active'
    )
      throw new Error('The target is not the verified active mediaReach OMD agency.');
    const rows: PlannerRow[] = await manager.query(
      `SELECT DISTINCT u.id AS "userId", m.role FROM memberships m JOIN users u ON u.id::text = m.user_id::text WHERE m.organization_id::text = $1::text AND m.status = 'active' AND u.status = 'active' ORDER BY u.id`,
      [orgId],
    );
    const resolver = new CapabilityResolverService();
    const planners: PlannerRow[] = [];
    for (const member of rows) {
      const overrides = await manager.query(
        'SELECT capability, action FROM user_capability_overrides WHERE user_id::text = $1::text AND organization_id::text = $2::text',
        [member.userId, orgId],
      );
      const caps = resolver.resolveScoped(member.role, overrides, 'agency');
      if (caps.has(Capability.MARKETPLACE_VIEW) && caps.has(Capability.CAMPAIGN_CREATE))
        planners.push(member);
    }
    if (!planners.length)
      throw new Error('No active target-agency members already have both planning capabilities.');
    const boards = AGENCY_DEMO_BOARDS.map((board) => ({
      id: agencyDemoId(orgId, `site:${board.key}`),
      name: board.name,
      faceIds: Array.from({ length: board.faces }, (_, i) =>
        agencyDemoId(orgId, `face:${board.key}:${i + 1}`),
      ),
    }));
    // Refuse identity collisions rather than modifying a row belonging elsewhere.
    const existingSites = await manager.query(
      'SELECT id, organization_id, demo_agency_id FROM billboard_sites WHERE id::text = ANY($1::text[])',
      [boards.map((board) => board.id)],
    );
    if (
      existingSites.some(
        (site: { organization_id: string; demo_agency_id: string | null }) =>
          site.organization_id !== orgId || site.demo_agency_id !== orgId,
      )
    )
      throw new Error(
        'A demo site identifier collides with existing inventory outside the exact demo scope.',
      );
    const expectedFaces = new Map(
      boards.flatMap((board) => board.faceIds.map((id) => [id, board.id] as const)),
    );
    const existingFaces = await manager.query(
      'SELECT id, site_id FROM site_faces WHERE id::text = ANY($1::text[])',
      [[...expectedFaces.keys()]],
    );
    if (
      existingFaces.some(
        (face: { id: string; site_id: string }) => expectedFaces.get(face.id) !== face.site_id,
      )
    )
      throw new Error('A demo face identifier collides with another site.');
    const expectedRates = new Map(
      AGENCY_DEMO_BOARDS.flatMap((board) =>
        Array.from(
          { length: board.faces },
          (_, i) =>
            [
              agencyDemoId(orgId, `rate:${board.key}:${i + 1}`),
              agencyDemoId(orgId, `face:${board.key}:${i + 1}`),
            ] as const,
        ),
      ),
    );
    const existingRates = await manager.query(
      'SELECT id, organization_id, face_id FROM rate_cards WHERE id::text = ANY($1::text[])',
      [[...expectedRates.keys()]],
    );
    if (
      existingRates.some(
        (rate: { id: string; organization_id: string; face_id: string }) =>
          rate.organization_id !== orgId || expectedRates.get(rate.id) !== rate.face_id,
      )
    )
      throw new Error('A demo rate identifier collides with another scope.');
    const now = options.now ?? new Date();
    if (!Number.isFinite(now.getTime()))
      throw new Error('Use a valid demo planning reference time.');
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const end = new Date(start.getTime() + 14 * 86400000);
    const window = {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
    const scenarios = [
      {
        key: 'mainland-fit',
        name: 'DEMO · Mainland launch within NGN 2m',
        budget: '2000000',
        boardKeys: ['ikeja', 'maryland', 'ojota'],
      },
      {
        key: 'island-over',
        name: 'DEMO · Island LED above NGN 1m',
        budget: '1000000',
        boardKeys: ['victoria', 'lekki'],
      },
      {
        key: 'budget-missing',
        name: 'DEMO · Bridge corridor — confirm budget',
        budget: '',
        boardKeys: ['oworonshoki', 'maryland'],
      },
    ];
    const users = planners.map((planner) => ({
      userId: planner.userId,
      draftIds: scenarios.map((scenario) =>
        agencyDemoId(orgId, `draft:${planner.userId}:${scenario.key}`),
      ),
    }));
    for (const user of users) {
      const existing = await manager.query(
        'SELECT id, user_id, organization_id FROM personal_planning_drafts WHERE id::text = ANY($1::text[])',
        [user.draftIds],
      );
      if (
        existing.some(
          (row: { user_id: string; organization_id: string }) =>
            row.user_id !== user.userId || row.organization_id !== orgId,
        )
      )
        throw new Error('A demo draft identifier collides with another personal scope.');
      const [count] = await manager.query(
        'SELECT count(*)::int AS count FROM personal_planning_drafts WHERE user_id = $1 AND organization_id = $2',
        [user.userId, orgId],
      );
      if (count.count + scenarios.length - existing.length > 30)
        throw new Error(
          'A planner lacks room for three demo scenarios; existing personal drafts will not be changed.',
        );
    }
    const report: AgencyDemoReport = {
      applied: options.apply === true,
      organizationId: orgId,
      organizationName: org.name,
      version: AGENCY_DEMO_VERSION,
      boards,
      planners: users,
      inserted: { sites: 0, faces: 0, rateCards: 0, drafts: 0, audits: 0 },
    };
    if (!options.apply) return report;
    for (const [index, board] of AGENCY_DEMO_BOARDS.entries()) {
      const ids = boards[index]!;
      if (
        await insert(
          manager,
          `INSERT INTO billboard_sites (id, organization_id, demo_agency_id, code, name, type, format, latitude, longitude, address, city, region, country, width, height, area, units, illumination_type, description, status) VALUES ($1,$2::text,$2::uuid,$3,$4,'billboard',$5,$6,$7,$8,'Lagos','Lagos State','Nigeria',$9,$10,$11,'m',$12,$13,'listed')`,
          [
            ids.id,
            orgId,
            `DEMO-MR-${board.key.toUpperCase()}`,
            board.name,
            board.format,
            board.latitude,
            board.longitude,
            board.address,
            board.width,
            board.height,
            board.width * board.height,
            board.format === 'digital_led' ? 'led' : 'front_lit',
            `${DEMO_PROVENANCE} Synthetic contact: ${AGENCY_DEMO_CONTACT}.`,
          ],
        )
      ) {
        report.inserted.sites++;
        await audit(manager, orgId, ids.id, 'demo.inventory.seeded', 'billboard_site');
        report.inserted.audits++;
      }
      for (const [faceIndex, faceId] of ids.faceIds.entries()) {
        const digital = board.format === 'digital_led';
        if (
          await insert(
            manager,
            `INSERT INTO site_faces (id,site_id,face_label,width,height,area,units,bookable,pixel_width,pixel_height,spot_length_seconds,loop_length_seconds,spots_per_loop,proof_of_play) VALUES ($1,$2,$3,$4,$5,$6,'m',true,$7,$8,$9,$10,$11,$12)`,
            [
              faceId,
              ids.id,
              `DEMO Face ${faceIndex + 1}`,
              board.width,
              board.height,
              board.width * board.height,
              digital ? 1920 : null,
              digital ? 960 : null,
              digital ? 10 : null,
              digital ? 60 : null,
              digital ? 6 : null,
              digital ? false : null,
            ],
          )
        ) {
          report.inserted.faces++;
          await audit(manager, orgId, faceId, 'demo.face.seeded', 'site_face');
          report.inserted.audits++;
        }
        const rateId = agencyDemoId(orgId, `rate:${board.key}:${faceIndex + 1}`);
        if (
          await insert(
            manager,
            `INSERT INTO rate_cards (id,organization_id,site_id,face_id,min_booking_days,currency,rates,effective_from) VALUES ($1,$2,$3,$4,7,'NGN',$5::json,$6)`,
            [
              rateId,
              orgId,
              ids.id,
              faceId,
              JSON.stringify({ perDay: board.perDay }),
              new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
            ],
          )
        ) {
          report.inserted.rateCards++;
          await audit(manager, orgId, rateId, 'demo.rate.seeded', 'rate_card');
          report.inserted.audits++;
        }
      }
    }
    for (const user of users)
      for (const [index, scenario] of scenarios.entries()) {
        const saved = normalizePlanningDraft({
          version: 1,
          window,
          country: 'Nigeria',
          query: 'DEMO',
          format: '',
          budget: scenario.budget,
          currency: 'NGN',
          faces: scenario.boardKeys.map((key) => ({
            siteId: agencyDemoId(orgId, `site:${key}`),
            faceId: agencyDemoId(orgId, `face:${key}:1`),
            pricingCurrency: 'NGN',
          })),
        });
        const fingerprint = createHash('sha256')
          .update(JSON.stringify({ name: scenario.name, draft: saved }))
          .digest('hex');
        if (
          await insert(
            manager,
            `INSERT INTO personal_planning_drafts (id,organization_id,user_id,name,draft,revision,client_request_id,creation_fingerprint) VALUES ($1,$2,$3,$4,$5::jsonb,1,$6,$7)`,
            [
              user.draftIds[index],
              orgId,
              user.userId,
              scenario.name,
              JSON.stringify(saved),
              agencyDemoId(orgId, `request:${user.userId}:${scenario.key}`),
              fingerprint,
            ],
          )
        ) {
          report.inserted.drafts++;
          await audit(
            manager,
            orgId,
            user.draftIds[index]!,
            'planning.draft.created',
            'personal_planning_draft',
            user.userId,
          );
          report.inserted.audits++;
        }
      }
    return report;
  });
}

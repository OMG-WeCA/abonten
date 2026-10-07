import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { parseResearchProvenance, type ResearchProvenance } from '../common/research-inventory';

export const RESEARCH_AGENCY_ID = '11111111-0000-4000-8000-000000000002';
export const RESEARCH_AGENCY_NAME = 'mediaReach OMD Lagos';
export interface ResearchRecord {
  key: string;
  name: string;
  address: string;
  city: string;
  region: string;
  country: 'Nigeria';
  format: 'digital_led';
  latitude: number;
  longitude: number;
  width: number;
  height: number;
  provenance: ResearchProvenance;
}
export interface ResearchManifest {
  version: string;
  records: ResearchRecord[];
}
const text = (value: unknown, max = 200): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= max &&
  Array.from(value).every((character) => character.charCodeAt(0) >= 32);
export function parseResearchManifest(value: unknown): ResearchManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid research manifest');
  const input = value as Record<string, unknown>;
  if (
    !text(input.version, 80) ||
    !/^[a-z0-9-]+$/.test(input.version) ||
    !Array.isArray(input.records) ||
    !input.records.length ||
    input.records.length > 12 ||
    Object.keys(input).some((key) => !['version', 'records'].includes(key))
  )
    throw new Error('Invalid bounded research manifest');
  const records: ResearchRecord[] = input.records.map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      throw new Error('Invalid research record');
    const r = raw as Record<string, unknown>;
    if (
      Object.keys(r).sort().join(',') !==
        'address,city,country,format,height,key,latitude,longitude,name,provenance,region,width' ||
      !text(r.key, 80) ||
      !/^[a-z0-9-]+$/.test(r.key) ||
      !text(r.name) ||
      !text(r.address, 500) ||
      !text(r.city, 80) ||
      !text(r.region, 80) ||
      r.country !== 'Nigeria' ||
      r.format !== 'digital_led'
    )
      throw new Error('Invalid source record fields');
    if (
      typeof r.latitude !== 'number' ||
      !Number.isFinite(r.latitude) ||
      r.latitude < 4 ||
      r.latitude > 14 ||
      typeof r.longitude !== 'number' ||
      !Number.isFinite(r.longitude) ||
      r.longitude < 2.5 ||
      r.longitude > 15 ||
      typeof r.width !== 'number' ||
      !Number.isFinite(r.width) ||
      r.width <= 0 ||
      r.width > 200 ||
      typeof r.height !== 'number' ||
      !Number.isFinite(r.height) ||
      r.height <= 0 ||
      r.height > 200
    )
      throw new Error('Missing or implausible source coordinates/dimensions');
    return {
      key: r.key,
      name: r.name,
      address: r.address,
      city: r.city,
      region: r.region,
      country: r.country,
      format: r.format,
      latitude: r.latitude,
      longitude: r.longitude,
      width: r.width,
      height: r.height,
      provenance: parseResearchProvenance(r.provenance),
    };
  });
  if (
    new Set(records.map((r) => r.key)).size !== records.length ||
    new Set(records.map((r) => r.provenance.siteSourceUrl)).size !== records.length
  )
    throw new Error('Duplicate research source');
  return { version: input.version, records };
}
export function researchRecordId(key: string): string {
  const bytes = createHash('sha256')
    .update(`abonten-public-research-v1:${RESEARCH_AGENCY_ID}:${key}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
/** Additive dedicated import: never migrates, creates identities, rates, photos or plans. */
export async function importAgencyResearch(
  db: DataSource,
  options: { organizationId: string; expectedName: string; manifest: unknown; apply?: boolean },
) {
  if (
    options.organizationId !== RESEARCH_AGENCY_ID ||
    options.expectedName !== RESEARCH_AGENCY_NAME
  )
    throw new Error('Explicit verified agency required');
  const manifest = parseResearchManifest(options.manifest);
  return db.transaction(async (manager) => {
    const [org] = await manager.query(
      `SELECT id,name,type,status FROM organizations WHERE id = $1${options.apply ? ' FOR UPDATE' : ''}`,
      [options.organizationId],
    );
    if (
      !org ||
      org.name !== options.expectedName ||
      org.type !== 'agency' ||
      org.status !== 'active'
    )
      throw new Error('Verified active agency not found');
    const report = {
      applied: options.apply === true,
      version: manifest.version,
      organizationId: org.id,
      boards: [] as { id: string; faceId: string; name: string }[],
      inserted: { sites: 0, faces: 0, audits: 0 },
    };
    for (const record of manifest.records) {
      const id = researchRecordId(`site:${record.key}`),
        faceId = researchRecordId(`face:${record.key}`);
      report.boards.push({ id, faceId, name: record.name });
      const [existing] = await manager.query(
        'SELECT organization_id,research_agency_id,demo_agency_id,research_provenance,name,latitude,longitude,width,height,address FROM billboard_sites WHERE id = $1',
        [id],
      );
      const [face] = await manager.query(
        'SELECT site_id,bookable,width,height FROM site_faces WHERE id = $1',
        [faceId],
      );
      if (
        existing &&
        (existing.organization_id !== org.id ||
          existing.research_agency_id !== org.id ||
          existing.demo_agency_id ||
          JSON.stringify(parseResearchProvenance(existing.research_provenance)) !==
            JSON.stringify(record.provenance) ||
          existing.name !== record.name ||
          existing.latitude !== record.latitude ||
          existing.longitude !== record.longitude ||
          existing.width !== record.width ||
          existing.height !== record.height ||
          existing.address !== record.address)
      )
        throw new Error('Research identifier/source collision; existing records preserved');
      if (
        face &&
        (face.site_id !== id ||
          face.bookable ||
          face.width !== record.width ||
          face.height !== record.height)
      )
        throw new Error('Research face collision');
      if (!options.apply) continue;
      const insert = async (
        sql: string,
        params: unknown[],
        entityType: string,
        entityId: string,
      ) => {
        const rows = await manager.query(`${sql} ON CONFLICT (id) DO NOTHING RETURNING id`, params);
        if (!rows.length) return false;
        await manager.query(
          'INSERT INTO audit_logs (actor_user_id,actor_org_id,action,entity_type,entity_id,"after") VALUES (NULL,$1,$2,$3,$4,$5::json)',
          [
            org.id,
            'inventory.research.imported',
            entityType,
            entityId,
            JSON.stringify({
              researchReference: true,
              version: manifest.version,
              siteSourceUrl: record.provenance.siteSourceUrl,
              accessedAt: record.provenance.accessedAt,
            }),
          ],
        );
        report.inserted.audits++;
        return true;
      };
      if (
        await insert(
          `INSERT INTO billboard_sites (id,organization_id,research_agency_id,research_provenance,code,name,type,format,latitude,longitude,address,city,region,country,width,height,area,units,illumination_type,status) VALUES ($1,$2::text,$2::uuid,$3::jsonb,$4,$5,'billboard','digital_led',$6,$7,$8,$9,$10,'Nigeria',$11,$12,$13,'m','led','listed')`,
          [
            id,
            org.id,
            JSON.stringify(record.provenance),
            `RESEARCH-${record.key}`,
            record.name,
            record.latitude,
            record.longitude,
            record.address,
            record.city,
            record.region,
            record.width,
            record.height,
            record.width * record.height,
          ],
          'billboard_site',
          id,
        )
      )
        report.inserted.sites++;
      if (
        await insert(
          `INSERT INTO site_faces (id,site_id,face_label,width,height,area,units,bookable) VALUES ($1,$2,'Reported display',$3,$4,$5,'m',false)`,
          [faceId, id, record.width, record.height, record.width * record.height],
          'site_face',
          faceId,
        )
      )
        report.inserted.faces++;
    }
    return report;
  });
}

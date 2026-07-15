import { DataSource } from 'typeorm';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { IDS } from './seed-ids';

interface SiteSeed {
  id: string;
  code: string;
  name: string;
  type: string;
  format: string;
  latitude: number;
  longitude: number;
  country: string;
  city: string;
  illuminationType: string;
  status: string;
}

// All sites are owned by the media partner (Accra Outdoor Media). Realistic WeCA
// locations (lat/long), formats, illumination, and lifecycle statuses.
const SITES: SiteSeed[] = [
  { id: IDS.site.ikorodu, code: 'IKO-001', name: 'Ikorodu Road Mega', type: 'billboard', format: 'static', latitude: 6.6058, longitude: 3.3545, country: 'Nigeria', city: 'Lagos', illuminationType: 'front_lit', status: 'listed' },
  { id: IDS.site.lekkiepe, code: 'LEK-002', name: 'Lekki-Epe Expressway LED', type: 'billboard', format: 'digital_led', latitude: 6.4474, longitude: 3.5555, country: 'Nigeria', city: 'Lagos', illuminationType: 'led', status: 'listed' },
  { id: IDS.site.victoria, code: 'VIL-003', name: 'Victoria Island Spectacular', type: 'spectacular', format: '3d', latitude: 6.4281, longitude: 3.4219, country: 'Nigeria', city: 'Lagos', illuminationType: 'back_lit', status: 'pending_review' },
  { id: IDS.site.ikeja, code: 'IKE-004', name: 'Ikeja City Mall Gantry', type: 'billboard', format: 'static', latitude: 6.6018, longitude: 3.3515, country: 'Nigeria', city: 'Lagos', illuminationType: 'front_lit', status: 'listed' },
  { id: IDS.site.apapa, code: 'APO-005', name: 'Apapa-Oshodi Expressway', type: 'billboard', format: 'static', latitude: 6.4707, longitude: 3.3676, country: 'Nigeria', city: 'Lagos', illuminationType: 'edge_lit', status: 'draft' },
  { id: IDS.site.graphic, code: 'GRA-006', name: 'Graphic Road Billboard', type: 'billboard', format: 'static', latitude: 5.5597, longitude: -0.2179, country: 'Ghana', city: 'Accra', illuminationType: 'front_lit', status: 'listed' },
  { id: IDS.site.spintex, code: 'SPR-007', name: 'Spintex Road LED', type: 'billboard', format: 'digital_led', latitude: 5.6403, longitude: -0.0843, country: 'Ghana', city: 'Accra', illuminationType: 'led', status: 'listed' },
  { id: IDS.site.liberation, code: 'LIB-008', name: 'Liberation Road Gantry', type: 'billboard', format: 'static', latitude: 5.5731, longitude: -0.2437, country: 'Ghana', city: 'Accra', illuminationType: 'front_lit', status: 'listed' },
  { id: IDS.site.bliberte, code: 'BDL-009', name: 'Boulevard de la Liberte', type: 'billboard', format: 'static', latitude: 4.0511, longitude: 9.7678, country: 'Cameroon', city: 'Douala', illuminationType: 'back_lit', status: 'listed' },
  { id: IDS.site.akwa, code: 'AKW-010', name: 'Akwa Dual Carriageway', type: 'billboard', format: 'digital_led', latitude: 4.0463, longitude: 9.6961, country: 'Cameroon', city: 'Douala', illuminationType: 'led', status: 'draft' },
];

function geomSql(s: SiteSeed): string {
  // PostGIS Point(longitude latitude), SRID 4326 (WGS84).
  return `ST_SetSRID(ST_MakePoint(${s.longitude}, ${s.latitude}), 4326)`;
}

export async function seedBillboardSites(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(BillboardSiteEntity);
  for (const s of SITES) {
    const existing = await repo.findOne({ where: { code: s.code } });
    const fields = {
      name: s.name,
      type: s.type,
      format: s.format,
      country: s.country,
      illuminationType: s.illuminationType,
      status: s.status,
    };
    if (existing) {
      await repo
        .createQueryBuilder()
        .update(BillboardSiteEntity)
        .set({ ...fields, location: (() => geomSql(s)) as unknown as string })
        .where('id = :id', { id: existing.id })
        .execute();
    } else {
      await repo
        .createQueryBuilder()
        .insert()
        .into(BillboardSiteEntity)
        .values({
          id: s.id,
          code: s.code,
          organizationId: IDS.org.accraOutdoor,
          ...fields,
          location: (() => geomSql(s)) as unknown as string,
        })
        .execute();
    }
  }
  console.log(`  billboard sites: ${SITES.length}`);
}

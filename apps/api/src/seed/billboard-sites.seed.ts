import { DataSource } from 'typeorm';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { IDS } from './seed-ids';

interface SiteSeed {
  id: string;
  code: string;
  name: string;
  type: string;
  format: string;
  subFormat?: string;
  latitude: number;
  longitude: number;
  address?: string;
  city: string;
  region?: string;
  country: string;
  width: number;
  height: number;
  area: number;
  illuminationType: string;
  illuminationHours?: string;
  description?: string;
  status: string;
}

// All sites are owned by the media partner (Accra Outdoor Media). Realistic WeCA
// locations (lat/long), formats, illumination, dimensions, and lifecycle statuses.
const SITES: SiteSeed[] = [
  { id: IDS.site.ikorodu, code: 'IKO-001', name: 'Ikorodu Road Mega', type: 'billboard', format: 'static', latitude: 6.6058, longitude: 3.3545, address: 'Ikorodu Road', city: 'Lagos', region: 'Lagos State', country: 'Nigeria', width: 8, height: 3, area: 24, illuminationType: 'front_lit', illuminationHours: '18:00-06:00', description: 'High-traffic commuter corridor into Lagos mainland.', status: 'listed' },
  { id: IDS.site.lekkiepe, code: 'LEK-002', name: 'Lekki-Epe Expressway LED', type: 'billboard', format: 'digital_led', subFormat: 'led_screen', latitude: 6.4474, longitude: 3.5555, address: 'Lekki-Epe Expressway', city: 'Lagos', region: 'Lagos State', country: 'Nigeria', width: 12, height: 4, area: 48, illuminationType: 'led', illuminationHours: '24/7', description: 'Full-motion LED on the Lekki corridor.', status: 'listed' },
  { id: IDS.site.victoria, code: 'VIL-003', name: 'Victoria Island Spectacular', type: 'spectacular', format: '3d', latitude: 6.4281, longitude: 3.4219, address: 'Akin Adesola Street', city: 'Lagos', region: 'Lagos State', country: 'Nigeria', width: 10, height: 5, area: 50, illuminationType: 'back_lit', description: 'Premium 3D spectacular in the VI business district.', status: 'pending_review' },
  { id: IDS.site.ikeja, code: 'IKE-004', name: 'Ikeja City Mall Gantry', type: 'billboard', format: 'static', latitude: 6.6018, longitude: 3.3515, address: 'Alausa, Ikeja', city: 'Lagos', region: 'Lagos State', country: 'Nigeria', width: 6, height: 3, area: 18, illuminationType: 'front_lit', illuminationHours: '18:30-06:00', description: 'Gantry opposite Ikeja City Mall.', status: 'listed' },
  { id: IDS.site.apapa, code: 'APO-005', name: 'Apapa-Oshodi Expressway', type: 'billboard', format: 'static', latitude: 6.4707, longitude: 3.3676, address: 'Apapa-Oshodi Expressway', city: 'Lagos', region: 'Lagos State', country: 'Nigeria', width: 8, height: 3, area: 24, illuminationType: 'edge_lit', description: 'Port-bound freight corridor.', status: 'draft' },
  { id: IDS.site.graphic, code: 'GRA-006', name: 'Graphic Road Billboard', type: 'billboard', format: 'static', latitude: 5.5597, longitude: -0.2179, address: 'Graphic Road', city: 'Accra', region: 'Greater Accra', country: 'Ghana', width: 8, height: 3, area: 24, illuminationType: 'front_lit', illuminationHours: '18:00-06:00', description: 'Busy commercial road in Accra.', status: 'listed' },
  { id: IDS.site.spintex, code: 'SPR-007', name: 'Spintex Road LED', type: 'billboard', format: 'digital_led', subFormat: 'led_screen', latitude: 5.6403, longitude: -0.0843, address: 'Spintex Road', city: 'Accra', region: 'Greater Accra', country: 'Ghana', width: 10, height: 4, area: 40, illuminationType: 'led', illuminationHours: '24/7', description: 'LED on the Spintex corridor.', status: 'listed' },
  { id: IDS.site.liberation, code: 'LIB-008', name: 'Liberation Road Gantry', type: 'billboard', format: 'static', latitude: 5.5731, longitude: -0.2437, address: 'Liberation Road', city: 'Accra', region: 'Greater Accra', country: 'Ghana', width: 6, height: 3, area: 18, illuminationType: 'front_lit', description: 'Gantry on Liberation Road.', status: 'listed' },
  { id: IDS.site.bliberte, code: 'BDL-009', name: 'Boulevard de la Liberte', type: 'billboard', format: 'static', latitude: 4.0511, longitude: 9.7678, address: 'Boulevard de la Liberté', city: 'Douala', region: 'Littoral', country: 'Cameroon', width: 8, height: 3, area: 24, illuminationType: 'back_lit', illuminationHours: '18:30-06:00', description: 'Central Douala boulevard.', status: 'listed' },
  { id: IDS.site.akwa, code: 'AKW-010', name: 'Akwa Dual Carriageway', type: 'billboard', format: 'digital_led', subFormat: 'led_screen', latitude: 4.0463, longitude: 9.6961, address: 'Akwa Dual Carriageway', city: 'Douala', region: 'Littoral', country: 'Cameroon', width: 12, height: 4, area: 48, illuminationType: 'led', illuminationHours: '24/7', description: 'LED on Douala’s Akwa dual carriageway.', status: 'draft' },
];

const CURRENCY_BY_COUNTRY: Record<string, string> = {
  Nigeria: 'NGN',
  Ghana: 'GHS',
  Cameroon: 'XAF',
};

export function siteCurrency(country: string): string {
  return CURRENCY_BY_COUNTRY[country] ?? 'NGN';
}

// Upsert by deterministic id, writing latitude/longitude as float columns
// (works on any Postgres, including the no-PostGIS disposable service).
export async function seedBillboardSites(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(BillboardSiteEntity);
  for (const s of SITES) {
    const params: unknown[] = [
      s.id, IDS.org.accraOutdoor, s.code, s.name, s.type, s.format,
      s.subFormat ?? null, s.latitude, s.longitude, s.address ?? null, s.city,
      s.region ?? null, s.country, s.width, s.height, s.area, 'm',
      s.illuminationType, s.illuminationHours ?? null, s.description ?? null, s.status,
    ];
    await repo.query(
      `INSERT INTO billboard_sites
        (id, organization_id, code, name, type, format, sub_format, latitude, longitude, address, city, region, country, width, height, area, units, illumination_type, illumination_hours, description, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,now(),now())
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, type=EXCLUDED.type, format=EXCLUDED.format, sub_format=EXCLUDED.sub_format,
         latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, address=EXCLUDED.address, city=EXCLUDED.city, region=EXCLUDED.region,
         country=EXCLUDED.country, width=EXCLUDED.width, height=EXCLUDED.height, area=EXCLUDED.area,
         units=EXCLUDED.units, illumination_type=EXCLUDED.illumination_type, illumination_hours=EXCLUDED.illumination_hours,
         description=EXCLUDED.description, status=EXCLUDED.status, updated_at=now()`,
      params,
    );
  }
  console.log(`  billboard sites: ${SITES.length}`);
}
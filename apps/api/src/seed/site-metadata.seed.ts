import { DataSource } from 'typeorm';
import { SiteMetadataEntity } from '../common/entities/site-metadata.entity';
import { IDS } from './seed-ids';

const M = '77777777-0000-4000-8000-';
const METADATA = [
  {
    id: M + '000000000001',
    siteId: IDS.site.ikorodu,
    dimension: 'traffic',
    payload: { aadt: 85000, peakHourVehicles: 9000, source: 'LAMATA 2025', vintage: '2025-03' },
    source: 'LAMATA',
    method: 'count',
    confidence: 0.8,
    collectedAt: new Date('2025-03-15T00:00:00Z'),
    expiresAt: new Date('2026-03-15T00:00:00Z'),
  },
  {
    id: M + '000000000002',
    siteId: IDS.site.lekkiepe,
    dimension: 'visibility',
    payload: { score: 88, sightline: 'unobstructed', averageDwellSeconds: 6 },
    source: 'field-survey',
    method: 'observation',
    confidence: 0.7,
    collectedAt: new Date('2025-05-01T00:00:00Z'),
    expiresAt: new Date('2026-05-01T00:00:00Z'),
  },
  {
    id: M + '000000000003',
    siteId: IDS.site.graphic,
    dimension: 'audience',
    payload: { demographics: { age25to44: 0.45, secAB: 0.6 }, source: 'GSS estimate' },
    source: 'GSS',
    method: 'model',
    confidence: 0.6,
    collectedAt: new Date('2025-01-20T00:00:00Z'),
    expiresAt: new Date('2026-01-20T00:00:00Z'),
  },
  {
    id: M + '000000000004',
    siteId: IDS.site.spintex,
    dimension: 'poi',
    payload: { nearby: ['Accra Mall', 'Tema Motorway Interchange'], nearestDistanceMeters: 300 },
    source: 'osm',
    method: 'geocode',
    confidence: 0.9,
    collectedAt: new Date('2025-06-10T00:00:00Z'),
    expiresAt: new Date('2026-06-10T00:00:00Z'),
  },
  {
    id: M + '000000000005',
    siteId: IDS.site.lekkiepe,
    dimension: 'traffic',
    payload: { aadt: 62000, peakHourVehicles: 6500, source: 'LAMATA 2025', vintage: '2025-03' },
    source: 'LAMATA',
    method: 'count',
    confidence: 0.8,
    collectedAt: new Date('2025-03-15T00:00:00Z'),
    expiresAt: new Date('2026-03-15T00:00:00Z'),
  },
  {
    id: M + '000000000006',
    siteId: IDS.site.ikeja,
    dimension: 'traffic',
    payload: { aadt: 54000, peakHourVehicles: 5800, source: 'LAMATA 2025', vintage: '2025-03' },
    source: 'LAMATA',
    method: 'count',
    confidence: 0.75,
    collectedAt: new Date('2025-03-15T00:00:00Z'),
    expiresAt: new Date('2026-03-15T00:00:00Z'),
  },
  {
    id: M + '000000000007',
    siteId: IDS.site.bliberte,
    dimension: 'visibility',
    payload: { score: 82, sightline: 'mostly_unobstructed', averageDwellSeconds: 5 },
    source: 'field-survey',
    method: 'observation',
    confidence: 0.7,
    collectedAt: new Date('2025-05-01T00:00:00Z'),
    expiresAt: new Date('2026-05-01T00:00:00Z'),
  },
  {
    id: M + '000000000008',
    siteId: IDS.site.bliberte,
    dimension: 'poi',
    payload: { nearby: ['Bonanjo commercial district', 'Akwa Market'], nearestDistanceMeters: 450 },
    source: 'osm',
    method: 'geocode',
    confidence: 0.85,
    collectedAt: new Date('2025-06-01T00:00:00Z'),
    expiresAt: new Date('2026-06-01T00:00:00Z'),
  },
  {
    id: M + '000000000009',
    siteId: IDS.site.ikorodu,
    dimension: 'audience',
    payload: { demographics: { age18to34: 0.55, secABC1: 0.5 }, source: 'LAMATA panel' },
    source: 'LAMATA',
    method: 'model',
    confidence: 0.6,
    collectedAt: new Date('2025-02-01T00:00:00Z'),
    expiresAt: new Date('2026-02-01T00:00:00Z'),
  },
  {
    id: M + '00000000000a',
    siteId: IDS.site.liberation,
    dimension: 'audience',
    payload: { demographics: { age25to44: 0.5, secAB: 0.55 }, source: 'GSS estimate' },
    source: 'GSS',
    method: 'model',
    confidence: 0.6,
    collectedAt: new Date('2025-01-20T00:00:00Z'),
    expiresAt: new Date('2026-01-20T00:00:00Z'),
  },
];

export async function seedSiteMetadata(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(SiteMetadataEntity);
  for (const m of METADATA) {
    // Seeded enrichment is demo showcase data (execution plan §1.4.1): the
    // enforceable data class keeps it out of production reads/model inputs.
    await repo.save(repo.create({ ...m, dataClass: 'demo', verification: 'unverified' }));
  }
  console.log(`  site metadata: ${METADATA.length}`);
}

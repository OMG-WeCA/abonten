import { DataSource } from 'typeorm';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { IDS } from './seed-ids';

// Reference photos for several sites. Placeholder image URLs (Picsum) so the
// frontend can render them without local files; swap for real storage refs later.
const ASSETS = [
  { id: IDS.asset.ikoroduFront, siteId: IDS.site.ikorodu, kind: 'front', ref: 'https://picsum.photos/seed/ikorodu-front/800/600', capturedAt: new Date('2025-04-01T09:00:00Z') },
  { id: IDS.asset.ikoroduContext, siteId: IDS.site.ikorodu, kind: 'context', ref: 'https://picsum.photos/seed/ikorodu-context/800/600', capturedAt: new Date('2025-04-01T09:05:00Z') },
  { id: IDS.asset.lekkiepeFront, siteId: IDS.site.lekkiepe, kind: 'front', ref: 'https://picsum.photos/seed/lekkiepe-front/800/600', capturedAt: new Date('2025-04-02T10:00:00Z') },
  { id: IDS.asset.graphicFront, siteId: IDS.site.graphic, kind: 'front', ref: 'https://picsum.photos/seed/graphic-front/800/600', capturedAt: new Date('2025-03-20T08:30:00Z') },
  { id: IDS.asset.spintexFront, siteId: IDS.site.spintex, kind: 'front', ref: 'https://picsum.photos/seed/spintex-front/800/600', capturedAt: new Date('2025-03-21T11:00:00Z') },
  { id: IDS.asset.bliberteFront, siteId: IDS.site.bliberte, kind: 'front', ref: 'https://picsum.photos/seed/bliberte-front/800/600', capturedAt: new Date('2025-05-05T15:00:00Z') },
  { id: IDS.asset.bliberteNight, siteId: IDS.site.bliberte, kind: 'night', ref: 'https://picsum.photos/seed/bliberte-night/800/600', capturedAt: new Date('2025-05-05T20:00:00Z') },
];

export async function seedSiteAssets(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(SiteAssetEntity);
  for (const a of ASSETS) {
    await repo.save(repo.create({ id: a.id, siteId: a.siteId, kind: a.kind, storageRef: a.ref, capturedAt: a.capturedAt }));
  }
  console.log(`  site assets: ${ASSETS.length}`);
}
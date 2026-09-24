import { DataSource } from 'typeorm';
import { FaceBlackoutEntity } from '../common/entities/face-blackout.entity';
import { IDS } from './seed-ids';

/** A clearly labelled sample on a rejected, nonbookable seed face. */
export async function seedFaceBlackouts(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(FaceBlackoutEntity);
  await repo.save(repo.create({
    id: IDS.blackout.sampleMaintenance,
    faceId: '66666666-0000-4000-8000-000000000007',
    organizationId: IDS.org.accraOutdoor,
    startDate: '2027-01-10',
    endDate: '2027-01-13',
    reason: 'Sample: planned maintenance',
  }));
  console.log('  face blackouts: 1 sample');
}

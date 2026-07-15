import { DataSource } from 'typeorm';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { IDS } from './seed-ids';

const OV = '55555555-0000-4000-8000-';
const OVERRIDES = [
  // Grant the field_operator an extra REPORT_VIEW capability (beyond her role defaults).
  {
    id: OV + '000000000001',
    userId: IDS.user.akosua,
    organizationId: IDS.org.accraOutdoor,
    capability: 'REPORT_VIEW',
    action: 'grant' as const,
    createdBy: IDS.user.ama,
  },
  // Revoke INVENTORY_DELETE from the inventory_manager (fine-grained reduction).
  {
    id: OV + '000000000002',
    userId: IDS.user.kwame,
    organizationId: IDS.org.accraOutdoor,
    capability: 'INVENTORY_DELETE',
    action: 'revoke' as const,
    createdBy: IDS.user.ama,
  },
];

export async function seedCapabilityOverrides(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(UserCapabilityOverrideEntity);
  for (const o of OVERRIDES) {
    await repo.save(repo.create(o));
  }
  console.log(`  capability overrides: ${OVERRIDES.length}`);
}

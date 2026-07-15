import { DataSource } from 'typeorm';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { IDS } from './seed-ids';

const MEM = '44444444-0000-4000-8000-';
const MEMBERSHIPS = [
  { id: MEM + '000000000001', userId: IDS.user.ama, organizationId: IDS.org.accraOutdoor, role: 'org_owner', status: 'active' },
  { id: MEM + '000000000002', userId: IDS.user.kwame, organizationId: IDS.org.accraOutdoor, role: 'inventory_manager', status: 'active' },
  { id: MEM + '000000000003', userId: IDS.user.akosua, organizationId: IDS.org.accraOutdoor, role: 'field_operator', status: 'active' },
  { id: MEM + '000000000004', userId: IDS.user.chidi, organizationId: IDS.org.mediareach, role: 'org_owner', status: 'active' },
  { id: MEM + '000000000005', userId: IDS.user.aisha, organizationId: IDS.org.mediareach, role: 'planner', status: 'active' },
  { id: MEM + '000000000006', userId: IDS.user.emeka, organizationId: IDS.org.mediareach, role: 'planner_admin', status: 'active' },
  { id: MEM + '000000000007', userId: IDS.user.funke, organizationId: IDS.org.unilever, role: 'org_owner', status: 'active' },
  { id: MEM + '000000000008', userId: IDS.user.tunde, organizationId: IDS.org.unilever, role: 'client_admin', status: 'active' },
  { id: MEM + '000000000009', userId: IDS.user.ngozi, organizationId: IDS.org.unilever, role: 'client_viewer', status: 'active' },
  { id: MEM + '00000000000a', userId: IDS.user.seyi, organizationId: IDS.org.omgWeca, role: 'org_owner', status: 'active' },
  { id: MEM + '00000000000b', userId: IDS.user.adaora, organizationId: IDS.org.omgWeca, role: 'platform_admin', status: 'active' },
];

export async function seedMemberships(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(MembershipEntity);
  for (const m of MEMBERSHIPS) {
    await repo.save(repo.create(m));
  }
  console.log(`  memberships: ${MEMBERSHIPS.length}`);
}

import { DataSource } from 'typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { IDS } from './seed-ids';

const USERS = [
  { id: IDS.user.ama, email: 'ama@accraoutdoor.com', name: 'Ama Mensah', status: 'active' },
  { id: IDS.user.kwame, email: 'kwame@accraoutdoor.com', name: 'Kwame Boateng', status: 'active' },
  { id: IDS.user.akosua, email: 'akosua@accraoutdoor.com', name: 'Akosua Asante', status: 'active' },
  { id: IDS.user.chidi, email: 'chidi@mediareach.com', name: 'Chidi Okafor', status: 'active' },
  { id: IDS.user.aisha, email: 'aisha@mediareach.com', name: 'Aisha Bello', status: 'active' },
  { id: IDS.user.emeka, email: 'emeka@mediareach.com', name: 'Emeka Nwosu', status: 'active' },
  { id: IDS.user.funke, email: 'funke@unilever.com', name: 'Funke Ogundipe', status: 'active' },
  { id: IDS.user.tunde, email: 'tunde@unilever.com', name: 'Tunde Adeyemi', status: 'active' },
  { id: IDS.user.ngozi, email: 'ngozi@unilever.com', name: 'Ngozi Eze', status: 'active' },
  { id: IDS.user.seyi, email: 'seyi@omg-weca.com', name: 'Seyi Olatunji', status: 'active' },
  { id: IDS.user.adaora, email: 'adaora@omg-weca.com', name: 'Adaora Obi', status: 'active' },
  { id: IDS.user.yaw, email: 'yaw@accraoutdoor.com', name: 'Yaw Mensah', status: 'active' },
];

export async function seedUsers(ds: DataSource): Promise<void> {
  const repo = ds.getRepository(UserEntity);
  for (const u of USERS) {
    await repo.save(repo.create(u));
  }
  console.log(`  users: ${USERS.length}`);
}

export const SEED_USER_EMAILS = USERS.map((u) => u.email);

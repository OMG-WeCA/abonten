import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ENTITIES } from './common/entities';
import { InitSchema1720000000000 } from './migrations/1720000000000-InitSchema';
import { RemediateNonPlatformPlatformAdmin1720000000001 } from './migrations/1720000000001-RemediateNonPlatformPlatformAdmin';

// DataSource used by the migration CLI / `pnpm migration:run|revert|generate`.
// The runtime app uses DatabaseModule's lazy DataSource (synchronize: false); this
// standalone DataSource is for schema management only. Connects on .initialize().
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgresql://abonten:abonten@localhost:5432/abonten',
  synchronize: false,
  entities: ENTITIES,
  migrations: [InitSchema1720000000000, RemediateNonPlatformPlatformAdmin1720000000001],
  migrationsRun: false,
  logging: ['error', 'migration'],
});

export default AppDataSource;
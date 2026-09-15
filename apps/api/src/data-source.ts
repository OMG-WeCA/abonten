import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ENTITIES } from './common/entities';
import { InitSchema1720000000000 } from './migrations/1720000000000-InitSchema';
import { RemediateNonPlatformPlatformAdmin1720000000001 } from './migrations/1720000000001-RemediateNonPlatformPlatformAdmin';
import { CanonicalizeUserIdentity1720000000002 } from './migrations/1720000000002-CanonicalizeUserIdentity';
import { AccountFoundations1720000000003 } from './migrations/1720000000003-AccountFoundations';
import { RefreshTokenFamilies1720000000004 } from './migrations/1720000000004-RefreshTokenFamilies';
import { OnboardingIdempotency1720000000005 } from './migrations/1720000000005-OnboardingIdempotency';
import { BillboardSiteClientRequestId1720000000006 } from './migrations/1720000000006-BillboardSiteClientRequestId';

// DataSource used by the migration CLI / `pnpm migration:run|revert|generate`.
// The runtime app uses DatabaseModule's lazy, migration-only DataSource with
// synchronize disabled in every environment; this standalone DataSource is for
// schema management only. Connects on .initialize().
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgresql://abonten:abonten@localhost:5432/abonten',
  synchronize: false,
  entities: ENTITIES,
  migrations: [
    InitSchema1720000000000,
    RemediateNonPlatformPlatformAdmin1720000000001,
    CanonicalizeUserIdentity1720000000002,
    AccountFoundations1720000000003,
    RefreshTokenFamilies1720000000004,
    OnboardingIdempotency1720000000005,
    BillboardSiteClientRequestId1720000000006,
  ],
  migrationsRun: false,
  logging: ['error', 'migration'],
});

export default AppDataSource;

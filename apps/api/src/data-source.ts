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
import { PartOneInventoryTrust1720000000007 } from './migrations/1720000000007-PartOneInventoryTrust';
import { PartnerAvailability1720000000008 } from './migrations/1720000000008-PartnerAvailability';
import { GeographicContext1720000000009 } from './migrations/1720000000009-GeographicContext';
import { SiteLocationVerification1760000001000 } from './migrations/1760000001000-SiteLocationVerification';
import { InventoryMediaEvidence1760000002000 } from './migrations/1760000002000-InventoryMediaEvidence';
import { PartnerTermsAcceptance1760000003000 } from './migrations/1760000003000-PartnerTermsAcceptance';
import { PersonalPlanningDrafts1760000004000 } from './migrations/1760000004000-PersonalPlanningDrafts';
import { AgencyDemoInventoryScope1760000005000 } from './migrations/1760000005000-AgencyDemoInventoryScope';

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
    PartOneInventoryTrust1720000000007,
    PartnerAvailability1720000000008,
    GeographicContext1720000000009,
    SiteLocationVerification1760000001000,
    InventoryMediaEvidence1760000002000,
    PartnerTermsAcceptance1760000003000,
    PersonalPlanningDrafts1760000004000,
    AgencyDemoInventoryScope1760000005000,
  ],
  migrationsRun: false,
  logging: ['error', 'migration'],
});

export default AppDataSource;

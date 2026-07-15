import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { SiteMetadataEntity } from '../common/entities/site-metadata.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { seedBillboardSites } from './billboard-sites.seed';
import { seedCapabilityOverrides } from './capability-overrides.seed';
import { seedMemberships } from './memberships.seed';
import { seedOrganizations } from './organizations.seed';
import { seedSiteFaces } from './site-faces.seed';
import { seedSiteMetadata } from './site-metadata.seed';
import { seedUsers } from './users.seed';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgresql://abonten:abonten@localhost:5432/abonten';
  console.log(`Abonten seed: connecting to ${url}`);
  const ds = new DataSource({
    type: 'postgres',
    url,
    // Dev seed tooling: synchronize creates/alters tables from entities so the seed
    // works on a fresh docker-compose DB. The app's runtime DataSource stays synchronize:false.
    synchronize: true,
    entities: [
      OrganizationEntity,
      BillboardSiteEntity,
      SiteFaceEntity,
      SiteMetadataEntity,
      UserEntity,
      MembershipEntity,
      UserCapabilityOverrideEntity,
      RefreshTokenEntity,
    ],
  });

  try {
    await ds.initialize();
  } catch (err) {
    console.error('Abonten seed: could not connect to the database.');
    console.error('Is the dev DB running? Try: docker compose up -d');
    console.error(`DATABASE_URL = ${url}`);
    console.error('Error:', (err as Error).message ?? err);
    process.exit(1);
  }

  try {
    console.log('Seeding...');
    // Dependency order: orgs -> users -> memberships -> overrides -> sites -> faces -> metadata.
    await seedOrganizations(ds);
    await seedUsers(ds);
    await seedMemberships(ds);
    await seedCapabilityOverrides(ds);
    await seedBillboardSites(ds);
    await seedSiteFaces(ds);
    await seedSiteMetadata(ds);
    console.log('Seed complete.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await ds.destroy();
  }
}

void main();

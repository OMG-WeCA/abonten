import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { seedBillboardSites } from './billboard-sites.seed';
import { seedCapabilityOverrides } from './capability-overrides.seed';
import { seedMemberships } from './memberships.seed';
import { seedOrganizations } from './organizations.seed';
import { seedSiteFaces } from './site-faces.seed';
import { seedSiteMetadata } from './site-metadata.seed';
import { seedUsers } from './users.seed';

// `pnpm seed` = apply migrations + upsert all seed data. Using the migration
// DataSource (synchronize: false) means a fresh `docker compose up -d && pnpm seed`
// creates the schema via versioned migrations and then populates it — no
// synchronize:true drift. Seeders upsert by deterministic id so re-runs are safe.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgresql://abonten:abonten@localhost:5432/abonten';
  console.log(`Abonten seed: connecting to ${url}`);

  try {
    await AppDataSource.initialize();
  } catch (err) {
    console.error('Abonten seed: could not connect to the database.');
    console.error('Is the dev DB running? Try: docker compose up -d');
    console.error(`DATABASE_URL = ${url}`);
    console.error('Error:', (err as Error).message ?? err);
    process.exit(1);
  }

  try {
    console.log('Running migrations...');
    await AppDataSource.runMigrations();
    console.log('Seeding...');
    // Dependency order: orgs -> users -> memberships -> overrides -> sites -> faces -> metadata.
    await seedOrganizations(AppDataSource);
    await seedUsers(AppDataSource);
    await seedMemberships(AppDataSource);
    await seedCapabilityOverrides(AppDataSource);
    await seedBillboardSites(AppDataSource);
    await seedSiteFaces(AppDataSource);
    await seedSiteMetadata(AppDataSource);
    console.log('Seed complete.');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

void main();
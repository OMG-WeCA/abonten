import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { seedBillboardSites } from './billboard-sites.seed';
import { seedCapabilityOverrides } from './capability-overrides.seed';
import { seedMarkets } from './markets.seed';
import { seedMemberships } from './memberships.seed';
import { seedOrganizations } from './organizations.seed';
import { seedRateCards } from './rate-cards.seed';
import { seedSiteAssets } from './site-assets.seed';
import { seedSiteFaces } from './site-faces.seed';
import { seedFaceBlackouts } from './face-blackouts.seed';
import { seedSiteMetadata } from './site-metadata.seed';
import { seedUsers } from './users.seed';
import { seedEnrichment } from './enrichment.seed';
import { describeDatabaseEndpoint, sanitizeDatabaseError } from './database-log-sanitizer';

// `pnpm seed` = apply migrations + upsert all seed data. Using the migration
// DataSource (synchronize: false) means a fresh `docker compose up -d --wait && pnpm seed`
// creates the schema via versioned migrations and then populates it — no
// synchronize:true drift. Seeders upsert by deterministic id so re-runs are safe.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? 'postgresql://abonten:abonten@localhost:5432/abonten';
  const endpoint = describeDatabaseEndpoint(url);
  console.log(`Abonten seed: connecting to ${endpoint}`);

  try {
    await AppDataSource.initialize();
  } catch (err) {
    console.error(`Abonten seed: could not connect to ${endpoint}.`);
    console.error('Is the dev DB ready? Try: docker compose up -d --wait');
    console.error('Error:', sanitizeDatabaseError(err, url));
    process.exit(1);
  }

  try {
    console.log('Running migrations...');
    await AppDataSource.runMigrations();
    console.log('Seeding...');
    // Dependency order: orgs -> users -> memberships -> overrides -> markets
    // -> sites -> faces -> metadata.
    await seedOrganizations(AppDataSource);
    await seedMarkets(AppDataSource);
    await seedUsers(AppDataSource);
    await seedMemberships(AppDataSource);
    await seedCapabilityOverrides(AppDataSource);
    await seedBillboardSites(AppDataSource);
    await seedSiteFaces(AppDataSource);
    await seedFaceBlackouts(AppDataSource);
    await seedSiteMetadata(AppDataSource);
    await seedRateCards(AppDataSource);
    await seedSiteAssets(AppDataSource);
    await seedEnrichment(AppDataSource);
    console.log('Seed complete.');
  } catch (err) {
    console.error(`Seed failed for ${endpoint}:`, sanitizeDatabaseError(err, url));
    process.exit(1);
  } finally {
    await AppDataSource.destroy();
  }
}

void main();

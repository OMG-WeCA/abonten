import 'reflect-metadata';
import { AppDataSource } from '../data-source';
import { DataSource } from 'typeorm';
import { seedAgencyDemo } from './agency-demo.seed';

async function main() {
  const args = process.argv.slice(2);
  const organizationId =
    args.find((value) => value.startsWith('--org-id='))?.slice('--org-id='.length) ?? '';
  const expectedName =
    args.find((value) => value.startsWith('--expected-name='))?.slice('--expected-name='.length) ??
    '';
  if (
    !process.env.DATABASE_URL ||
    args.some(
      (value) =>
        value !== '--apply' &&
        !value.startsWith('--org-id=') &&
        !value.startsWith('--expected-name='),
    )
  )
    throw new Error(
      'Provide DATABASE_URL, --org-id=<verified UUID>, --expected-name=<exact DB name>, and optionally --apply. Dry-run is the default.',
    );
  const db = new DataSource({ ...AppDataSource.options, logging: false });
  await db.initialize();
  try {
    console.log(
      JSON.stringify(
        await seedAgencyDemo(db, { organizationId, expectedName, apply: args.includes('--apply') }),
        null,
        2,
      ),
    );
  } finally {
    await db.destroy();
  }
}
void main().catch(() => {
  // Never print driver queries/parameters, connection credentials or user data.
  console.error(
    'Agency demo seed stopped. Verify the explicit target, active planning members, migrations, quota and scoped identifier collisions. Existing data has not been overwritten.',
  );
  process.exitCode = 1;
});

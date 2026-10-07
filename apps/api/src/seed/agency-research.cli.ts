import 'reflect-metadata';
import { readFileSync, statSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { importAgencyResearch } from './agency-research.import';
async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';
  if (
    !process.env.DATABASE_URL ||
    args.some(
      (arg) =>
        arg !== '--apply' &&
        !['org-id', 'expected-name', 'manifest'].some((name) => arg.startsWith(`--${name}=`)),
    ) ||
    ['org-id', 'expected-name', 'manifest'].some(
      (name) => args.filter((arg) => arg.startsWith(`--${name}=`)).length !== 1,
    )
  )
    throw new Error('Explicit DB, agency and manifest required');
  const path = value('manifest');
  if (statSync(path).size > 128 * 1024) throw new Error('Manifest too large');
  const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const db = new DataSource({ ...AppDataSource.options, logging: false });
  await db.initialize();
  try {
    console.log(
      JSON.stringify(
        await importAgencyResearch(db, {
          organizationId: value('org-id'),
          expectedName: value('expected-name'),
          manifest,
          apply: args.includes('--apply'),
        }),
        null,
        2,
      ),
    );
  } finally {
    await db.destroy();
  }
}
void main().catch(() => {
  console.error(
    'Research import stopped. Verify the exact active agency, bounded source manifest, migrations and collision checks. Existing records were not overwritten.',
  );
  process.exitCode = 1;
});

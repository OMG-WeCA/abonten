import 'reflect-metadata';
import { AppDataSource } from './data-source';

// Programmatic migration runner for `pnpm migration:run` / `migration:revert`.
// Avoids depending on the TypeORM CLI's ts-node wrapper. Applies pending
// migrations (or reverts the last one) against DATABASE_URL.
async function main(): Promise<void> {
  const cmd = process.argv[2] ?? 'run';
  await AppDataSource.initialize();
  try {
    if (cmd === 'revert') {
      await AppDataSource.undoLastMigration();
      console.log('Reverted last migration.');
    } else {
      await AppDataSource.runMigrations();
      console.log('Migrations applied.');
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
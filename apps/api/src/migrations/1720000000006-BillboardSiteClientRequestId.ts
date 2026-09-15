import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotent site creation (SPEC §7.1): partners retrying an ambiguous
 * POST /sites (timeout, dropped mobile connection) must not create duplicate
 * drafts. The client sends a stable operation id; a repeat POST with the same
 * id replays the original row, and the partial unique index makes concurrent
 * duplicates impossible at the database level.
 */
export class BillboardSiteClientRequestId1720000000006 implements MigrationInterface {
  name = 'BillboardSiteClientRequestId1720000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billboard_sites" ADD COLUMN IF NOT EXISTS "client_request_id" varchar`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_billboard_sites_client_request"
       ON "billboard_sites" ("organization_id", "client_request_id")
       WHERE "client_request_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_billboard_sites_client_request"`);
    await queryRunner.query(
      `ALTER TABLE "billboard_sites" DROP COLUMN IF EXISTS "client_request_id"`,
    );
  }
}
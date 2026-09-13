import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bind refresh tokens to a revocable browser-session family and to the user's
 * session version. This keeps logout/global revocation authoritative when token
 * rotation and revocation arrive concurrently.
 */
export class RefreshTokenFamilies1720000000004 implements MigrationInterface {
  name = 'RefreshTokenFamilies1720000000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "family_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `UPDATE "refresh_tokens" SET "family_id" = "id" WHERE "family_id" IS NULL`,
    );
    await queryRunner.query(`
      UPDATE "refresh_tokens" AS token
      SET "session_version" = "user"."session_version"
      FROM "users" AS "user"
      WHERE token."user_id" = "user"."id"::text
    `);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_family_active" ON "refresh_tokens" ("family_id", "revoked_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_family_active"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "session_version"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "family_id"`);
  }
}

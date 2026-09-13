import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Account foundations: persisted presentation/preferences, profile-image metadata,
 * session-version invalidation, and non-secret session metadata. Existing monetary
 * records are deliberately untouched; organization currency remains a default only.
 */
export class AccountFoundations1720000000003 implements MigrationInterface {
  name = 'AccountFoundations1720000000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" varchar NOT NULL DEFAULT 'Africa/Lagos'`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_ref" varchar`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_content_type" varchar`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "user_agent" varchar`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ip" varchar`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user_active" ON "refresh_tokens" ("user_id", "revoked_at")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_refresh_tokens_user_active"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "ip"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "user_agent"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "session_version"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_content_type"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_ref"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "timezone"`);
  }
}

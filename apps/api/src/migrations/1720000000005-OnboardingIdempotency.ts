import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Persist onboarding organization requests so retries resolve the first committed result. */
export class OnboardingIdempotency1720000000005 implements MigrationInterface {
  name = 'OnboardingIdempotency1720000000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organization_creation_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" uuid NOT NULL,
        "idempotency_key" uuid NOT NULL,
        "organization_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_org_creation_user_key"
      ON "organization_creation_requests" ("user_id", "idempotency_key")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_org_creation_user_key"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organization_creation_requests"`);
  }
}

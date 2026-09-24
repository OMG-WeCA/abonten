import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Part 1 inventory trust (docs/inventory-product-execution.md §1.4.1, §1.3):
 * additive, data-preserving columns only.
 *
 * - site_metadata.data_class     — enforceable demo/production semantics.
 *   Only the ten deterministic seed records are stamped 'demo'. Existing
 *   partner records keep the 'production' default rather than being hidden.
 *   The seed file also stamps its own rows 'demo' on upsert.
 * - site_metadata.verification   — evidence level for later-phase filtering
 *   (SPEC §5.1 trust contract item 4). Existing rows default 'unverified'.
 * - site_faces digital attributes— first-class DOOH fields (SPEC §5.1 item 2).
 */
export class PartOneInventoryTrust1720000000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "site_metadata" ADD COLUMN IF NOT EXISTS "data_class" varchar NOT NULL DEFAULT 'production'`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_metadata" ADD COLUMN IF NOT EXISTS "verification" varchar NOT NULL DEFAULT 'unverified'`,
    );
    // Seed IDs are stable across installations. Do not infer that every
    // pre-migration row is seed content: partners may have added real records.
    await queryRunner.query(
      `UPDATE "site_metadata"
       SET "data_class" = 'demo'
       WHERE "id" = ANY($1::uuid[])`,
      [
        Array.from(
          { length: 10 },
          (_, index) => `77777777-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`,
        ),
      ],
    );
    await queryRunner.query(
      `ALTER TABLE "site_faces" ADD COLUMN IF NOT EXISTS "pixel_width" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_faces" ADD COLUMN IF NOT EXISTS "pixel_height" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_faces" ADD COLUMN IF NOT EXISTS "spot_length_seconds" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_faces" ADD COLUMN IF NOT EXISTS "loop_length_seconds" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_faces" ADD COLUMN IF NOT EXISTS "spots_per_loop" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "site_faces" ADD COLUMN IF NOT EXISTS "proof_of_play" boolean`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "site_faces" DROP COLUMN IF EXISTS "proof_of_play"`);
    await queryRunner.query(`ALTER TABLE "site_faces" DROP COLUMN IF EXISTS "spots_per_loop"`);
    await queryRunner.query(`ALTER TABLE "site_faces" DROP COLUMN IF EXISTS "loop_length_seconds"`);
    await queryRunner.query(`ALTER TABLE "site_faces" DROP COLUMN IF EXISTS "spot_length_seconds"`);
    await queryRunner.query(`ALTER TABLE "site_faces" DROP COLUMN IF EXISTS "pixel_height"`);
    await queryRunner.query(`ALTER TABLE "site_faces" DROP COLUMN IF EXISTS "pixel_width"`);
    await queryRunner.query(`ALTER TABLE "site_metadata" DROP COLUMN IF EXISTS "verification"`);
    await queryRunner.query(`ALTER TABLE "site_metadata" DROP COLUMN IF EXISTS "data_class"`);
  }
}

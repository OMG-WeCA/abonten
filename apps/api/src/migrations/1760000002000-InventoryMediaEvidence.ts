import { MigrationInterface, QueryRunner } from 'typeorm';

/** Additive media provenance. Legacy photos remain unknown; upload date is
 * deliberately not backfilled as capture date or independent verification. */
export class InventoryMediaEvidence1760000002000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE site_assets
      ADD COLUMN media_type varchar NOT NULL DEFAULT 'image',
      ADD COLUMN content_type varchar,
      ADD COLUMN byte_size integer,
      ADD COLUMN width integer,
      ADD COLUMN height integer,
      ADD COLUMN duration_seconds double precision,
      ADD COLUMN metadata jsonb,
      ADD COLUMN client_request_id uuid,
      ADD COLUMN content_sha256 varchar`);
    await queryRunner.query(`CREATE UNIQUE INDEX site_assets_operation_unique
      ON site_assets (site_id, client_request_id) WHERE client_request_id IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE site_assets ADD CONSTRAINT site_assets_media_evidence_check CHECK (
      media_type IN ('image', 'video') AND
      (media_type <> 'video' OR (kind = 'board_video' AND content_type IN ('video/mp4','video/webm')
      AND duration_seconds > 0 AND duration_seconds <= 60)))`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE site_assets DROP CONSTRAINT site_assets_media_evidence_check`,
    );
    await queryRunner.query(`DROP INDEX site_assets_operation_unique`);
    await queryRunner.query(`ALTER TABLE site_assets DROP COLUMN media_type, DROP COLUMN content_type,
      DROP COLUMN byte_size, DROP COLUMN width, DROP COLUMN height, DROP COLUMN duration_seconds,
      DROP COLUMN metadata, DROP COLUMN client_request_id, DROP COLUMN content_sha256`);
  }
}

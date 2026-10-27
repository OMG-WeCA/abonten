import { MigrationInterface, QueryRunner } from 'typeorm';
export class SiteCaptureRequirements1760000008000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE billboard_sites ADD COLUMN media_requirements_version smallint NOT NULL DEFAULT 2 CHECK (media_requirements_version IN (1,2))`,
    );
    // Preserve already-approved listings; next submission explicitly upgrades the policy.
    await q.query(
      `UPDATE billboard_sites SET media_requirements_version=1 WHERE status IN ('approved','listed')`,
    );
    await q.query(`ALTER TABLE site_assets DROP CONSTRAINT site_assets_media_evidence_check`);
    await q.query(`ALTER TABLE site_assets ADD CONSTRAINT site_assets_media_evidence_check CHECK (
      media_type IN ('image','video') AND
      (media_type <> 'video' OR (kind IN ('board_video','site_video') AND content_type IN ('video/mp4','video/webm') AND duration_seconds IS NOT NULL AND duration_seconds > 0 AND duration_seconds <= 60)) AND
      (kind <> 'panorama' OR (media_type='image' AND width IS NOT NULL AND height IS NOT NULL AND width > 0 AND height > 0 AND abs(width-2*height)<=2)))`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Never delete or relabel partner evidence to make a rollback appear successful.
    await q.query(
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM site_assets WHERE kind='site_video') THEN RAISE EXCEPTION 'Site videos exist; retain this additive schema when rolling back the application'; END IF; END $$`,
    );
    await q.query(`ALTER TABLE site_assets DROP CONSTRAINT site_assets_media_evidence_check`);
    await q.query(
      `ALTER TABLE site_assets ADD CONSTRAINT site_assets_media_evidence_check CHECK (media_type IN ('image','video') AND (media_type <> 'video' OR (kind='board_video' AND content_type IN ('video/mp4','video/webm') AND duration_seconds > 0 AND duration_seconds <=60)))`,
    );
    await q.query(`ALTER TABLE billboard_sites DROP COLUMN media_requirements_version`);
  }
}

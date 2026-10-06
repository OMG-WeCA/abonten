import type { MigrationInterface, QueryRunner } from 'typeorm';
export class SiteLocationVerification1760000001000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE billboard_sites ADD COLUMN location_verification jsonb');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE billboard_sites DROP COLUMN location_verification');
  }
}

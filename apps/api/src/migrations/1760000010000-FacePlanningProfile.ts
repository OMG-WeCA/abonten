import { MigrationInterface, QueryRunner } from 'typeorm';

export class FacePlanningProfile1760000010000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE site_faces ADD COLUMN planning_profile jsonb NULL CHECK (planning_profile IS NULL OR jsonb_typeof(planning_profile) = 'object')`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE site_faces DROP COLUMN planning_profile`);
  }
}

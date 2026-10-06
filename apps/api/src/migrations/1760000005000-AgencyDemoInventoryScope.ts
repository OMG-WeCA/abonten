import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AgencyDemoInventoryScope1760000005000 implements MigrationInterface {
  name = 'AgencyDemoInventoryScope1760000005000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE billboard_sites ADD COLUMN demo_agency_id uuid REFERENCES organizations(id)',
    );
    await runner.query(
      'CREATE INDEX billboard_demo_agency_idx ON billboard_sites (demo_agency_id) WHERE demo_agency_id IS NOT NULL',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    // Dropping the scope of listed samples would publish them to every agency.
    // Retain their content privately as drafts before removing the discriminator.
    await runner.query(
      "UPDATE billboard_sites SET status = 'draft' WHERE demo_agency_id IS NOT NULL AND status IN ('listed', 'approved', 'pending_review')",
    );
    await runner.query('ALTER TABLE billboard_sites DROP COLUMN demo_agency_id');
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AgencyResearchInventoryScope1760000006000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'ALTER TABLE billboard_sites ADD COLUMN research_agency_id uuid REFERENCES organizations(id), ADD COLUMN research_provenance jsonb',
    );
    await runner.query(
      'ALTER TABLE billboard_sites ADD CONSTRAINT billboard_research_scope_check CHECK ((research_agency_id IS NULL AND research_provenance IS NULL) OR (research_agency_id IS NOT NULL AND research_provenance IS NOT NULL AND demo_agency_id IS NULL))',
    );
    await runner.query(
      'CREATE INDEX billboard_research_agency_idx ON billboard_sites (research_agency_id) WHERE research_agency_id IS NOT NULL',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(
      "UPDATE billboard_sites SET status = 'draft' WHERE research_agency_id IS NOT NULL AND status IN ('listed','approved','pending_review')",
    );
    await runner.query(
      'ALTER TABLE billboard_sites DROP COLUMN research_agency_id, DROP COLUMN research_provenance',
    );
  }
}

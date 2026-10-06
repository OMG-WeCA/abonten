import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PersonalPlanningDrafts1760000004000 implements MigrationInterface {
  name = 'PersonalPlanningDrafts1760000004000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE personal_planning_drafts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id),
      user_id uuid NOT NULL REFERENCES users(id),
      name varchar(80) NOT NULL CHECK (length(trim(name)) > 0),
      draft jsonb NOT NULL CHECK (draft->>'version' = '1' AND jsonb_typeof(draft->'faces') = 'array' AND jsonb_array_length(draft->'faces') <= 100),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      client_request_id uuid NOT NULL,
      creation_fingerprint varchar(64) NOT NULL CHECK (creation_fingerprint ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT personal_draft_request_unique UNIQUE (organization_id, user_id, client_request_id)
    )`);
    await runner.query(
      'CREATE INDEX personal_draft_recent_idx ON personal_planning_drafts (organization_id, user_id, updated_at DESC, id)',
    );
    // Protect this feature's audit events even from accidental repository update/delete.
    await runner.query(`CREATE FUNCTION prevent_personal_draft_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.entity_type = 'personal_planning_draft' THEN
          RAISE EXCEPTION 'Personal planning draft audit events are append-only';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
    $$`);
    await runner.query(
      'CREATE TRIGGER personal_draft_audit_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_personal_draft_audit_mutation()',
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TRIGGER personal_draft_audit_append_only ON audit_logs');
    await runner.query('DROP FUNCTION prevent_personal_draft_audit_mutation()');
    await runner.query('DROP TABLE personal_planning_drafts');
  }
}

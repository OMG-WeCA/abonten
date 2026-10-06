import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PartnerTermsAcceptance1760000003000 implements MigrationInterface {
  name = 'PartnerTermsAcceptance1760000003000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE partner_terms_acceptances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id),
      user_id uuid NOT NULL REFERENCES users(id),
      organization_name text NOT NULL,
      representative_name text NOT NULL,
      version text NOT NULL,
      locale text NOT NULL CHECK (locale IN ('en', 'fr')),
      digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
      event_kind text NOT NULL CHECK (event_kind IN ('preview_acknowledgement', 'approved_acceptance')),
      authority_confirmed boolean NOT NULL CHECK (authority_confirmed = true),
      content_copy jsonb NOT NULL,
      accepted_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT partner_terms_org_version_unique UNIQUE (organization_id, version)
    )`);
    await queryRunner.query(`CREATE FUNCTION prevent_partner_terms_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Partner terms acceptance events are append-only'; END;
    $$`);
    await queryRunner.query(
      `CREATE TRIGGER partner_terms_append_only BEFORE UPDATE OR DELETE ON partner_terms_acceptances FOR EACH ROW EXECUTE FUNCTION prevent_partner_terms_mutation()`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE partner_terms_acceptances');
    await queryRunner.query('DROP FUNCTION prevent_partner_terms_mutation()');
  }
}

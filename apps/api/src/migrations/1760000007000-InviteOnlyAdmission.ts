import type { MigrationInterface, QueryRunner } from 'typeorm';
/** Additive admission ledger. Existing users, roles and memberships are untouched. */
export class InviteOnlyAdmission1760000007000 implements MigrationInterface {
  name = 'InviteOnlyAdmission1760000007000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE invitations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_request_id uuid, request_fingerprint varchar, email varchar NOT NULL CHECK(email=lower(btrim(email))),
      kind varchar NOT NULL DEFAULT 'membership' CHECK(kind IN ('account','membership')), account_type varchar CHECK(account_type IN ('media_partner','agency','brand')),
      name varchar NOT NULL DEFAULT '', organization_id varchar, role varchar NOT NULL,
      locale varchar NOT NULL DEFAULT 'en' CHECK(locale IN ('en','fr')),
      status varchar NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
      initial_owner boolean NOT NULL DEFAULT false, created_by_user_id varchar NOT NULL, created_by_org_id varchar NOT NULL,
      expires_at timestamptz NOT NULL, accepted_by_user_id varchar, accepted_at timestamptz, revoked_at timestamptz,
      delivery varchar NOT NULL DEFAULT 'not_sent' CHECK(delivery IN ('not_sent','sent','failed')),
      sent_at timestamptz, revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      `CREATE UNIQUE INDEX uq_invitation_pending_email_org ON invitations(email,organization_id) WHERE status='pending'`,
    );
    await q.query(
      `CREATE INDEX idx_invitation_email_status ON invitations(email,status,expires_at)`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_invitation_request ON invitations(created_by_user_id,client_request_id) WHERE client_request_id IS NOT NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX uq_invitation_account_pending ON invitations(email) WHERE kind='account' AND status='pending'`,
    );
    await q.query(`CREATE INDEX idx_invitation_org ON invitations(organization_id,created_at)`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE invitations');
  }
}

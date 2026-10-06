import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DatabaseService } from '../common/database.service';
import { UserEntity } from '../auth/entities/user.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { PartnerTermsAcceptanceEntity } from '../common/entities/partner-terms-acceptance.entity';
import { OrganizationCreationRequestEntity } from './entities/organization-creation-request.entity';
import { PartnerTermsAcceptance1760000003000 } from '../migrations/1760000003000-PartnerTermsAcceptance';
import { PartnerTermsService } from './partner-terms.service';
import { OrgsService } from './orgs.service';
import type { EmailCodeService } from '../auth/email-code.service';
import type { UserIdentityService } from '../auth/user-identity.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { PARTNER_TERMS_DRAFT_VERSION, partnerTermsDocument } from './terms/partner-terms.catalog';

const databaseUrl = process.env.POSTGRES_INTEGRATION_URL;
const affirmation = {
  version: PARTNER_TERMS_DRAFT_VERSION,
  locale: 'en' as const,
  expectedDigest: partnerTermsDocument('en', undefined, {}).digest,
  accepted: true,
  authorityConfirmed: true,
};

/** Versioned migration and real locks in a disposable schema, never synchronize. */
async function withSchema(work: (source: DataSource, userId: string) => Promise<void>) {
  if (!databaseUrl) throw new Error('POSTGRES_INTEGRATION_URL is required');
  const schema = `partner_terms_${randomUUID().replaceAll('-', '')}`;
  const source = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    entities: [
      UserEntity,
      MembershipEntity,
      OrganizationEntity,
      AuditLogEntity,
      PartnerTermsAcceptanceEntity,
      OrganizationCreationRequestEntity,
    ],
    extra: { options: `-c search_path=${schema},public` },
  });
  await source.initialize();
  const previousMode = process.env.PARTNER_TERMS_PREVIEW_ENABLED;
  const previousEnvironment = process.env.NODE_ENV;
  const previousRelease = process.env.PARTNER_TERMS_APPROVED_VERSION;
  try {
    await source.query(`CREATE SCHEMA "${schema}"`);
    await source.query(`
      CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text NOT NULL,
        phone text, locale text NOT NULL DEFAULT 'en', timezone text NOT NULL DEFAULT 'Africa/Lagos', avatar_ref text,
        avatar_content_type text, session_version integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'active',
        ms_oauth_subject text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, type text NOT NULL,
        country text NOT NULL, default_currency text NOT NULL DEFAULT 'NGN', default_locale text NOT NULL DEFAULT 'en',
        status text NOT NULL DEFAULT 'active', billing_ref text, allowed_email_domains text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, organization_id text NOT NULL,
        role text NOT NULL, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE organization_creation_requests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
        organization_id uuid NOT NULL, idempotency_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,idempotency_key));
      CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id text, actor_org_id text,
        action text NOT NULL, entity_type text, entity_id text, "before" json, "after" json,
        at timestamptz NOT NULL DEFAULT now(), ip text, request_id text, created_at timestamptz NOT NULL DEFAULT now());
    `);
    const runner = source.createQueryRunner();
    try {
      await new PartnerTermsAcceptance1760000003000().up(runner);
    } finally {
      await runner.release();
    }
    const userId = randomUUID();
    await source.query('INSERT INTO users(id,email,name) VALUES($1,$2,$3)', [
      userId,
      'synthetic-terms@example.test',
      'Synthetic Representative',
    ]);
    process.env.PARTNER_TERMS_PREVIEW_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    delete process.env.PARTNER_TERMS_APPROVED_VERSION;
    await work(source, userId);
  } finally {
    if (previousMode === undefined) delete process.env.PARTNER_TERMS_PREVIEW_ENABLED;
    else process.env.PARTNER_TERMS_PREVIEW_ENABLED = previousMode;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousRelease === undefined) delete process.env.PARTNER_TERMS_APPROVED_VERSION;
    else process.env.PARTNER_TERMS_APPROVED_VERSION = previousRelease;
    await source.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await source.destroy();
  }
}
function signupService(source: DataSource) {
  return new OrgsService(
    new DatabaseService(source),
    {} as EmailCodeService,
    {} as UserIdentityService,
    new CapabilityResolverService(),
  );
}

describe('Partner terms PostgreSQL integration', { skip: !databaseUrl }, () => {
  it('concurrent signup and owner acceptance produce exactly one immutable event and one terms audit', async () => {
    await withSchema(async (source, userId) => {
      const input = {
        onboardingKey: randomUUID(),
        name: 'Synthetic Partner',
        type: 'media_partner' as const,
        country: 'Ghana',
        defaultLocale: 'en' as const,
        partnerTerms: affirmation,
      };
      const orgs = signupService(source);
      const organizations = await Promise.all([
        orgs.createOrg(userId, input),
        orgs.createOrg(userId, input),
      ]);
      assert.equal(organizations[0]?.id, organizations[1]?.id);
      const orgId = organizations[0]!.id;
      const terms = new PartnerTermsService(new DatabaseService(source));
      const outcomes = await Promise.allSettled([
        terms.accept(userId, orgId, affirmation),
        terms.accept(userId, orgId, affirmation),
        terms.accept(userId, orgId, { ...affirmation, expectedDigest: 'a'.repeat(64) }),
      ]);
      assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 2);
      const stale = outcomes.find((result) => result.status === 'rejected');
      assert.ok(stale?.status === 'rejected' && stale.reason instanceof ConflictException);
      assert.equal(
        (stale.reason.getResponse() as { code: string }).code,
        'PARTNER_TERMS_CONTENT_CHANGED',
      );
      const events = outcomes.filter((result) => result.status === 'fulfilled');
      assert.ok(events[0]?.status === 'fulfilled' && events[1]?.status === 'fulfilled');
      assert.equal(events[0].value.id, events[1].value.id);
      assert.equal(await source.getRepository(PartnerTermsAcceptanceEntity).count(), 1);
      assert.equal(await source.getRepository(OrganizationEntity).count(), 1);
      assert.equal(await source.getRepository(MembershipEntity).count(), 1);
      assert.equal(
        await source
          .getRepository(AuditLogEntity)
          .count({ where: { action: 'partner_terms.preview_acknowledged' } }),
        1,
      );
      await assert.rejects(
        () =>
          source.query(
            'UPDATE partner_terms_acceptances SET representative_name=$1 WHERE organization_id=$2',
            ['tampered', orgId],
          ),
        /append-only/,
      );
      await assert.rejects(
        () =>
          source.query('DELETE FROM partner_terms_acceptances WHERE organization_id=$1', [orgId]),
        /append-only/,
      );
      const history = await terms.history(userId, orgId);
      assert.equal(history[0]?.eventKind, 'preview_acknowledgement');
      assert.equal(history[0]?.contentCopy.sections.length, 13);
    });
  });
  it('an audit failure rolls back the entire signup, including membership, immutable event and idempotency row', async () => {
    await withSchema(async (source, userId) => {
      await source.query(`CREATE FUNCTION reject_terms_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        IF NEW.action = 'partner_terms.preview_acknowledged' THEN RAISE EXCEPTION 'Synthetic terms audit failure'; END IF; RETURN NEW; END; $$;
        CREATE TRIGGER reject_terms_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_terms_audit();`);
      const input = {
        onboardingKey: randomUUID(),
        name: 'Synthetic Partner',
        type: 'media_partner' as const,
        country: 'Benin',
        partnerTerms: affirmation,
      };
      await assert.rejects(
        () => signupService(source).createOrg(userId, input),
        /Synthetic terms audit failure/,
      );
      for (const target of [
        OrganizationEntity,
        MembershipEntity,
        AuditLogEntity,
        PartnerTermsAcceptanceEntity,
        OrganizationCreationRequestEntity,
      ])
        assert.equal(await source.getRepository(target).count(), 0);
    });
  });
});

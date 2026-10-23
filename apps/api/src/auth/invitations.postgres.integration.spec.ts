import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, type EntityManager } from 'typeorm';
import type { JwtService } from '@nestjs/jwt';
import type { RedisService } from '../common/redis.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserEntity } from './entities/user.entity';
import { AppDataSource } from '../data-source';
import { ENTITIES } from '../common/entities';
import { DatabaseService } from '../common/database.service';
import { MailService } from '../common/mail.service';
import { InvitationsService } from './invitations.service';
import { UserIdentityService } from './user-identity.service';
import { OrgsService } from '../orgs/orgs.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { EmailCodeService } from './email-code.service';
const url = process.env.POSTGRES_INTEGRATION_URL;
async function fixture(work: (f: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
  if (!url) throw Error('Disposable Postgres URL required');
  const schema = 'admission_' + randomUUID().replaceAll('-', '');
  const admin = new DataSource({ type: 'postgres', url });
  await admin.initialize();
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const ds = new DataSource({
    type: 'postgres',
    url,
    entities: ENTITIES,
    migrations: AppDataSource.options.migrations,
    extra: { options: `-c search_path=${schema},public` },
    logging: false,
  });
  try {
    await ds.initialize();
    await ds.runMigrations();
    await work(await setup(ds));
  } finally {
    if (ds.isInitialized) await ds.destroy();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.destroy();
  }
}
async function setup(ds: DataSource) {
  const platform = randomUUID(),
    partner = randomUUID(),
    other = randomUUID(),
    operator = randomUUID(),
    owner = randomUUID(),
    outsider = randomUUID();
  for (const [id, name, type] of [
    [platform, 'Abonten Operations', 'platform'],
    [partner, 'Palmline Outdoor', 'media_partner'],
    [other, 'Cedar Media', 'agency'],
  ])
    await ds.query(
      "INSERT INTO organizations(id,name,type,country,default_currency,default_locale,status) VALUES($1,$2,$3,'Nigeria','NGN','en','active')",
      [id, name, type],
    );
  for (const [id, email, name] of [
    [operator, 'mariam@abonten.example', 'Mariam Adeyemi'],
    [owner, 'bayo@palmline.example', 'Bayo Martins'],
    [outsider, 'tola@cedar.example', 'Tola Akin'],
  ])
    await ds.query("INSERT INTO users(id,email,name,status) VALUES($1,$2,$3,'active')", [
      id,
      email,
      name,
    ]);
  for (const [user, org, role] of [
    [operator, platform, 'platform_admin'],
    [owner, partner, 'org_owner'],
    [outsider, other, 'org_owner'],
  ])
    await ds.query(
      "INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,$3,'active')",
      [user, org, role],
    );
  let failMail = false;
  const mail = {
    sent: [] as string[],
    async send(email: string) {
      if (failMail) throw Error('mail offline');
      this.sent.push(email);
    },
  };
  const db = new DatabaseService(ds),
    identities = new UserIdentityService(db),
    service = new InvitationsService(
      db,
      mail as unknown as MailService,
      { get: () => undefined } as unknown as ConfigService,
    );
  const orgs = new OrgsService(
    db,
    {} as EmailCodeService,
    identities,
    new CapabilityResolverService(),
    service,
  );
  const invite = (email = 'amina@palmline.example') =>
    service.createMember(operator, platform, {
      email,
      name: 'Amina Balogun',
      organizationId: partner,
      role: 'inventory_manager',
    });
  return {
    ds,
    db,
    service,
    identities,
    orgs,
    platform,
    partner,
    other,
    operator,
    owner,
    outsider,
    invite,
    mail,
    setMailFailure: (v: boolean) => {
      failMail = v;
    },
  };
}
describe('Invite-only admission — real Postgres', { skip: !url }, () => {
  it('invites only email and account type, then atomically creates recipient-owned company/profile and one owner membership', async () =>
    fixture(async (f) => {
      const row = await f.service.create(f.operator, f.platform, {
        email: ' Amina@Palmline.example ',
        accountType: 'media_partner',
        clientRequestId: randomUUID(),
      });
      assert.equal(row.kind, 'account');
      assert.equal(row.accountType, 'media_partner');
      assert.equal(row.organizationId, null);
      assert.equal(row.name, '');
      assert.equal(row.delivery, 'sent');
      assert.equal((await f.ds.query('SELECT 1 FROM organizations')).length, 3);
      assert.equal((await f.ds.query('SELECT 1 FROM users WHERE email=$1', [row.email])).length, 0);
      const user = await f.identities.findOrCreateByEmail(row.email, { name: 'amina' });
      await assert.rejects(() => f.service.accept(f.outsider, row.id, {}), NotFoundException);
      await assert.rejects(() => f.service.accept(user.id, row.id, {}), BadRequestException);
      const details = {
        locale: 'en' as const,
        profile: { name: 'Amina Balogun', timezone: 'Africa/Lagos' },
        organization: {
          name: 'Crescent Outdoor',
          country: 'Nigeria',
          defaultCurrency: 'NGN' as const,
        },
      };
      const accepted = await f.service.accept(user.id, row.id, details);
      assert.equal(accepted.role, 'org_owner');
      const org = (
        await f.ds.query('SELECT name,type FROM organizations WHERE id=$1', [
          accepted.organizationId,
        ])
      )[0];
      assert.deepEqual(org, { name: 'Crescent Outdoor', type: 'media_partner' });
      assert.equal(
        (await f.ds.query('SELECT name FROM users WHERE id=$1', [user.id]))[0].name,
        'Amina Balogun',
      );
      await assert.rejects(() => f.service.accept(user.id, row.id, details), ConflictException);
      assert.equal(
        (await f.service.getMine(user.id, row.id)).organizationId,
        accepted.organizationId,
      );
      await assert.rejects(() => f.service.getMine(f.outsider, row.id), NotFoundException);
      assert.equal(
        (
          await f.ds.query('SELECT role FROM memberships WHERE user_id=$1 AND organization_id=$2', [
            user.id,
            accepted.organizationId,
          ])
        )[0].role,
        'org_owner',
      );
      assert.equal(
        (
          await f.ds.query(
            "SELECT 1 FROM audit_logs WHERE action='invitation.accepted' AND entity_id=$1",
            [row.id],
          )
        ).length,
        1,
      );
    }));
  it('blocks unknown email and SSO creation, but keeps existing account sign-in available', async () =>
    fixture(async (f) => {
      assert.equal(await f.identities.canRequestCode('unknown@palmline.example'), false);
      await assert.rejects(
        () => f.identities.findOrCreateByEmail('unknown@palmline.example', { name: 'Unknown' }),
        ForbiddenException,
      );
      await assert.rejects(
        () =>
          f.identities.findOrCreateFromMicrosoft({
            email: 'unknown@palmline.example',
            name: 'Unknown',
            subject: 'oid-new',
          }),
        ForbiddenException,
      );
      assert.equal(await f.identities.canRequestCode('bayo@palmline.example'), true);
      assert.equal(
        (await f.identities.findOrCreateByEmail('BAYO@PALMLINE.EXAMPLE', { name: 'Changed' })).id,
        f.owner,
      );
    }));
  it('denies expired and revoked invitations at both admission and acceptance', async () =>
    fixture(async (f) => {
      const expired = await f.invite('lola@palmline.example');
      await f.ds.query(
        "UPDATE invitations SET expires_at=clock_timestamp()-interval '1second' WHERE id=$1",
        [expired.id],
      );
      assert.equal(await f.identities.canRequestCode(expired.email), false);
      await assert.rejects(
        () => f.identities.findOrCreateByEmail(expired.email, { name: 'Lola' }),
        ForbiddenException,
      );
      const revoked = await f.invite('dara@palmline.example');
      const user = await f.identities.findOrCreateByEmail(revoked.email, { name: 'Dara' });
      await f.service.change(f.operator, f.platform, revoked.id, 'revoke');
      await assert.rejects(() => f.service.accept(user.id, revoked.id, {}), ConflictException);
      assert.equal(
        (await f.ds.query('SELECT 1 FROM memberships WHERE user_id=$1', [user.id])).length,
        0,
      );
      await assert.rejects(
        () => f.identities.findOrCreateByEmail(expired.email, { name: 'Lola' }),
        ForbiddenException,
      );
      const active = await f.invite('kemi@palmline.example');
      const activeUser = await f.identities.findOrCreateByEmail(active.email, { name: 'Kemi' });
      await f.ds.query(
        "UPDATE invitations SET expires_at=clock_timestamp()-interval '1second' WHERE id=$1",
        [active.id],
      );
      await assert.rejects(() => f.service.accept(activeUser.id, active.id, {}), ConflictException);
    }));
  it('renews expired pending invitations without changing bindings and does not resend revoked or accepted admission', async () =>
    fixture(async (f) => {
      f.setMailFailure(true);
      const row = await f.invite();
      assert.equal(row.delivery, 'failed');
      await f.ds.query(
        "UPDATE invitations SET expires_at=clock_timestamp()-interval '1day' WHERE id=$1",
        [row.id],
      );
      f.setMailFailure(false);
      const renewed = await f.service.change(f.operator, f.platform, row.id, 'resend');
      assert.equal(renewed.status, 'pending');
      assert.equal(renewed.delivery, 'sent');
      assert.equal(renewed.email, row.email);
      assert.equal(renewed.role, row.role);
      assert.equal(renewed.revision, 2);
      await assert.rejects(() => f.invite(), ConflictException);
      await f.service.change(f.operator, f.platform, row.id, 'revoke');
      await assert.rejects(
        () => f.service.change(f.operator, f.platform, row.id, 'resend'),
        ConflictException,
      );
    }));
  it('requires platform administration for cross-tenant admission and prevents role escalation', async () =>
    fixture(async (f) => {
      await assert.rejects(
        () =>
          f.service.createMember(f.owner, f.partner, {
            email: 'amina@palmline.example',
            organizationId: f.partner,
            role: 'org_owner',
          }),
        ForbiddenException,
      );
      await assert.rejects(() => f.service.listAdmin(f.operator, f.partner), ForbiddenException);
      await assert.rejects(
        () =>
          f.service.createMember(f.operator, f.platform, {
            email: 'amina@palmline.example',
            organizationId: f.partner,
            role: 'platform_admin',
          }),
        BadRequestException,
      );
      await assert.rejects(
        () => f.orgs.invite(f.other, { email: 'amina@palmline.example', role: 'planner' }, f.owner),
        ForbiddenException,
      );
      await assert.rejects(
        () =>
          f.orgs.invite(
            f.partner,
            { email: 'amina@palmline.example', role: 'platform_admin' },
            f.owner,
          ),
        BadRequestException,
      );
    }));
  it('keeps tenant colleague invitations pending and does not alter or restore existing memberships', async () =>
    fixture(async (f) => {
      const row = await f.orgs.invite(
        f.partner,
        { email: 'amina@palmline.example', role: 'inventory_manager' },
        f.owner,
      );
      assert.equal(row.membership.status, 'pending');
      assert.equal(
        (await f.ds.query('SELECT 1 FROM users WHERE email=$1', ['amina@palmline.example'])).length,
        0,
      );
      const duplicate = await f.orgs.invite(
        f.partner,
        { email: 'amina@palmline.example', role: 'inventory_manager' },
        f.owner,
      );
      assert.equal(duplicate.invitationId, row.invitationId);
      const user = await f.identities.findOrCreateByEmail('amina@palmline.example', {
        name: 'Amina',
      });
      await f.service.accept(user.id, row.invitationId!, {});
      await f.ds.query("UPDATE memberships SET status='revoked' WHERE user_id=$1", [user.id]);
      await assert.rejects(
        () => f.service.accept(user.id, row.invitationId!, {}),
        ConflictException,
      );
      await assert.rejects(
        () =>
          f.orgs.invite(
            f.partner,
            { email: 'amina@palmline.example', role: 'inventory_manager' },
            f.owner,
          ),
        ConflictException,
      );
    }));
  it('serializes competing acceptance and preserves a single membership and audit', async () =>
    fixture(async (f) => {
      const row = await f.invite(),
        user = await f.identities.findOrCreateByEmail(row.email, { name: 'Amina' });
      const results = await Promise.allSettled([
        f.service.accept(user.id, row.id, {}),
        f.service.accept(user.id, row.id, {}),
      ]);
      assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
      assert.equal(
        (
          await f.ds.query('SELECT 1 FROM memberships WHERE user_id=$1 AND organization_id=$2', [
            user.id,
            f.partner,
          ])
        ).length,
        1,
      );
    }));
  it('rolls back membership and invitation acceptance when its audit insert fails', async () =>
    fixture(async (f) => {
      const row = await f.invite(),
        user = await f.identities.findOrCreateByEmail(row.email, { name: 'Amina' });
      await f.ds.query(
        `CREATE FUNCTION reject_invitation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='invitation.accepted' THEN RAISE EXCEPTION 'Audit unavailable'; END IF; RETURN NEW; END; $$`,
      );
      await f.ds.query(
        `CREATE TRIGGER reject_invitation_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_invitation_audit()`,
      );
      await assert.rejects(() => f.service.accept(user.id, row.id, {}), /Audit unavailable/);
      assert.equal(
        (await f.ds.query('SELECT status FROM invitations WHERE id=$1', [row.id]))[0].status,
        'pending',
      );
      assert.equal(
        (await f.ds.query('SELECT 1 FROM memberships WHERE user_id=$1', [user.id])).length,
        0,
      );
    }));
  it('does not let an earlier failed send overwrite a newer successful resend', async () =>
    fixture(async (f) => {
      const row = await f.invite();
      let calls = 0,
        release!: () => void,
        started!: () => void;
      const gate = new Promise<void>((r) => {
          release = r;
        }),
        began = new Promise<void>((r) => {
          started = r;
        });
      const delayed = new InvitationsService(
        f.db,
        {
          async send() {
            calls++;
            if (calls === 1) {
              started();
              await gate;
              throw Error('Earlier delivery failed');
            }
          },
        } as unknown as MailService,
        { get: () => undefined } as unknown as ConfigService,
      );
      const old = delayed.change(f.operator, f.platform, row.id, 'resend');
      await began;
      const current = await delayed.change(f.operator, f.platform, row.id, 'resend');
      assert.equal(current.delivery, 'sent');
      release();
      await old;
      const saved = (await f.service.listAdmin(f.operator, f.platform)).items.find(
        (i) => i.id === row.id,
      )!;
      assert.equal(saved.delivery, 'sent');
      assert.equal(saved.revision, 3);
      assert.equal(saved.email, row.email);
    }));

  it('makes concurrent account-invitation retries atomic without pre-creating organizations or duplicate email', async () =>
    fixture(async (f) => {
      const request = {
        email: 'imani@westhaven.example',
        accountType: 'agency' as const,
        clientRequestId: randomUUID(),
      };
      const [first, retry] = await Promise.all([
        f.service.create(f.operator, f.platform, request),
        f.service.create(f.operator, f.platform, request),
      ]);
      assert.equal(first.id, retry.id);
      assert.equal(first.organizationId, null);
      assert.equal((await f.ds.query('SELECT 1 FROM organizations')).length, 3);
      assert.equal(
        (
          await f.ds.query('SELECT 1 FROM invitations WHERE client_request_id=$1', [
            request.clientRequestId,
          ])
        ).length,
        1,
      );
      assert.equal(f.mail.sent.filter((e) => e === request.email).length, 1);
      assert.equal('requestFingerprint' in first, false);
      assert.equal('clientRequestId' in first, false);
      await assert.rejects(
        () => f.service.create(f.operator, f.platform, { ...request, accountType: 'brand' }),
        ConflictException,
      );
      await assert.rejects(
        () =>
          f.service.create(f.operator, f.platform, { email: request.email, accountType: 'agency' }),
        ConflictException,
      );
      await f.service.change(f.operator, f.platform, first.id, 'revoke');
      assert.equal((await f.service.create(f.operator, f.platform, request)).status, 'revoked');
      assert.equal(await f.identities.canRequestCode(request.email), false);
    }));
  it('serializes account acceptance so competing recipient company details create exactly one organization', async () =>
    fixture(async (f) => {
      const row = await f.service.create(f.operator, f.platform, {
          email: 'nora@harbourline.example',
          accountType: 'brand',
        }),
        user = await f.identities.findOrCreateByEmail(row.email, { name: 'nora' });
      const dto = {
        profile: { name: 'Nora Bello' },
        organization: { name: 'Harbourline Group', country: 'Nigeria' },
      };
      const results = await Promise.allSettled([
        f.service.accept(user.id, row.id, dto),
        f.service.accept(user.id, row.id, {
          ...dto,
          organization: { ...dto.organization, name: 'Harbourline Holdings' },
        }),
      ]);
      assert.equal(results.filter((i) => i.status === 'fulfilled').length, 1);
      assert.equal((await f.ds.query('SELECT 1 FROM organizations')).length, 4);
      assert.equal(
        (await f.ds.query('SELECT 1 FROM memberships WHERE user_id=$1', [user.id])).length,
        1,
      );
    }));
  it('rolls back recipient profile, company and membership if account acceptance audit fails', async () =>
    fixture(async (f) => {
      const row = await f.service.create(f.operator, f.platform, {
          email: 'dara@coastline.example',
          accountType: 'media_partner',
        }),
        user = await f.identities.findOrCreateByEmail(row.email, { name: 'dara' });
      await f.ds.query(
        `CREATE FUNCTION reject_invitation_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='invitation.accepted' THEN RAISE EXCEPTION 'Audit unavailable'; END IF; RETURN NEW; END; $$`,
      );
      await f.ds.query(
        'CREATE TRIGGER reject_invitation_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_invitation_audit()',
      );
      await assert.rejects(
        () =>
          f.service.accept(user.id, row.id, {
            profile: { name: 'Dara Cole' },
            organization: { name: 'Coastline Outdoor', country: 'Nigeria' },
          }),
        /Audit unavailable/,
      );
      assert.equal((await f.ds.query('SELECT 1 FROM organizations')).length, 3);
      assert.equal(
        (await f.ds.query('SELECT name FROM users WHERE id=$1', [user.id]))[0].name,
        'dara',
      );
      assert.equal(
        (await f.ds.query('SELECT status FROM invitations WHERE id=$1', [row.id]))[0].status,
        'pending',
      );
    }));
  it('pages and searches beyond the first hundred active organizations without exposing them to tenants', async () =>
    fixture(async (f) => {
      await f.ds.query(
        `INSERT INTO organizations(name,type,country,default_currency,default_locale,status) SELECT 'Harbour Outdoor '||lpad(n::text,3,'0'),'media_partner','Nigeria','NGN','en','active' FROM generate_series(1,105) n`,
      );
      const first = await f.service.organizations(f.operator, f.platform, 1, 100),
        second = await f.service.organizations(f.operator, f.platform, 2, 100);
      assert.equal(first.total, 108);
      assert.equal(first.items.length, 100);
      assert.equal(second.items.length, 8);
      assert.equal(new Set([...first.items, ...second.items].map((o) => o.id)).size, 108);
      const found = await f.service.organizations(f.operator, f.platform, 1, 100, 'OUTDOOR 105');
      assert.equal(found.total, 1);
      assert.equal(found.items[0].name, 'Harbour Outdoor 105');
      await assert.rejects(() => f.service.organizations(f.owner, f.partner), ForbiddenException);
    }));
  it('honors account expiry, renewal and revocation without pre-creating organizations or granting access', async () =>
    fixture(async (f) => {
      const row = await f.service.create(f.operator, f.platform, {
        email: 'selina@clearview.example',
        accountType: 'agency',
      });
      await f.ds.query(
        "UPDATE invitations SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [row.id],
      );
      assert.equal(await f.identities.canRequestCode(row.email), false);
      await assert.rejects(
        () => f.identities.findOrCreateByEmail(row.email, { name: 'Selina' }),
        ForbiddenException,
      );
      const renewed = await f.service.change(f.operator, f.platform, row.id, 'resend');
      assert.equal(renewed.status, 'pending');
      assert.equal(renewed.accountType, 'agency');
      assert.equal(renewed.organizationId, null);
      const user = await f.identities.findOrCreateByEmail(row.email, { name: 'selina' });
      await f.service.change(f.operator, f.platform, row.id, 'revoke');
      await assert.rejects(
        () =>
          f.service.accept(user.id, row.id, {
            profile: { name: 'Selina Mensah' },
            organization: { name: 'Clearview Media', country: 'Ghana' },
          }),
        ConflictException,
      );
      assert.equal((await f.ds.query('SELECT 1 FROM organizations')).length, 3);
      assert.equal(
        (await f.ds.query('SELECT 1 FROM memberships WHERE user_id=$1', [user.id])).length,
        0,
      );
    }));

  it('does not restore revoked session versions when account acceptance holds a stale user snapshot', async () =>
    fixture(async (f) => {
      const row = await f.service.create(f.operator, f.platform, {
        email: 'bayo@palmline.example',
        accountType: 'agency',
      });
      const auth = new AuthService(f.db, {} as JwtService, {} as ConfigService, {} as RedisService);
      let revoked = false;
      const boundary = {
        repo: f.db.repo.bind(f.db),
        transaction: async <T>(work: (m: EntityManager) => Promise<T>) =>
          f.db.transaction(async (m) => {
            const users = m.getRepository(UserEntity);
            const wrappedUsers = new Proxy(users, {
              get(target, key) {
                if (key === 'findOne')
                  return async (options: Parameters<typeof users.findOne>[0]) => {
                    const snapshot = await users.findOne(options);
                    if (snapshot?.id === f.owner && !revoked) {
                      revoked = true;
                      await auth.revokeAllSessions(f.owner);
                    }
                    return snapshot;
                  };
                const value = Reflect.get(target, key);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
            const wrappedManager = new Proxy(m, {
              get(target, key) {
                if (key === 'getRepository')
                  return (entity: unknown) =>
                    entity === UserEntity
                      ? wrappedUsers
                      : m.getRepository(entity as typeof UserEntity);
                const value = Reflect.get(target, key);
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
            return work(wrappedManager);
          }),
      } as DatabaseService;
      const service = new InvitationsService(
        boundary,
        f.mail as unknown as MailService,
        { get: () => undefined } as unknown as ConfigService,
      );
      await service.accept(f.owner, row.id, {
        profile: { name: 'Bayo Martins' },
        organization: { name: 'Palmline Planning', country: 'Nigeria' },
      });
      assert.equal(revoked, true);
      assert.equal(
        (await f.ds.query('SELECT session_version FROM users WHERE id=$1', [f.owner]))[0]
          .session_version,
        1,
      );
      const jwt = new JwtStrategy(
        new ConfigService({ jwt: { secret: 'isolated-regression-only-signing-key' } }),
        f.db,
      );
      await assert.rejects(
        () => jwt.validate({ sub: f.owner, email: 'bayo@palmline.example', sessionVersion: 0 }),
        UnauthorizedException,
      );
    }));
  it('records profile before/after changes in the same account acceptance transaction', async () =>
    fixture(async (f) => {
      await f.ds.query("UPDATE users SET phone='Office extension 24' WHERE id=$1", [f.owner]);
      const row = await f.service.create(f.operator, f.platform, {
        email: 'bayo@palmline.example',
        accountType: 'agency',
      });
      await f.service.accept(f.owner, row.id, {
        locale: 'fr',
        profile: { name: 'Bayo Cole', phone: '', timezone: 'Africa/Accra' },
        organization: { name: 'Palmline Planning', country: 'Ghana' },
      });
      const audits = await f.ds.query(
        "SELECT before,after FROM audit_logs WHERE action='account.profile.updated' AND entity_id=$1",
        [f.owner],
      );
      assert.equal(audits.length, 1);
      assert.deepEqual(audits[0].before, {
        name: 'Bayo Martins',
        phone: 'Office extension 24',
        locale: 'en',
        timezone: 'Africa/Lagos',
      });
      assert.deepEqual(audits[0].after, {
        name: 'Bayo Cole',
        phone: null,
        locale: 'fr',
        timezone: 'Africa/Accra',
      });
      assert.equal(
        (await f.ds.query('SELECT phone FROM users WHERE id=$1', [f.owner]))[0].phone,
        null,
      );
    }));
  it('retains platform-owner team invitations while preserving the separate platform-admin assignment rule', async () =>
    fixture(async (f) => {
      await f.ds.query(
        "INSERT INTO memberships(user_id,organization_id,role,status) VALUES($1,$2,'org_owner','active')",
        [f.owner, f.platform],
      );
      const row = await f.orgs.invite(
        f.platform,
        { email: 'jonas@abonten.example', role: 'org_owner' },
        f.owner,
      );
      assert.equal(row.membership.status, 'pending');
      assert.equal(
        (await f.ds.query('SELECT role FROM invitations WHERE id=$1', [row.invitationId]))[0].role,
        'org_owner',
      );
      assert.equal(
        (await f.ds.query('SELECT 1 FROM users WHERE email=$1', ['jonas@abonten.example'])).length,
        0,
      );
      await assert.rejects(
        () =>
          f.orgs.invite(
            f.platform,
            { email: 'jonas@abonten.example', role: 'platform_admin' },
            f.owner,
          ),
        ForbiddenException,
      );
    }));
});

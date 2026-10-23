import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../common/database.service';
import { UserEntity } from './entities/user.entity';
import { MembershipEntity } from './entities/membership.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { UserCapabilityOverrideEntity } from './entities/user-capability-override.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { InvitationsService } from './invitations.service';
import { AdminInvitationsController, InvitationsController } from './invitations.controller';
import { OrgsController } from '../orgs/orgs.controller';
import { OrgsService } from '../orgs/orgs.service';
const secret = 'local-http-admission-regression-only-secret',
  platform = randomUUID(),
  partner = randomUUID(),
  admin = randomUUID(),
  owner = randomUUID(),
  field = randomUUID(),
  invite = randomUUID();
let writes = 0;
const roles: Record<string, { org: string; role: string }> = {
  [admin]: { org: platform, role: 'platform_admin' },
  [owner]: { org: partner, role: 'org_owner' },
  [field]: { org: partner, role: 'field_operator' },
};
const database = {
  async repo(target: unknown) {
    if (target === UserEntity)
      return {
        findOne: async ({ where }: { where: { id: string } }) =>
          roles[where.id]
            ? { id: where.id, email: 'mariam@abonten.example', status: 'active', sessionVersion: 0 }
            : null,
      };
    if (target === MembershipEntity)
      return {
        findOne: async ({ where }: { where: { userId: string; organizationId: string } }) =>
          roles[where.userId]?.org === where.organizationId
            ? { role: roles[where.userId].role, status: 'active' }
            : null,
      };
    if (target === OrganizationEntity)
      return {
        findOne: async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          type: where.id === platform ? 'platform' : 'media_partner',
          status: 'active',
        }),
      };
    if (target === UserCapabilityOverrideEntity) return { find: async () => [] };
    throw Error('Unexpected repository');
  },
};
const invitations = {
  listAdmin: async () => ({ items: [], total: 0 }),
  organizations: async () => [],
  listMine: async () => ({ items: [] }),
  create: async () => {
    writes++;
    return { id: invite, status: 'pending' };
  },
  createMember: async () => ({ id: invite, status: 'pending' }),
  getMine: async () => ({ id: invite, status: 'accepted' }),
  change: async () => {
    writes++;
    return { id: invite, status: 'revoked' };
  },
  accept: async () => {
    writes++;
    return { id: invite, status: 'accepted' };
  },
};
@Module({
  imports: [PassportModule, JwtModule.register({ secret })],
  controllers: [AdminInvitationsController, InvitationsController, OrgsController],
  providers: [
    JwtStrategy,
    CapabilitiesGuard,
    CapabilityResolverService,
    { provide: ConfigService, useValue: { getOrThrow: () => secret } },
    { provide: DatabaseService, useValue: database },
    { provide: InvitationsService, useValue: invitations },
    {
      provide: OrgsService,
      useValue: {
        createOrg() {
          throw Error('Public creation must not be called');
        },
      },
    },
  ],
})
class AdmissionHttpModule {}
it('enforces admin-only invitation API, scoped organization context and disabled public creation over HTTP', async () => {
  const app = await NestFactory.create(AdmissionHttpModule, { logger: false });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.listen(0, '127.0.0.1');
  try {
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api`,
      jwt = app.get(JwtService);
    const headers = (user: string, org = roles[user].org) => ({
      'Content-Type': 'application/json',
      Authorization:
        'Bearer ' +
        jwt.sign({
          sub: user,
          email: 'mariam@abonten.example',
          sessionVersion: 0,
          activeOrgId: org,
        }),
      'X-Org-Id': org,
    });
    assert.equal((await fetch(base + '/admin/invitations')).status, 401);
    for (const user of [owner, field])
      for (const path of ['/admin/invitations', '/admin/invitations/organizations'])
        assert.equal((await fetch(base + path, { headers: headers(user) })).status, 403);
    assert.equal(
      (await fetch(base + '/admin/invitations', { headers: headers(admin, partner) })).status,
      403,
    );
    for (const user of [admin, owner, field])
      assert.equal(
        (
          await fetch(base + '/orgs', {
            method: 'POST',
            headers: headers(user),
            body: JSON.stringify({
              name: 'Palmline Outdoor',
              type: 'media_partner',
              country: 'Nigeria',
            }),
          })
        ).status,
        403,
      );
    assert.equal(writes, 0);
    for (const extra of [
      { name: 'Nora Bello' },
      { organizationId: partner },
      { role: 'platform_admin' },
      { accountType: 'platform' },
    ]) {
      assert.equal(
        (
          await fetch(base + '/admin/invitations', {
            method: 'POST',
            headers: headers(admin),
            body: JSON.stringify({
              email: 'nora@harbourline.example',
              accountType: 'media_partner',
              ...extra,
            }),
          })
        ).status,
        400,
      );
    }

    for (const action of ['resend', 'revoke'])
      assert.equal(
        (
          await fetch(base + `/admin/invitations/${invite}/${action}`, {
            method: 'POST',
            headers: headers(owner),
          })
        ).status,
        403,
      );
    assert.equal(
      (
        await fetch(base + `/invitations/${invite}/accept`, {
          method: 'POST',
          headers: headers(owner),
          body: JSON.stringify({
            role: 'platform_admin',
            email: 'different@palmline.example',
            organizationId: platform,
          }),
        })
      ).status,
      400,
    );
    assert.equal(writes, 0);
    assert.equal(
      (
        await fetch(base + '/admin/invitations', {
          method: 'POST',
          headers: headers(admin),
          body: JSON.stringify({
            email: 'amina@palmline.example',
            accountType: 'media_partner',
          }),
        })
      ).status,
      201,
    );
    assert.equal(writes, 1);
  } finally {
    await app.close();
  }
});

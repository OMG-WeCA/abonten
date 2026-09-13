import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ForbiddenException, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { UserEntity } from '../auth/entities/user.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { CapabilitiesGuard as GuardClass } from '../capabilities/capabilities.guard';
import { REQUIRE_CAPABILITIES_KEY } from '../capabilities/require-capabilities.decorator';
import { MarketplaceController } from '../marketplace/marketplace.controller';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { assertOrgMatch, OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';

const httpMutations: string[] = [];

const HTTP_JWT_SECRET = 'authorization-boundary-test-secret';

const httpDatabase = {
  async repo(target: unknown) {
    if (target === UserEntity) {
      return { async findOne() { return { id: 'buyer-1', status: 'active', sessionVersion: 0 }; } };
    }
    if (target === MembershipEntity) {
      return {
        async findOne({ where }: { where: { organizationId: string } }) {
          return where.organizationId === 'org-a'
            ? { userId: 'buyer-1', organizationId: 'org-a', role: 'org_owner', status: 'active' }
            : null;
        },
      };
    }
    if (target === UserCapabilityOverrideEntity) return { async find() { return []; } };
    if (target === OrganizationEntity) return { async findOne() { return { type: 'agency' }; } };
    throw new Error('Unexpected repository');
  },
};

@Module({
  imports: [PassportModule, JwtModule.register({ secret: HTTP_JWT_SECRET })],
  controllers: [OrgsController, MarketplaceController],
  providers: [
    JwtStrategy,
    CapabilityResolverService,
    CapabilitiesGuard,
    {
      provide: ConfigService,
      useValue: { getOrThrow: () => HTTP_JWT_SECRET },
    },
    { provide: DatabaseService, useValue: httpDatabase },
    {
      provide: OrgsService,
      useValue: {
        async updateSettings(orgId: string) {
          httpMutations.push(orgId);
          return { id: orgId };
        },
      },
    },
    {
      provide: MarketplaceService,
      useValue: {
        async getMarketplaceSite(siteId: string) {
          return { id: siteId, protected: true };
        },
      },
    },
  ],
})
class AuthorizationBoundaryHttpModule {}

describe('authorization boundaries (controller + guard end-to-end composition)', () => {
  it('protects listed-site detail with buyer JWT and marketplace capability guards', () => {
    const handler = Object.getOwnPropertyDescriptor(MarketplaceController.prototype, 'getSite')?.value;
    assert.ok(handler);
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
    const capabilities = Reflect.getMetadata(REQUIRE_CAPABILITIES_KEY, handler) as Capability[];
    assert.ok(guards.includes(JwtAuthGuard));
    assert.ok(guards.includes(GuardClass));
    assert.deepEqual(capabilities, [Capability.MARKETPLACE_VIEW]);
  });

  it('returns 401/403 at the HTTP boundary for anonymous marketplace access and cross-tenant PATCH mutations', async () => {
    httpMutations.length = 0;
    const app = await NestFactory.create(AuthorizationBoundaryHttpModule);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const token = app.get(JwtService).sign({
      sub: 'buyer-1',
      email: 'buyer@example.test',
      activeOrgId: 'org-a',
      role: 'org_owner',
      sessionVersion: 0,
    });
    const authenticated = { Authorization: `Bearer ${token}` };
    try {
      const anonymousDetail = await fetch(`${baseUrl}/marketplace/site-1`);
      assert.equal(anonymousDetail.status, 401);

      const buyerDetail = await fetch(`${baseUrl}/marketplace/site-1`, {
        headers: authenticated,
      });
      assert.equal(buyerDetail.status, 200);
      assert.deepEqual(await buyerDetail.json(), { id: 'site-1', protected: true });

      const mismatchedUrl = await fetch(`${baseUrl}/orgs/org-b`, {
        method: 'PATCH',
        headers: { ...authenticated, 'Content-Type': 'application/json', 'X-Org-Id': 'org-a' },
        body: JSON.stringify({ defaultCurrency: 'USD' }),
      });
      assert.equal(mismatchedUrl.status, 403);

      const foreignHeader = await fetch(`${baseUrl}/orgs/org-a`, {
        method: 'PATCH',
        headers: { ...authenticated, 'Content-Type': 'application/json', 'X-Org-Id': 'org-b' },
        body: JSON.stringify({ defaultCurrency: 'USD' }),
      });
      assert.equal(foreignHeader.status, 403);
      assert.deepEqual(httpMutations, []);
    } finally {
      await app.close();
    }
  });

  it('protects organization PATCH with the settings capability guards', () => {
    const handler = Object.getOwnPropertyDescriptor(OrgsController.prototype, 'updateSettings')?.value;
    assert.ok(handler);
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[];
    const capabilities = Reflect.getMetadata(REQUIRE_CAPABILITIES_KEY, handler) as Capability[];
    assert.ok(guards.includes(JwtAuthGuard));
    assert.ok(guards.includes(GuardClass));
    assert.deepEqual(capabilities, [Capability.ORG_SETTINGS_EDIT]);
  });

  it('rejects a PATCH path whose organization differs from X-Org-Id before service mutation', async () => {
    const mutations: string[] = [];
    const controller = new OrgsController({
      async updateSettings(orgId: string) {
        mutations.push(orgId);
        return { id: orgId };
      },
    } as unknown as OrgsService);
    const request = {
      headers: { 'x-org-id': 'org-a' },
      user: { userId: 'user-1', email: 'owner@example.test', activeOrgId: 'org-a', sessionVersion: 0 },
    };

    await assert.rejects(
      () => controller.updateSettings('org-b', { defaultCurrency: 'USD' }, request as never),
      ForbiddenException,
    );
    assert.deepEqual(mutations, []);

    await controller.updateSettings('org-a', { defaultCurrency: 'USD' }, request as never);
    assert.deepEqual(mutations, ['org-a']);
    assert.throws(() => assertOrgMatch(request as never, 'org-b'), ForbiddenException);
  });

  it('denies a cross-tenant X-Org-Id settings mutation in the capability guard', async () => {
    const reflector = {
      getAllAndOverride(key: string) {
        return key === REQUIRE_CAPABILITIES_KEY ? [Capability.ORG_SETTINGS_EDIT] : undefined;
      },
    };
    const db = {
      async repo(target: unknown) {
        if (target === MembershipEntity) {
          return {
            async findOne({ where }: { where: { organizationId: string } }) {
              return where.organizationId === 'org-a'
                ? { userId: 'user-1', organizationId: 'org-a', role: 'org_owner', status: 'active' }
                : null;
            },
          };
        }
        if (target === UserCapabilityOverrideEntity) return { async find() { return []; } };
        if (target === OrganizationEntity) return { async findOne() { return { type: 'agency' }; } };
        throw new Error('Unexpected repository');
      },
    };
    const guard = new CapabilitiesGuard(
      reflector as unknown as Reflector,
      new CapabilityResolverService(),
      db as unknown as DatabaseService,
    );
    const context = {
      getHandler: () => () => undefined,
      getClass: () => class SettingsController {},
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-org-id': 'org-b' },
          user: { userId: 'user-1', email: 'owner@example.test', activeOrgId: 'org-a', sessionVersion: 0 },
        }),
      }),
    };

    await assert.rejects(() => guard.canActivate(context as unknown as ExecutionContext), ForbiddenException);
  });

  it('never grants platform powers in a non-platform organization', () => {
    const capabilities = new CapabilityResolverService().resolveScoped('platform_admin', [], 'media_partner');
    assert.equal(capabilities.has(Capability.PLATFORM_ADMIN), false);
    assert.equal(capabilities.has(Capability.AUDIT_VIEW), false);
  });
});

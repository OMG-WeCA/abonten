import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ForbiddenException, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { GeographicContextController } from './geographic-context.controller';
import { GeographicContextService } from './geographic-context.service';
import { DatabaseService } from '../common/database.service';
import { InventoryService } from '../inventory/inventory.service';
import { UserEntity } from '../auth/entities/user.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';

const SECRET = 'geographic-context-http-test-secret';
const SITE = 'a7000000-0000-4000-8000-000000000001';
const siteGateCalls: { orgId?: string; siteId: string }[] = [];
const database = {
  async repo(target: unknown) {
    if (target === UserEntity)
      return {
        async findOne() {
          return { id: 'reader', status: 'active', sessionVersion: 0 };
        },
      };
    if (target === MembershipEntity)
      return {
        async findOne({ where }: { where: { organizationId: string } }) {
          return where.organizationId === 'own'
            ? { role: 'inventory_manager', status: 'active' }
            : null;
        },
      };
    if (target === UserCapabilityOverrideEntity)
      return {
        async find() {
          return [];
        },
      };
    if (target === OrganizationEntity)
      return {
        async findOne() {
          return { type: 'media_partner' };
        },
      };
    throw new Error('Unexpected repository');
  },
  async transaction(
    work: (manager: { query: (sql: string) => Promise<unknown[]> }) => Promise<unknown>,
  ) {
    return work({
      async query(sql) {
        return sql.includes('billboard_sites')
          ? [{ latitude: 5.55, longitude: -0.2, country: 'Ghana' }]
          : [];
      },
    });
  },
};
@Module({
  imports: [PassportModule, JwtModule.register({ secret: SECRET })],
  controllers: [GeographicContextController],
  providers: [
    JwtStrategy,
    CapabilityResolverService,
    CapabilitiesGuard,
    GeographicContextService,
    { provide: ConfigService, useValue: { getOrThrow: () => SECRET } },
    { provide: DatabaseService, useValue: database },
    {
      provide: InventoryService,
      useValue: {
        async assertCanReadSite(_user: unknown, orgId: string | undefined, siteId: string) {
          siteGateCalls.push({ orgId, siteId });
          if (siteId !== SITE) throw new ForbiddenException('Site not available');
        },
      },
    },
  ],
})
class TestModule {}

describe('geographic context authorization and API', () => {
  it('rejects foreign site access before querying reference layers or rasters', async () => {
    let queried = false;
    const service = new GeographicContextService(
      {
        transaction: async () => {
          queried = true;
        },
      } as unknown as DatabaseService,
      {
        assertCanReadSite: async () => {
          throw new ForbiddenException();
        },
      } as unknown as InventoryService,
    );
    await assert.rejects(
      () =>
        service.getSiteContext(
          { userId: 'reader', email: 'reader@example.test', sessionVersion: 0 },
          'other',
          SITE,
        ),
      ForbiddenException,
    );
    assert.equal(queried, false);
  });
  it('HTTP rejects anonymous, foreign-org, foreign-site and malformed IDs; returns null missing metrics', async () => {
    const app = await NestFactory.create(TestModule, { logger: false });
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/inventory/sites`;
    const token = app
      .get(JwtService)
      .sign({
        sub: 'reader',
        email: 'reader@example.test',
        activeOrgId: 'own',
        role: 'inventory_manager',
        sessionVersion: 0,
      });
    const headers = { Authorization: `Bearer ${token}` };
    try {
      assert.equal((await fetch(`${base}/${SITE}/geographic-context`)).status, 401);
      assert.equal(
        (
          await fetch(`${base}/${SITE}/geographic-context`, {
            headers: { ...headers, 'X-Org-Id': 'foreign' },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await fetch(`${base}/a7000000-0000-4000-8000-000000000002/geographic-context`, {
            headers,
          })
        ).status,
        403,
      );
      assert.equal((await fetch(`${base}/not-a-uuid/geographic-context`, { headers })).status, 400);
      const response = await fetch(`${base}/${SITE}/geographic-context`, { headers });
      assert.equal(response.status, 200);
      const context =
        (await response.json()) as import('@abonten/contracts/enrichment').SiteGeographicContext;
      assert.equal(context.countryCode, 'GH');
      assert.equal(context.dataClass, 'production');
      assert.equal(context.nearestRoad.value, null);
      assert.equal(context.traffic.value, null);
      assert.deepEqual(
        context.catchments.map((item: { radiusMetres: number }) => item.radiusMetres),
        [250, 500, 1000],
      );
      assert.equal(siteGateCalls.at(-1)?.orgId, 'own');
    } finally {
      await app.close();
    }
  });
});

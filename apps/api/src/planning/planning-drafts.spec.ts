import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { BadRequestException, Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { EntityManager } from 'typeorm';
import { PlanningDraftsController } from './planning-drafts.controller';
import { PlanningDraftsService } from './planning-drafts.service';
import { normalizeDraftWrite, normalizePlanningDraft } from './planning-drafts.validation';
import { PlanningDraftEntity } from '../common/entities/planning-draft.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { DatabaseService } from '../common/database.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { LocalizedExceptionFilter } from '../common/localized-exception.filter';
import { configureApiBodyLimits } from './planning-http';

const userId = '218459a1-584a-4b12-bef0-8f1a8737f909';
const otherUser = 'e9183222-a118-4fd4-9f1d-07c6f9e86155';
const agencyId = '8bf88915-3d3f-44f9-97b0-f8586286ac7f';
const brandId = 'ef13ab45-5f42-4586-a454-2b9b67383fd9';
const secret = 'synthetic-planning-draft-http-key';
const draft = () => ({
  version: 1,
  window: { startDate: '2026-12-01', endDate: '2026-12-15' },
  country: '',
  query: '',
  format: '',
  budget: '',
  currency: 'NGN',
  faces: [{ siteId: randomUUID(), faceId: randomUUID() }],
});
const create = () => ({
  name: 'Synthetic HTTP draft',
  draft: draft(),
  clientRequestId: randomUUID(),
});

describe('strict personal draft admission', () => {
  it('accepts recoverable blank controls and unresolved identifiers without inventing cached facts', () => {
    const value = draft();
    assert.deepEqual(normalizePlanningDraft(value), value);
    assert.deepEqual(normalizePlanningDraft({ ...value, faces: [] }).faces, []);
    assert.equal(
      normalizeDraftWrite({ ...create(), name: '  Personal plan  ' }, 'create').name,
      'Personal plan',
    );
  });
  it('preserves only a true brief-origin marker, without persisting document text or consent', () => {
    const original = draft();
    assert.deepEqual(normalizePlanningDraft({ ...original, briefDerivedContext: true }), {
      ...original,
      briefDerivedContext: true,
    });
    for (const value of [undefined, false, null, 'true', 1, {}])
      assert.deepEqual(
        normalizePlanningDraft({ ...original, briefDerivedContext: value }),
        original,
      );
    assert.throws(
      () =>
        normalizePlanningDraft({ ...original, briefDerivedContext: true, briefText: 'PRIVATE' }),
      BadRequestException,
    );
    assert.throws(
      () =>
        normalizePlanningDraft({
          ...original,
          briefDerivedContext: true,
          shareBriefWithProvider: true,
        }),
      BadRequestException,
    );
  });
  it('rejects unknown content at every level instead of persisting documents, consent, identity or commercial facts', () => {
    const value = create();
    for (const key of [
      'briefText',
      'history',
      'shareBriefWithProvider',
      'userId',
      'organizationId',
      'rateCards',
    ])
      assert.throws(
        () => normalizeDraftWrite({ ...value, [key]: 'PRIVATE' }, 'create'),
        BadRequestException,
      );
    for (const key of ['enrichment', 'availability', 'document', 'cachedInventory'])
      assert.throws(
        () => normalizePlanningDraft({ ...value.draft, [key]: {} }),
        BadRequestException,
      );
    assert.throws(
      () =>
        normalizePlanningDraft({
          ...value.draft,
          window: { ...value.draft.window, quotedAt: 'PRIVATE' },
        }),
      BadRequestException,
    );
    assert.throws(
      () =>
        normalizePlanningDraft({
          ...value.draft,
          faces: [{ ...value.draft.faces[0], price: 15000 }],
        }),
      BadRequestException,
    );
  });
  it('bounds names, dates, control lengths, face count, UUIDs, revisions and currencies', () => {
    const value = create();
    for (const input of [
      null,
      [],
      {},
      { ...value, name: '' },
      { ...value, name: 'a'.repeat(81) },
      { ...value, clientRequestId: 'fake' },
    ])
      assert.throws(() => normalizeDraftWrite(input, 'create'), BadRequestException);
    for (const delta of [
      { version: 2 },
      { query: 'x'.repeat(201) },
      { country: 'x'.repeat(81) },
      { format: 'x'.repeat(41) },
      { budget: 'x'.repeat(41) },
      { currency: 'GBP' },
      {
        faces: Array.from({ length: 101 }, () => ({ siteId: randomUUID(), faceId: randomUUID() })),
      },
      { faces: [value.draft.faces[0], value.draft.faces[0]] },
      { faces: [{ siteId: '../../private', faceId: randomUUID() }] },
      { faces: [{ ...value.draft.faces[0], pricingCurrency: 'GBP' }] },
      { window: { startDate: '2026-02-31', endDate: '2026-12-01' } },
      { window: { startDate: '2026-12-01', endDate: '2026-12-01' } },
    ])
      assert.throws(
        () => normalizePlanningDraft({ ...value.draft, ...delta }),
        BadRequestException,
      );
    for (const revision of [0, -1, 1.5, '1', null, 2147483647])
      assert.throws(
        () => normalizeDraftWrite({ name: value.name, draft: value.draft, revision }, 'update'),
        BadRequestException,
      );
  });
});

type Row = Record<string, unknown>;
const tables = new Map<unknown, Row[]>();
function repository(target: unknown) {
  const rows = tables.get(target) ?? [];
  tables.set(target, rows);
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  return {
    async findOne({ where }: { where: Row }) {
      const row = rows.find((row) => matches(row, where));
      return row ? structuredClone(row) : null;
    },
    async find({ where }: { where: Row }) {
      return rows.filter((row) => matches(row, where)).map((row) => structuredClone(row));
    },
    async count({ where }: { where: Row }) {
      return rows.filter((row) => matches(row, where)).length;
    },
    create(value: Row) {
      return value;
    },
    async save(value: Row) {
      const now = new Date();
      const row = { id: randomUUID(), createdAt: now, ...value, updatedAt: now };
      const index = rows.findIndex((item) => item.id === row.id);
      if (index < 0) rows.push(structuredClone(row));
      else rows[index] = structuredClone(row);
      return row;
    },
  };
}
const database = {
  async repo(target: unknown) {
    return repository(target);
  },
  async transaction<T>(work: (manager: EntityManager) => Promise<T>) {
    return work({ getRepository: repository } as unknown as EntityManager);
  },
};

@Module({
  imports: [PassportModule, JwtModule.register({ secret })],
  controllers: [PlanningDraftsController],
  providers: [
    PlanningDraftsService,
    JwtStrategy,
    CapabilitiesGuard,
    CapabilityResolverService,
    { provide: ConfigService, useValue: { getOrThrow: () => secret } },
    { provide: DatabaseService, useValue: database },
  ],
})
class DraftHttpTestModule {}

describe('personal draft HTTP API', () => {
  it('enforces authenticated agency/user scope, rejects extra JSON, localizes failures and reports revision/request conflicts', async () => {
    tables.clear();
    tables.set(OrganizationEntity, [
      { id: agencyId, type: 'agency', status: 'active' },
      { id: brandId, type: 'brand', status: 'active' },
    ]);
    tables.set(
      UserEntity,
      [userId, otherUser].map((id) => ({ id, status: 'active', sessionVersion: 0 })),
    );
    tables.set(
      MembershipEntity,
      [userId, otherUser].flatMap((id) =>
        [agencyId, brandId].map((organizationId) => ({
          userId: id,
          organizationId,
          role: 'org_owner',
          status: 'active',
        })),
      ),
    );
    tables.set(UserCapabilityOverrideEntity, []);
    const app = await NestFactory.create<NestExpressApplication>(DraftHttpTestModule, {
      logger: false,
      bodyParser: false,
    });
    configureApiBodyLimits(app);
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new LocalizedExceptionFilter());
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/planning/v1/drafts`;
    const jwt = (id: string) =>
      app
        .get(JwtService)
        .sign({ sub: id, email: `${id}@example.test`, activeOrgId: agencyId, sessionVersion: 0 });
    const headers = { Authorization: `Bearer ${jwt(userId)}`, 'Content-Type': 'application/json' };
    const input = create();
    try {
      assert.equal((await fetch(base)).status, 401);
      assert.equal((await fetch(base, { method: 'POST' })).status, 401);
      assert.equal(
        (await fetch(base, { headers: { ...headers, 'X-Org-Id': brandId } })).status,
        403,
        'non-agency owner has capabilities but is forbidden',
      );
      assert.equal(
        (await fetch(base, { headers: { ...headers, 'X-Org-Id': randomUUID() } })).status,
        403,
      );
      const savedResponse = await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify(input),
      });
      assert.equal(savedResponse.status, 201, await savedResponse.clone().text());
      const saved = (await savedResponse.json()) as { id: string; revision: number };
      assert.equal(saved.revision, 1);
      const replay = await fetch(base, { method: 'POST', headers, body: JSON.stringify(input) });
      assert.equal(((await replay.json()) as { id: string }).id, saved.id);
      assert.equal(tables.get(AuditLogEntity)!.length, 1);
      const invalid = await fetch(base, {
        method: 'POST',
        headers: { ...headers, 'Accept-Language': 'fr' },
        body: JSON.stringify({ ...input, briefText: 'PRIVATE DOCUMENT' }),
      });
      assert.equal(invalid.status, 400);
      assert.match(((await invalid.json()) as { message: string }).message, /Vérifiez/);
      const otherHeaders = { ...headers, Authorization: `Bearer ${jwt(otherUser)}` };
      assert.deepEqual(
        ((await (await fetch(base, { headers: otherHeaders })).json()) as { items: unknown[] })
          .items,
        [],
      );
      assert.equal((await fetch(`${base}/${saved.id}`, { headers: otherHeaders })).status, 404);
      const patch = { name: 'Updated draft', draft: input.draft, revision: 1 };
      assert.equal(
        (
          await fetch(`${base}/${saved.id}`, {
            method: 'PATCH',
            headers: otherHeaders,
            body: JSON.stringify(patch),
          })
        ).status,
        404,
      );
      const update = await fetch(`${base}/${saved.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(patch),
      });
      assert.equal(update.status, 200);
      assert.equal(((await update.json()) as { revision: number }).revision, 2);
      const stale = await fetch(`${base}/${saved.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Accept-Language': 'fr' },
        body: JSON.stringify(patch),
      });
      assert.equal(stale.status, 409);
      const staleBody = (await stale.json()) as { code: string; message: string };
      assert.equal(staleBody.code, 'DRAFT_REVISION_CONFLICT');
      assert.match(staleBody.message, /modifié ailleurs/);
      assert.equal(
        (
          await fetch(base, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...input, name: 'Different content' }),
          })
        ).status,
        409,
      );
      assert.equal((await fetch(`${base}/invalid`, { headers })).status, 400);
      tables.get(UserCapabilityOverrideEntity)!.push({
        userId,
        organizationId: agencyId,
        capability: 'CAMPAIGN_CREATE',
        action: 'revoke',
      });
      assert.equal((await fetch(base, { headers })).status, 403);
      assert.equal(tables.get(PlanningDraftEntity)!.length, 1);
      assert.equal(tables.get(AuditLogEntity)!.length, 2);
    } finally {
      await app.close();
    }
  });
});

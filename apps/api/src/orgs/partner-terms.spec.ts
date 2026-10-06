import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  PARTNER_TERMS_DRAFT_VERSION,
  partnerTermsDocument,
  partnerTermsPolicy,
  preparePartnerTermsAcceptance,
} from './terms/partner-terms.catalog';
import { PartnerTermsService, persistPartnerTermsAcceptance } from './partner-terms.service';
import { PartnerTermsAcceptanceEntity } from '../common/entities/partner-terms-acceptance.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { DatabaseService } from '../common/database.service';

const preview = { NODE_ENV: 'test', PARTNER_TERMS_PREVIEW_ENABLED: 'true' };
const affirmation = {
  version: PARTNER_TERMS_DRAFT_VERSION,
  locale: 'en' as const,
  expectedDigest: partnerTermsDocument('en', undefined, {}).digest,
  accepted: true,
  authorityConfirmed: true,
};

describe('Partner terms release and affirmative acceptance', () => {
  it('pins the exact source version and preserves every English/French section and paragraph', () => {
    const en = partnerTermsDocument('en', undefined, {});
    const fr = partnerTermsDocument('fr', undefined, {});
    assert.equal(en.digest, '33c89625d6ab02685175262f35f6e9c7dd57afcdb029587e559b5a415dc3a16f');
    assert.equal(fr.digest, 'c2c04639be95250a0aa6cfe4cea6733411fc9efc615490672e3afa19b02f3cc1');
    assert.equal(fr.sourceEnglishDigest, en.digest);
    assert.deepEqual(
      en.sections.map((section) => section.number),
      Array.from({ length: 13 }, (_, index) => index + 1),
    );
    assert.deepEqual(
      fr.sections.map((section) => section.paragraphs.length),
      en.sections.map((section) => section.paragraphs.length),
    );
    assert.equal(
      en.sections.reduce((count, section) => count + section.paragraphs.length, 0),
      42,
    );
    assert.equal(fr.translationStatus, 'translation_for_review');
    assert.ok(!JSON.stringify(en.sections).includes('Approval note for Abonten'));
    en.sections[0]!.paragraphs[0] = 'changed client copy';
    assert.equal(partnerTermsDocument('en', undefined, {}).digest, en.digest);
    assert.notEqual(
      partnerTermsDocument('en', undefined, {}).sections[0]!.paragraphs[0],
      'changed client copy',
    );
  });
  it('defaults off and cannot turn the draft into a production release', () => {
    assert.equal(partnerTermsPolicy({}).mode, 'disabled');
    assert.equal(partnerTermsPolicy(preview).mode, 'preview');
    assert.equal(partnerTermsPolicy({ ...preview, NODE_ENV: 'production' }).mode, 'disabled');
    for (const version of [
      PARTNER_TERMS_DRAFT_VERSION,
      'unknown',
      '__proto__',
      'constructor',
      'toString',
    ])
      assert.throws(
        () => partnerTermsPolicy({ PARTNER_TERMS_APPROVED_VERSION: version }),
        ConflictException,
      );
    assert.equal(preparePartnerTermsAcceptance(undefined, 'en', {}), undefined);
    assert.throws(() => preparePartnerTermsAcceptance(affirmation, 'en', {}), BadRequestException);
  });
  it('requires affirmative acceptance and representative authority for the exact displayed language and version', () => {
    for (const input of [
      undefined,
      { ...affirmation, accepted: false },
      { ...affirmation, authorityConfirmed: false },
    ]) {
      assert.throws(() => preparePartnerTermsAcceptance(input, 'en', preview), BadRequestException);
    }
    assert.throws(
      () => preparePartnerTermsAcceptance({ ...affirmation, version: 'stale' }, 'en', preview),
      ConflictException,
    );
    assert.throws(
      () => preparePartnerTermsAcceptance({ ...affirmation, locale: 'fr' }, 'en', preview),
      BadRequestException,
    );
    for (const staleDigest of ['a'.repeat(64), undefined]) {
      assert.throws(
        () =>
          preparePartnerTermsAcceptance(
            { ...affirmation, expectedDigest: staleDigest } as typeof affirmation,
            'en',
            preview,
          ),
        (error: unknown) =>
          error instanceof ConflictException &&
          (error.getResponse() as { code?: string }).code === 'PARTNER_TERMS_CONTENT_CHANGED',
      );
    }
    assert.throws(
      () =>
        preparePartnerTermsAcceptance(
          { ...affirmation, expectedDigest: partnerTermsDocument('fr', undefined, {}).digest },
          'en',
          preview,
        ),
      ConflictException,
    );
    const document = preparePartnerTermsAcceptance(affirmation, 'en', preview);
    assert.equal(document?.acceptanceMode, 'preview');
    assert.equal(document?.status, 'review_draft');
  });
});

describe('Partner terms audit, immutable copy and tenant boundaries', () => {
  it('retains server-owned copy, representative, organization and UTC event; a repeat does not duplicate audit', async () => {
    const events: PartnerTermsAcceptanceEntity[] = [];
    const audits: AuditLogEntity[] = [];
    const manager = {
      getRepository(target: unknown) {
        if (target === UserEntity)
          return {
            async findOne() {
              return { id: 'user-a', name: 'Synthetic Authorized Representative' };
            },
          };
        if (target === PartnerTermsAcceptanceEntity)
          return {
            async findOne() {
              return events[0] ?? null;
            },
            create(value: PartnerTermsAcceptanceEntity) {
              return value;
            },
            async save(value: PartnerTermsAcceptanceEntity) {
              const event = { ...value, id: 'event-a' };
              events.push(event);
              return event;
            },
          };
        if (target === AuditLogEntity)
          return {
            create(value: AuditLogEntity) {
              return value;
            },
            async save(value: AuditLogEntity) {
              audits.push(value);
              return value;
            },
          };
        throw new Error('Unexpected target');
      },
    } as unknown as EntityManager;
    const organization = { id: 'org-a', name: 'Synthetic Partner' } as OrganizationEntity;
    const document = preparePartnerTermsAcceptance(affirmation, 'en', preview)!;
    const first = await persistPartnerTermsAcceptance(manager, 'user-a', organization, document);
    const repeated = await persistPartnerTermsAcceptance(manager, 'user-a', organization, document);
    assert.equal(first.id, repeated.id);
    assert.equal(events.length, 1);
    assert.equal(audits.length, 1);
    assert.equal(first.eventKind, 'preview_acknowledgement');
    assert.equal(first.representativeName, 'Synthetic Authorized Representative');
    assert.equal(first.organizationName, 'Synthetic Partner');
    assert.equal(first.digest, document.digest);
    assert.deepEqual(first.contentCopy.sections, document.sections);
    document.sections[0]!.paragraphs[0] = 'client mutation';
    assert.notEqual(first.contentCopy.sections[0]!.paragraphs[0], 'client mutation');
    assert.ok(first.acceptedAt.toISOString().endsWith('Z'));
    assert.equal(audits[0]?.action, 'partner_terms.preview_acknowledged');
    assert.equal(audits[0]?.actorOrgId, 'org-a');
  });
  it('denies cross-tenant history and non-owner acceptance before writing any event', async () => {
    let writes = 0;
    const service = new PartnerTermsService({
      async repo() {
        return {
          async findOne() {
            return null;
          },
        };
      },
      async transaction(work: (manager: EntityManager) => Promise<unknown>) {
        return work({
          getRepository(target: unknown) {
            if (target === OrganizationEntity)
              return {
                async findOne() {
                  return { id: 'org-b', type: 'media_partner' };
                },
              };
            if (target === MembershipEntity)
              return {
                async findOne() {
                  return null;
                },
              };
            writes += 1;
            throw new Error('Unexpected write');
          },
        } as unknown as EntityManager);
      },
    } as unknown as DatabaseService);
    await assert.rejects(() => service.history('user-a', 'org-b'), ForbiddenException);
    await assert.rejects(() => service.accept('user-a', 'org-b', affirmation), ForbiddenException);
    assert.equal(writes, 0);
  });
});

// Exercises the real HTTP serializer/query validator without storage or providers.
import { Module, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PartnerTermsController } from './partner-terms.controller';
@Module({
  controllers: [PartnerTermsController],
  providers: [
    { provide: PartnerTermsService, useValue: new PartnerTermsService({} as DatabaseService) },
  ],
})
class TermsReadHttpModule {}

describe('Partner terms HTTP content', () => {
  it('serves exact English and French drafts, rejects unknown language/version, and keeps the approval note private', async () => {
    const app = await NestFactory.create(TermsReadHttpModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/partner-terms`;
    try {
      for (const locale of ['en', 'fr']) {
        const response = await fetch(`${base}/current?locale=${locale}`);
        assert.equal(response.status, 200);
        const body = (await response.json()) as {
          locale: string;
          sections: unknown[];
          status: string;
        };
        assert.equal(body.locale, locale);
        assert.equal(body.sections.length, 13);
        assert.equal(body.status, 'review_draft');
        assert.ok(!JSON.stringify(body).includes('Approval note for Abonten'));
      }
      assert.equal((await fetch(`${base}/current?locale=xx`)).status, 400);
      assert.equal((await fetch(`${base}/not-a-version?locale=en`)).status, 400);
      assert.equal((await fetch(`${base}/${PARTNER_TERMS_DRAFT_VERSION}?locale=en`)).status, 200);
    } finally {
      await app.close();
    }
  });
});

import { OrgsService } from './orgs.service';
import { OrganizationCreationRequestEntity } from './entities/organization-creation-request.entity';
import type { EmailCodeService } from '../auth/email-code.service';
import type { UserIdentityService } from '../auth/user-identity.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';

function atomicPartnerSignupSubject(failTermsAudit = false) {
  type Row = Record<string, unknown>;
  const committed = new Map<unknown, Row[]>();
  let transactionTail = Promise.resolve();
  const db = {
    async repo(target: unknown) {
      if (target === UserEntity)
        return {
          async findOne() {
            return { id: 'user-a', status: 'active', sessionVersion: 0 };
          },
        };
      throw new Error('Unexpected nontransactional repository');
    },
    async transaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
      const prior = transactionTail;
      let release: () => void = () => undefined;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await prior;
      const staged = new Map<unknown, Row[]>(
        [...committed].map(([target, rows]) => [target, structuredClone(rows)]),
      );
      const manager = {
        getRepository(target: unknown) {
          if (target === UserEntity)
            return {
              async findOne() {
                return { id: 'user-a', name: 'Synthetic Representative', status: 'active' };
              },
            };
          if (
            ![
              OrganizationEntity,
              MembershipEntity,
              AuditLogEntity,
              PartnerTermsAcceptanceEntity,
              OrganizationCreationRequestEntity,
            ].includes(target as typeof OrganizationEntity)
          )
            throw new Error('Unexpected target');
          const rows = staged.get(target) ?? [];
          staged.set(target, rows);
          return {
            create(value: Row) {
              return value;
            },
            async findOne({ where }: { where: Row }) {
              return (
                rows.find((row) =>
                  Object.entries(where).every(([key, value]) => row[key] === value),
                ) ?? null
              );
            },
            async save(value: Row) {
              if (
                failTermsAudit &&
                target === AuditLogEntity &&
                value.action === 'partner_terms.preview_acknowledged'
              )
                throw new Error('Synthetic failed acceptance audit');
              const row = { ...value, id: randomUUID() };
              rows.push(row);
              return row;
            },
          };
        },
      } as unknown as EntityManager;
      try {
        const result = await work(manager);
        committed.clear();
        for (const [target, rows] of staged) committed.set(target, rows);
        return result;
      } finally {
        release();
      }
    },
  } as unknown as DatabaseService;
  const service = new OrgsService(
    db,
    {} as EmailCodeService,
    {} as UserIdentityService,
    new CapabilityResolverService(),
  );
  return { service, database: db, rows: (target: unknown) => committed.get(target) ?? [] };
}

describe('Atomic partner signup with terms', () => {
  it('rolls back org, membership, acceptance and audits when acceptance audit fails; retries remain idempotent', async () => {
    const previousMode = process.env.PARTNER_TERMS_PREVIEW_ENABLED;
    const previousEnvironment = process.env.NODE_ENV;
    process.env.PARTNER_TERMS_PREVIEW_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    const input = {
      onboardingKey: '11111111-2222-4333-8444-555555555555',
      name: 'Synthetic Partner',
      type: 'media_partner' as const,
      country: 'Ghana',
      defaultLocale: 'en' as const,
      partnerTerms: affirmation,
    };
    try {
      const failed = atomicPartnerSignupSubject(true);
      await assert.rejects(
        () => failed.service.createOrg('user-a', input),
        /Synthetic failed acceptance audit/,
      );
      for (const target of [
        OrganizationEntity,
        MembershipEntity,
        AuditLogEntity,
        PartnerTermsAcceptanceEntity,
        OrganizationCreationRequestEntity,
      ])
        assert.equal(failed.rows(target).length, 0);
      const healthy = atomicPartnerSignupSubject();
      const results = await Promise.all(
        Array.from({ length: 3 }, () => healthy.service.createOrg('user-a', input)),
      );
      assert.equal(new Set(results.map((row) => row.id)).size, 1);
      assert.equal(healthy.rows(OrganizationEntity).length, 1);
      assert.equal(healthy.rows(MembershipEntity).length, 1);
      assert.equal(healthy.rows(PartnerTermsAcceptanceEntity).length, 1);
      assert.equal(healthy.rows(OrganizationCreationRequestEntity).length, 1);
      assert.deepEqual(
        healthy.rows(AuditLogEntity).map((row) => row.action),
        ['organization.created', 'partner_terms.preview_acknowledged'],
      );
      // Network-lost successful signup can replay after preview enforcement changes.
      delete process.env.PARTNER_TERMS_PREVIEW_ENABLED;
      const replay = await healthy.service.createOrg('user-a', input);
      assert.equal(replay.id, results[0]?.id);
      assert.equal(healthy.rows(PartnerTermsAcceptanceEntity).length, 1);
    } finally {
      if (previousMode === undefined) delete process.env.PARTNER_TERMS_PREVIEW_ENABLED;
      else process.env.PARTNER_TERMS_PREVIEW_ENABLED = previousMode;
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
    }
  });
});

import { plainToInstance } from 'class-transformer';
import { CreateOrgDto, UpdateOrganizationSettingsDto } from './dto/orgs.dto';
describe('Canonical partner onboarding markets', () => {
  it('normalizes French country aliases at DTO and programmatic service boundaries with country currency defaults', async () => {
    for (const [input, country] of [
      ['Bénin', 'Benin'],
      ['Cameroun', 'Cameroon'],
      ['Côte d’Ivoire', "Côte d'Ivoire"],
      ['BJ', 'Benin'],
    ] as const) {
      assert.equal(plainToInstance(CreateOrgDto, { country: input }).country, country);
      assert.equal(
        plainToInstance(UpdateOrganizationSettingsDto, { country: input }).country,
        country,
      );
    }
    assert.equal(plainToInstance(CreateOrgDto, { country: ' Senegal ' }).country, 'Senegal');
    const subject = atomicPartnerSignupSubject();
    const organization = await subject.service.createOrg('user-a', {
      name: 'Synthetic Agency',
      type: 'agency',
      country: 'Cameroun',
    });
    assert.equal(organization.country, 'Cameroon');
    assert.equal(organization.defaultCurrency, 'XAF');
  });
});

import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { OrgsController } from './orgs.controller';
import { OrganizationPartnerTermsController } from './partner-terms.controller';
const httpTermsSignup = atomicPartnerSignupSubject();
const termsHttpSecret = 'synthetic-terms-consent-test-secret';
@Module({
  imports: [PassportModule, JwtModule.register({ secret: termsHttpSecret })],
  controllers: [OrgsController, OrganizationPartnerTermsController],
  providers: [
    JwtStrategy,
    CapabilitiesGuard,
    CapabilityResolverService,
    { provide: ConfigService, useValue: { getOrThrow: () => termsHttpSecret } },
    { provide: DatabaseService, useValue: httpTermsSignup.database },
    { provide: OrgsService, useValue: httpTermsSignup.service },
    { provide: PartnerTermsService, useValue: new PartnerTermsService(httpTermsSignup.database) },
  ],
})
class TermsAcceptanceHttpModule {}

describe('Exact displayed terms consent over HTTP', () => {
  it('requires a displayed digest, rejects stale signup and concurrent owner affirmation without writes, and accepts the canonical displayed copy', async () => {
    const previousMode = process.env.PARTNER_TERMS_PREVIEW_ENABLED;
    const previousEnvironment = process.env.NODE_ENV;
    process.env.PARTNER_TERMS_PREVIEW_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    const app = await NestFactory.create(TermsAcceptanceHttpModule, { logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
    );
    try {
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address();
      assert.ok(address && typeof address !== 'string');
      const base = `http://127.0.0.1:${address.port}/api/orgs`;
      const userId = randomUUID();
      const jwt = app.get(JwtService);
      const token = jwt.sign({ sub: userId, email: 'synthetic@example.test', sessionVersion: 0 });
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const input = {
        onboardingKey: randomUUID(),
        name: 'Synthetic HTTP Partner',
        type: 'media_partner',
        country: 'Benin',
        partnerTerms: affirmation,
      };
      const { expectedDigest: _digest, ...missingDigest } = affirmation;
      void _digest;
      assert.equal(
        (
          await fetch(base, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...input, partnerTerms: missingDigest }),
          })
        ).status,
        400,
      );
      const stale = await fetch(base, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...input,
          partnerTerms: { ...affirmation, expectedDigest: 'a'.repeat(64) },
        }),
      });
      assert.equal(stale.status, 409);
      assert.equal(
        ((await stale.json()) as { code: string }).code,
        'PARTNER_TERMS_CONTENT_CHANGED',
      );
      assert.equal(httpTermsSignup.rows(OrganizationEntity).length, 0);
      const accepted = await fetch(base, { method: 'POST', headers, body: JSON.stringify(input) });
      assert.equal(accepted.status, 201);
      const organization = (await accepted.json()) as { id: string };
      assert.equal(
        httpTermsSignup.rows(PartnerTermsAcceptanceEntity)[0]?.digest,
        affirmation.expectedDigest,
      );
      const orgHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt.sign({ sub: userId, email: 'synthetic@example.test', sessionVersion: 0, activeOrgId: organization.id })}`,
        'X-Org-Id': organization.id,
      };
      const outcomes = await Promise.all(
        [affirmation, { ...affirmation, expectedDigest: 'b'.repeat(64) }].map((body) =>
          fetch(`${base}/${organization.id}/partner-terms`, {
            method: 'POST',
            headers: orgHeaders,
            body: JSON.stringify(body),
          }),
        ),
      );
      assert.deepEqual(
        outcomes.map((response) => response.status),
        [201, 409],
      );
      assert.equal(httpTermsSignup.rows(PartnerTermsAcceptanceEntity).length, 1);
      assert.equal(
        httpTermsSignup
          .rows(AuditLogEntity)
          .filter((row) => row.action === 'partner_terms.preview_acknowledged').length,
        1,
      );
    } finally {
      await app.close();
      if (previousMode === undefined) delete process.env.PARTNER_TERMS_PREVIEW_ENABLED;
      else process.env.PARTNER_TERMS_PREVIEW_ENABLED = previousMode;
      if (previousEnvironment === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousEnvironment;
    }
  });
});

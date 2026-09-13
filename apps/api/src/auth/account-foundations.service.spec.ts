import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { DatabaseService } from '../common/database.service';
import type { RedisService } from '../common/redis.service';
import { Capability } from '../capabilities/capability.enum';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { assertOrgMatch } from '../orgs/orgs.controller';
import { CreateOrgDto, UpdateOrganizationSettingsDto } from '../orgs/dto/orgs.dto';
import { OrgsService } from '../orgs/orgs.service';
import { AuthService } from './auth.service';
import { hashToken } from './auth-helpers';
import { MembershipEntity } from './entities/membership.entity';
import { hasValidAvatarSignature, MeController } from './me.controller';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { UserEntity } from './entities/user.entity';

type FakeManager = { getRepository: (target: unknown) => unknown };

function createSerializedDatabase(repositoryFor: (target: unknown) => unknown): DatabaseService {
  let transactionTail = Promise.resolve();
  const database = {
    async repo(target: unknown) {
      return repositoryFor(target);
    },
    async transaction<T>(work: (manager: FakeManager) => Promise<T>) {
      const previous = transactionTail;
      let release: () => void = () => undefined;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await work({ getRepository: repositoryFor });
      } finally {
        release();
      }
    },
  };
  return database as unknown as DatabaseService;
}

function createSessionRaceSubject() {
  const rawToken = 'session-refresh-token';
  const user = {
    id: 'user-1',
    email: 'person@example.com',
    name: 'Person',
    status: 'active',
    sessionVersion: 0,
  } as UserEntity;
  const rows: RefreshTokenEntity[] = [
    {
      id: 'session-1',
      userId: user.id,
      tokenHash: hashToken(rawToken),
      familyId: '11111111-1111-4111-8111-111111111111',
      sessionVersion: 0,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    } as RefreshTokenEntity,
  ];
  const refreshRepo = {
    async findOne({ where }: { where: { tokenHash: string } }) {
      return rows.find((row) => row.tokenHash === where.tokenHash) ?? null;
    },
    async find() {
      return rows.filter((row) => !row.revokedAt && row.sessionVersion === user.sessionVersion);
    },
    async update(
      where: { familyId?: string; userId?: string },
      patch: Partial<RefreshTokenEntity>,
    ) {
      const matching = rows.filter(
        (row) =>
          !row.revokedAt &&
          (!where.familyId || row.familyId === where.familyId) &&
          (!where.userId || row.userId === where.userId),
      );
      for (const row of matching) Object.assign(row, patch);
      return { affected: matching.length };
    },
    create(input: Partial<RefreshTokenEntity>) {
      return { id: `session-${rows.length + 1}`, ...input } as RefreshTokenEntity;
    },
    async save(value: RefreshTokenEntity) {
      const existing = rows.findIndex((row) => row.id === value.id);
      if (existing >= 0) rows[existing] = value;
      else rows.push(value);
      return value;
    },
  };
  const usersRepo = {
    async findOne({ where }: { where: { id: string } }) {
      return where.id === user.id ? user : null;
    },
    async save(value: UserEntity) {
      return value;
    },
  };
  const memberships = {
    async findOne() {
      return null;
    },
  };
  const repositoryFor = (target: unknown) => {
    if (target === RefreshTokenEntity) return refreshRepo;
    if (target === UserEntity) return usersRepo;
    if (target === MembershipEntity) return memberships;
    throw new Error('unexpected entity');
  };
  let cacheMarker = '';
  const service = new AuthService(
    createSerializedDatabase(repositoryFor),
    {
      async signAsync() {
        return 'issued-access-token';
      },
    } as unknown as JwtService,
    {
      get(path: string) {
        return path === 'jwt.accessExpiresIn'
          ? '15m'
          : path === 'jwt.refreshExpiresIn'
            ? '7d'
            : undefined;
      },
    } as unknown as ConfigService,
    {
      instance: {
        async set(key: string) {
          cacheMarker = key;
        },
      },
    } as unknown as RedisService,
  );
  return { service, rawToken, rows, user, cacheMarker: () => cacheMarker };
}

describe('account foundations security boundaries', () => {
  it('accepts real avatar signatures and rejects MIME-only disguises', () => {
    assert.equal(
      hasValidAvatarSignature(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'),
      true,
    );
    assert.equal(
      hasValidAvatarSignature(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image/png',
      ),
      true,
    );
    assert.equal(hasValidAvatarSignature(Buffer.from('RIFFxxxxWEBP', 'ascii'), 'image/webp'), true);
    assert.equal(hasValidAvatarSignature(Buffer.from('<script>'), 'image/png'), false);
  });

  it('rejects a platform organization in HTTP validation and service code', async () => {
    const dto = Object.assign(new CreateOrgDto(), {
      name: 'Unapproved Platform',
      type: 'platform',
      country: 'Nigeria',
    });
    const errors = await validate(dto);
    assert.ok(errors.some((error) => error.property === 'type'));

    const service = new OrgsService(
      {
        repo: async () => {
          throw new Error('the service must reject before storage');
        },
      } as unknown as DatabaseService,
      {} as never,
      {} as never,
      {} as never,
    );
    await assert.rejects(
      () => service.createOrg('user-1', dto as unknown as CreateOrgDto),
      BadRequestException,
    );
  });

  it('trims required account fields before validation and rejects blank service input', async () => {
    const profileDto = plainToInstance(UpdateProfileDto, { name: '   ' });
    const createDto = plainToInstance(CreateOrgDto, {
      name: '   ',
      type: 'agency',
      country: '   ',
    });
    const settingsDto = plainToInstance(UpdateOrganizationSettingsDto, {
      name: '   ',
      country: '   ',
    });
    assert.equal(plainToInstance(UpdateProfileDto, { name: '  Ama Mensah  ' }).name, 'Ama Mensah');
    assert.equal(
      plainToInstance(CreateOrgDto, {
        name: '  Accra Outdoor  ',
        type: 'media_partner',
        country: '  Ghana  ',
      }).country,
      'Ghana',
    );
    assert.ok((await validate(profileDto)).some((error) => error.property === 'name'));
    const createErrors = await validate(createDto);
    assert.ok(createErrors.some((error) => error.property === 'name'));
    assert.ok(createErrors.some((error) => error.property === 'country'));
    const settingsErrors = await validate(settingsDto);
    assert.ok(settingsErrors.some((error) => error.property === 'name'));
    assert.ok(settingsErrors.some((error) => error.property === 'country'));

    const rejectingDb = {
      repo: async () => {
        throw new Error('blank input must be rejected before storage');
      },
    } as unknown as DatabaseService;
    const orgs = new OrgsService(rejectingDb, {} as never, {} as never, {} as never);
    await assert.rejects(
      () =>
        orgs.createOrg('user-1', {
          name: '   ',
          type: 'agency',
          country: 'Nigeria',
        }),
      BadRequestException,
    );
    await assert.rejects(
      () => orgs.updateSettings('org-1', { country: '   ' }, 'user-1'),
      BadRequestException,
    );

    const me = new MeController(rejectingDb, {} as never, {} as never, {} as never);
    await assert.rejects(
      () =>
        me.updateProfile(
          { userId: 'user-1', email: 'person@example.com', sessionVersion: 0 },
          { name: '   ' },
        ),
      BadRequestException,
    );
  });

  it('keeps the route organization equal to the authenticated context', () => {
    const request = {
      headers: { 'x-org-id': 'org-a' },
      user: {
        userId: 'user-1',
        email: 'person@example.com',
        activeOrgId: 'org-a',
        sessionVersion: 0,
      },
    };
    assert.doesNotThrow(() => assertOrgMatch(request as never, 'org-a'));
    assert.throws(() => assertOrgMatch(request as never, 'org-b'), ForbiddenException);
  });

  it('strips platform powers from non-platform context even if a role is supplied', () => {
    const resolver = new CapabilityResolverService();
    const capabilities = resolver.resolveScoped('platform_admin', [], 'agency');
    assert.equal(capabilities.has(Capability.PLATFORM_ADMIN), false);
    assert.equal(capabilities.has(Capability.AUDIT_VIEW), false);
  });

  it('increments a server-checked session version while revoking every refresh session', async () => {
    const user = {
      id: 'user-1',
      email: 'person@example.com',
      name: 'Person',
      status: 'active',
      sessionVersion: 0,
    } as UserEntity;
    const refreshRows: RefreshTokenEntity[] = [
      {
        id: 'session-1',
        userId: user.id,
        tokenHash: 'not-printed',
        familyId: '11111111-1111-4111-8111-111111111111',
        sessionVersion: 0,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      } as RefreshTokenEntity,
    ];
    const signedPayloads: Array<Record<string, unknown>> = [];
    const refreshRepo = {
      async find({ where }: { where: { userId: string } }) {
        return refreshRows.filter((row) => row.userId === where.userId && !row.revokedAt);
      },
      async update(where: { userId: string }, patch: Partial<RefreshTokenEntity>) {
        const matching = refreshRows.filter((row) => row.userId === where.userId && !row.revokedAt);
        for (const row of matching) Object.assign(row, patch);
        return { affected: matching.length };
      },
      create(input: Partial<RefreshTokenEntity>) {
        return input as RefreshTokenEntity;
      },
      async save(value: RefreshTokenEntity) {
        refreshRows.push(value);
        return value;
      },
    };
    const usersRepo = {
      async findOne({ where }: { where: { id: string } }) {
        return where.id === user.id ? user : null;
      },
      async save(value: UserEntity) {
        return value;
      },
    };
    const membershipRepo = {
      async findOne() {
        return {
          userId: user.id,
          organizationId: 'org-1',
          role: 'planner',
          status: 'active',
        } as MembershipEntity;
      },
    };
    const db = createSerializedDatabase((target) => {
      if (target === UserEntity) return usersRepo;
      if (target === RefreshTokenEntity) return refreshRepo;
      if (target === MembershipEntity) return membershipRepo;
      throw new Error('unexpected entity');
    });
    const jwt = {
      async signAsync(payload: Record<string, unknown>) {
        signedPayloads.push(payload);
        return 'issued-access-token';
      },
    };
    const cfg = {
      get(path: string) {
        if (path === 'jwt.accessExpiresIn') return '15m';
        if (path === 'jwt.refreshExpiresIn') return '7d';
        return undefined;
      },
    };
    const redis = { instance: { set: async () => undefined } };
    const service = new AuthService(
      db as unknown as DatabaseService,
      jwt as unknown as JwtService,
      cfg as unknown as ConfigService,
      redis as unknown as RedisService,
    );

    const issued = await service.issueTokens(user, 'org-1');
    assert.equal(issued.activeOrgId, 'org-1');
    assert.equal(signedPayloads[0]?.sessionVersion, 0);
    const result = await service.revokeAllSessions(user.id);
    assert.equal(result.revokedCount, 2);
    assert.equal(user.sessionVersion, 1);
    assert.ok(refreshRows.every((row) => row.revokedAt instanceof Date));

    await service.issueTokens(user, 'org-1');
    assert.equal(signedPayloads[1]?.sessionVersion, 1);
  });

  it('rotates one owned session when switching org and validates the target before revocation', async () => {
    const user = {
      id: 'user-1',
      email: 'person@example.com',
      name: 'Person',
      status: 'active',
      sessionVersion: 0,
    } as UserEntity;
    const current = {
      id: 'session-1',
      userId: user.id,
      tokenHash: hashToken('current-refresh-token'),
      familyId: '22222222-2222-4222-8222-222222222222',
      sessionVersion: 0,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    } as RefreshTokenEntity;
    const refreshRows = [current];
    const refreshRepo = {
      async findOne({ where }: { where: { tokenHash: string } }) {
        return refreshRows.find((row) => row.tokenHash === where.tokenHash) ?? null;
      },
      async update(where: { tokenHash: string }, patch: Partial<RefreshTokenEntity>) {
        const row = refreshRows.find(
          (candidate) => candidate.tokenHash === where.tokenHash && !candidate.revokedAt,
        );
        if (!row) return { affected: 0 };
        Object.assign(row, patch);
        return { affected: 1 };
      },
      create(input: Partial<RefreshTokenEntity>) {
        return input as RefreshTokenEntity;
      },
      async save(value: RefreshTokenEntity) {
        if (!refreshRows.includes(value)) refreshRows.push(value);
        return value;
      },
    };
    const db = createSerializedDatabase((target) => {
      if (target === RefreshTokenEntity) return refreshRepo;
      if (target === UserEntity) {
        return {
          async findOne() {
            return user;
          },
        };
      }
      if (target === MembershipEntity) {
        return {
          async findOne({ where }: { where: { organizationId: string } }) {
            return where.organizationId === 'org-2'
              ? { userId: user.id, organizationId: 'org-2', role: 'planner', status: 'active' }
              : null;
          },
        };
      }
      throw new Error('unexpected entity');
    });
    const service = new AuthService(
      db as unknown as DatabaseService,
      {
        async signAsync() {
          return 'issued-access-token';
        },
      } as unknown as JwtService,
      {
        get(path: string) {
          return path === 'jwt.accessExpiresIn'
            ? '15m'
            : path === 'jwt.refreshExpiresIn'
              ? '7d'
              : undefined;
        },
      } as unknown as ConfigService,
      { instance: { set: async () => undefined } } as unknown as RedisService,
    );

    await assert.rejects(
      () => service.switchOrganization(user.id, 'current-refresh-token', 'org-denied'),
      ForbiddenException,
    );
    assert.equal(current.revokedAt, undefined);
    await assert.rejects(
      () => service.switchOrganization('another-user', 'current-refresh-token', 'org-2'),
      UnauthorizedException,
    );
    assert.equal(current.revokedAt, undefined);

    const result = await service.switchOrganization(user.id, 'current-refresh-token', 'org-2', {
      userAgent: 'QA browser',
    });
    assert.equal(result.activeOrgId, 'org-2');
    assert.notEqual(current.revokedAt, undefined);
    const active = refreshRows.filter((row) => !row.revokedAt);
    assert.equal(active.length, 1);
    assert.equal(active[0]?.userAgent, 'QA browser');
  });

  it('allows only one replacement when the same refresh token is redeemed concurrently', async () => {
    const subject = createSessionRaceSubject();
    const outcomes = await Promise.allSettled([
      subject.service.refresh({ refreshToken: subject.rawToken }),
      subject.service.refresh({ refreshToken: subject.rawToken }),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    assert.ok(rejected && rejected.status === 'rejected');
    assert.ok(rejected.reason instanceof UnauthorizedException);
    assert.equal(subject.rows.filter((row) => !row.revokedAt).length, 1);
    assert.equal(new Set(subject.rows.map((row) => row.familyId)).size, 1);
  });

  it('revokes a rotated successor when logout races with refresh', async () => {
    const subject = createSessionRaceSubject();
    const [rotation] = await Promise.all([
      subject.service.refresh({ refreshToken: subject.rawToken }),
      subject.service.logout(subject.rawToken),
    ]);
    assert.ok(subject.rows.every((row) => row.revokedAt instanceof Date));
    await assert.rejects(
      () => subject.service.refresh({ refreshToken: rotation.refreshToken }),
      UnauthorizedException,
    );
  });

  it('invalidates a rotated successor when global revocation races with refresh', async () => {
    const subject = createSessionRaceSubject();
    const [rotation, revoked] = await Promise.all([
      subject.service.refresh({ refreshToken: subject.rawToken }),
      subject.service.revokeAllSessions(subject.user.id),
    ]);
    assert.equal(revoked.revokedCount, 1);
    assert.equal(subject.user.sessionVersion, 1);
    assert.ok(subject.rows.every((row) => row.revokedAt instanceof Date));
    await assert.rejects(
      () => subject.service.refresh({ refreshToken: rotation.refreshToken }),
      UnauthorizedException,
    );
  });

  it('rejects a refresh token bound to an earlier session version', async () => {
    const subject = createSessionRaceSubject();
    subject.user.sessionVersion = 1;
    await assert.rejects(
      () => subject.service.refresh({ refreshToken: subject.rawToken }),
      UnauthorizedException,
    );
    assert.equal(subject.rows.length, 1);
  });

  it('revokes a presented refresh-token family without depending on an access JWT', async () => {
    const subject = createSessionRaceSubject();
    await subject.service.logout(subject.rawToken);
    assert.ok(subject.rows[0]?.revokedAt instanceof Date);
    assert.match(subject.cacheMarker(), /^revoked:rt:/);
    await assert.doesNotReject(() => subject.service.logout('already-missing'));
  });
});

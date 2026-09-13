import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { IsNull } from 'typeorm';
import type { EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { DatabaseService } from '../common/database.service';
import { RedisService } from '../common/redis.service';
import type { OrganizationRole } from '../capabilities/organization-roles';
import { MembershipEntity } from './entities/membership.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { UserEntity } from './entities/user.entity';
import type { JwtPayload } from './jwt-payload';
import { hashToken, parseDurationMs, sanitizeUser } from './auth-helpers';
import type { RefreshDto } from './dto/refresh.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  activeOrgId?: string;
}
export interface AuthResult extends TokenPair {
  user: ReturnType<typeof sanitizeUser>;
}

export interface SessionMetadata {
  userAgent?: string;
  ip?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async refresh(dto: RefreshDto, metadata?: SessionMetadata): Promise<AuthResult> {
    return this.rotateRefreshToken(dto.refreshToken, dto.activeOrgId, metadata);
  }

  /**
   * Rotate the signed-in user's current refresh token while changing organization
   * context. A switch remains one browser session rather than creating a second
   * session, and the returned pair carries the context needed by later refreshes.
   */
  async switchOrganization(
    userId: string,
    refreshToken: string,
    organizationId: string,
    metadata?: SessionMetadata,
  ): Promise<AuthResult> {
    return this.rotateRefreshToken(refreshToken, organizationId, metadata, userId);
  }

  /**
   * Revoke the presented refresh token. Possession of the high-entropy token is
   * sufficient for this one-way operation, so logout still works after the
   * short-lived access JWT expires.
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.db.transaction(async (manager) => {
      const refreshTokens = manager.getRepository(RefreshTokenEntity);
      const candidate = await refreshTokens.findOne({ where: { tokenHash } });
      if (!candidate) return;

      // Use the same user-row lock as rotation and global revocation. If a
      // rotation committed first, revoking the family also catches its successor.
      const users = manager.getRepository(UserEntity);
      await users.findOne({
        where: { id: candidate.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const record = await refreshTokens.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (!record) return;
      await refreshTokens.update(
        { familyId: record.familyId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    });
    await this.redis.instance
      .set(`revoked:rt:${tokenHash}`, '1', 'EX', 7 * 24 * 3600)
      .catch(() => undefined);
  }

  /**
   * Revoke every refresh token and invalidate every issued access token for a user.
   * New sessions receive the incremented version, so this endpoint cannot be a
   * cosmetic UI toggle while existing JWTs remain accepted.
   */
  async revokeAllSessions(userId: string): Promise<{ revokedCount: number }> {
    return this.db.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity);
      const user = await users.findOne({
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new UnauthorizedException('User not found');

      const refreshTokens = manager.getRepository(RefreshTokenEntity);
      const revoked = await refreshTokens.update(
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      user.sessionVersion += 1;
      await users.save(user);
      return { revokedCount: revoked.affected ?? 0 };
    });
  }

  async listActiveSessions(userId: string) {
    const users = await this.db.repo(UserEntity);
    const user = await users.findOne({ where: { id: userId } });
    if (!user) return [];
    const refreshTokens = await this.db.repo(RefreshTokenEntity);
    const now = new Date();
    const records = await refreshTokens.find({
      where: { userId, sessionVersion: user.sessionVersion, revokedAt: IsNull() },
    });
    return records
      .filter((record) => record.expiresAt.getTime() > now.getTime())
      .map((record) => ({
        id: record.id,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        userAgent: record.userAgent,
        ip: record.ip,
      }));
  }

  async issueTokens(
    user: UserEntity,
    requestedOrgId?: string,
    metadata?: SessionMetadata,
  ): Promise<AuthResult> {
    return this.issueTokenFamily(user, requestedOrgId, randomUUID(), metadata);
  }

  private repository<T extends ObjectLiteral>(
    target: EntityTarget<T>,
    manager?: EntityManager,
  ): Promise<Repository<T>> {
    return manager ? Promise.resolve(manager.getRepository(target)) : this.db.repo(target);
  }

  private async issueTokenFamily(
    user: UserEntity,
    requestedOrgId: string | undefined,
    familyId: string,
    metadata?: SessionMetadata,
    manager?: EntityManager,
  ): Promise<AuthResult> {
    const { organizationId: activeOrgId, role } = await this.resolveActiveOrg(
      user.id,
      requestedOrgId,
      manager,
    );
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      activeOrgId,
      role,
      sessionVersion: user.sessionVersion,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: Math.round(
        parseDurationMs(this.cfg.get<string>('jwt.accessExpiresIn') ?? '15m') / 1000,
      ),
    });
    const refreshToken = randomUUID();
    const refreshRepo = await this.repository(RefreshTokenEntity, manager);
    const expiresAt = new Date(
      Date.now() + parseDurationMs(this.cfg.get<string>('jwt.refreshExpiresIn') ?? '7d'),
    );
    await refreshRepo.save(
      refreshRepo.create({
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        familyId,
        sessionVersion: user.sessionVersion,
        expiresAt,
        userAgent: normalizeMetadata(metadata?.userAgent, 512),
        ip: normalizeMetadata(metadata?.ip, 128),
      }),
    );
    return { accessToken, refreshToken, activeOrgId, user: sanitizeUser(user) };
  }

  /**
   * Validate and rotate within one transaction. The shared user-row lock
   * serializes rotation with family logout and global revocation; the token lock
   * ensures only one request can consume the current family member.
   */
  private async rotateRefreshToken(
    refreshToken: string,
    requestedOrgId?: string,
    metadata?: SessionMetadata,
    expectedUserId?: string,
  ): Promise<AuthResult> {
    const tokenHash = hashToken(refreshToken);
    return this.db.transaction(async (manager) => {
      const refreshTokens = manager.getRepository(RefreshTokenEntity);
      const candidate = await refreshTokens.findOne({ where: { tokenHash } });
      if (!candidate || (expectedUserId !== undefined && candidate.userId !== expectedUserId)) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Lock order is user then token across rotation, logout, and global revoke.
      const users = manager.getRepository(UserEntity);
      const user = await users.findOne({
        where: { id: candidate.userId },
        lock: { mode: 'pessimistic_write' },
      });
      const record = await refreshTokens.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();
      if (
        !user ||
        user.status !== 'active' ||
        !record ||
        record.userId !== user.id ||
        record.sessionVersion !== user.sessionVersion ||
        record.revokedAt ||
        record.expiresAt.getTime() <= now.getTime()
      ) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Validate organization context before consuming the current family member.
      await this.resolveActiveOrg(user.id, requestedOrgId, manager);
      record.revokedAt = now;
      await refreshTokens.save(record);
      return this.issueTokenFamily(user, requestedOrgId, record.familyId, metadata, manager);
    });
  }

  private async resolveActiveOrg(
    userId: string,
    requestedOrgId?: string,
    manager?: EntityManager,
  ): Promise<{ organizationId?: string; role?: OrganizationRole }> {
    const memberships = await this.repository(MembershipEntity, manager);
    if (requestedOrgId) {
      const membership = await memberships.findOne({
        where: { userId, organizationId: requestedOrgId, status: 'active' },
      });
      if (!membership)
        throw new ForbiddenException('No active membership in the target organization');
      return {
        organizationId: membership.organizationId,
        role: membership.role as OrganizationRole,
      };
    }

    const firstMembership = await memberships.findOne({ where: { userId, status: 'active' } });
    return firstMembership
      ? {
          organizationId: firstMembership.organizationId,
          role: firstMembership.role as OrganizationRole,
        }
      : {};
  }
}

function normalizeMetadata(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

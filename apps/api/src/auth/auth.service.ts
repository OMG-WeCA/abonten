import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
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
}
export interface AuthResult extends TokenPair {
  user: ReturnType<typeof sanitizeUser>;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async refresh(dto: RefreshDto): Promise<AuthResult> {
    const tokenHash = hashToken(dto.refreshToken);
    const repo = await this.db.repo(RefreshTokenEntity);
    const rec = await repo.findOne({ where: { tokenHash } });
    const now = new Date();
    if (!rec || rec.revokedAt || rec.expiresAt.getTime() < now.getTime()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    rec.revokedAt = now;
    await repo.save(rec);
    const users = await this.db.repo(UserEntity);
    const user = await users.findOne({ where: { id: rec.userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return this.issueTokens(user, dto.activeOrgId);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    const repo = await this.db.repo(RefreshTokenEntity);
    const rec = await repo.findOne({ where: { tokenHash } });
    if (rec && !rec.revokedAt) {
      rec.revokedAt = new Date();
      await repo.save(rec);
    }
    await this.redis.instance.set(`revoked:rt:${tokenHash}`, '1', 'EX', 7 * 24 * 3600).catch(() => undefined);
  }

  async issueTokens(user: UserEntity, activeOrgId?: string): Promise<AuthResult> {
    let role: OrganizationRole | undefined;
    if (activeOrgId) {
      const memberships = await this.db.repo(MembershipEntity);
      const m = await memberships.findOne({
        where: { userId: user.id, organizationId: activeOrgId, status: 'active' },
      });
      if (!m) throw new ForbiddenException('No active membership in the target organization');
      role = m.role as OrganizationRole;
    }
    const payload: JwtPayload = { sub: user.id, email: user.email, activeOrgId, role };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: Math.round(parseDurationMs(this.cfg.get<string>('jwt.accessExpiresIn') ?? '15m') / 1000),
    });
    const refreshToken = randomUUID();
    const refreshRepo = await this.db.repo(RefreshTokenEntity);
    const expiresAt = new Date(
      Date.now() + parseDurationMs(this.cfg.get<string>('jwt.refreshExpiresIn') ?? '7d'),
    );
    await refreshRepo.save(refreshRepo.create({ userId: user.id, tokenHash: hashToken(refreshToken), expiresAt }));
    return { accessToken, refreshToken, user: sanitizeUser(user) };
  }
}

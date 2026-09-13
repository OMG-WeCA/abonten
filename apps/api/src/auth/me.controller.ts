import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Patch,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {} from 'multer';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../common/database.service';
import { StorageService } from '../common/storage.service';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { MembershipEntity } from './entities/membership.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { UserCapabilityOverrideEntity } from './entities/user-capability-override.entity';
import { UserEntity } from './entities/user.entity';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user';
import type { Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SwitchOrgDto } from './dto/switch-org.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthService } from './auth.service';
import { Capability } from '../capabilities/capability.enum';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';

const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

@ApiTags('me')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.ME_VIEW)
@Controller('me')
export class MeController {
  constructor(
    private readonly db: DatabaseService,
    private readonly resolver: CapabilityResolverService,
    private readonly auth: AuthService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current user + active org + effective capabilities' })
  async me(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    return this.withCapabilities(user, req.headers['x-org-id'] as string | undefined);
  }

  @RequireCapabilities(Capability.ME_EDIT)
  @Patch()
  @ApiOperation({ summary: 'Update my profile, language, and timezone' })
  async updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) {
      throw new BadRequestException('Name is required');
    }

    const users = await this.db.repo(UserEntity);
    const account = await users.findOne({ where: { id: user.userId } });
    if (!account) throw new NotFoundException('User not found');
    const before = profileValues(account);
    if (name !== undefined) account.name = name;
    if (dto.phone !== undefined) account.phone = dto.phone.trim() || undefined;
    if (dto.locale !== undefined) account.locale = dto.locale;
    if (dto.timezone !== undefined) account.timezone = dto.timezone;
    const saved = await users.save(account);
    await this.recordAudit(
      user.userId,
      undefined,
      'account.profile.updated',
      'user',
      user.userId,
      before,
      profileValues(saved),
    );
    return publicUser(saved);
  }

  @RequireCapabilities(Capability.ME_EDIT)
  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload or replace my profile photo' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AVATAR_BYTES } }))
  async uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (
      !file ||
      !AVATAR_TYPES.has(file.mimetype) ||
      !hasValidAvatarSignature(file.buffer, file.mimetype)
    ) {
      throw new BadRequestException('Choose a PNG, JPEG, or WebP profile photo under 5 MB');
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Profile photo must be under 5 MB');
    }
    const users = await this.db.repo(UserEntity);
    const account = await users.findOne({ where: { id: user.userId } });
    if (!account) throw new NotFoundException('User not found');

    const ref = `avatars/${account.id}/${randomUUID()}.${avatarExtension(file.mimetype)}`;
    await this.storage.store(ref, file.buffer, file.mimetype);
    const previousRef = account.avatarRef;
    account.avatarRef = ref;
    account.avatarContentType = file.mimetype;
    await users.save(account);
    if (previousRef) await this.storage.remove(previousRef);
    await this.recordAudit(
      user.userId,
      undefined,
      'account.avatar.updated',
      'user',
      user.userId,
      null,
      {
        hasAvatar: true,
      },
    );
    return { hasAvatar: true };
  }

  @Get('avatar')
  @ApiOperation({ summary: 'Read my profile photo' })
  async avatar(@CurrentUser() user: AuthenticatedUser) {
    const users = await this.db.repo(UserEntity);
    const account = await users.findOne({ where: { id: user.userId } });
    if (!account?.avatarRef) throw new NotFoundException('Profile photo not found');
    try {
      const contents = await this.storage.read(account.avatarRef);
      return new StreamableFile(contents, {
        type: account.avatarContentType ?? 'application/octet-stream',
      });
    } catch {
      throw new NotFoundException('Profile photo not found');
    }
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List my active passwordless sign-in sessions' })
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listActiveSessions(user.userId);
  }

  @RequireCapabilities(Capability.ME_EDIT)
  @Post('sessions/revoke-all')
  @ApiOperation({ summary: 'Revoke every sign-in session, including this one' })
  async revokeAllSessions(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.auth.revokeAllSessions(user.userId);
    await this.recordAudit(
      user.userId,
      undefined,
      'account.sessions.revoked_all',
      'user',
      user.userId,
      null,
      result,
    );
    return { ...result, signedOut: true };
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'Effective capabilities for the current org context' })
  async capabilities(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const { role, capabilities } = await this.withCapabilities(
      user,
      req.headers['x-org-id'] as string | undefined,
    );
    return { role, capabilities, activeOrgId: user.activeOrgId };
  }

  @Get('organizations')
  @ApiOperation({ summary: 'Organizations the user belongs to' })
  async organizations(@CurrentUser() user: AuthenticatedUser) {
    const memberships = await this.db.repo(MembershipEntity);
    const rows = await memberships.find({ where: { userId: user.userId, status: 'active' } });
    const orgs = await this.db.repo(OrganizationEntity);
    const out: Array<{
      organizationId: string;
      role: string;
      name: string;
      type: string;
      country: string;
      defaultCurrency: string;
      defaultLocale: string;
    }> = [];
    for (const membership of rows) {
      const org = await orgs.findOne({ where: { id: membership.organizationId } });
      if (org) {
        out.push({
          organizationId: membership.organizationId,
          role: membership.role,
          name: org.name,
          type: org.type,
          country: org.country,
          defaultCurrency: org.defaultCurrency,
          defaultLocale: org.defaultLocale,
        });
      }
    }
    return out;
  }

  @Post('switch-org')
  @ApiOperation({ summary: 'Switch the active organization context (re-issues a JWT)' })
  async switchOrg(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchOrgDto,
    @Req() req: Request,
  ) {
    // Verify active membership before rotating the caller's current browser session.
    const memberships = await this.db.repo(MembershipEntity);
    const membership = await memberships.findOne({
      where: { userId: user.userId, organizationId: dto.organizationId, status: 'active' },
    });
    if (!membership) {
      throw new ForbiddenException('No active membership in the target organization');
    }
    return this.auth.switchOrganization(
      user.userId,
      dto.refreshToken,
      dto.organizationId,
      requestSessionMetadata(req),
    );
  }

  private async withCapabilities(
    user: AuthenticatedUser,
    headerOrgId?: string,
  ): Promise<{
    user: ReturnType<typeof publicUser> | null;
    activeOrgId?: string;
    role?: string;
    capabilities: Capability[];
  }> {
    const users = await this.db.repo(UserEntity);
    const account = await users.findOne({ where: { id: user.userId } });
    // X-Org-Id is authoritative when supplied (consistent with the guard);
    // activeOrgId is the fallback only when the header is absent.
    const orgId = headerOrgId ?? user.activeOrgId;
    let role: string | undefined;
    let capabilities: Capability[] = [];
    if (orgId) {
      const memberships = await this.db.repo(MembershipEntity);
      const membership = await memberships.findOne({
        where: { userId: user.userId, organizationId: orgId, status: 'active' },
      });
      if (membership) {
        role = membership.role;
        const overrides = await this.db
          .repo(UserCapabilityOverrideEntity)
          .then((repo) => repo.find({ where: { userId: user.userId, organizationId: orgId } }))
          .catch(() => []);
        const org = await this.db
          .repo(OrganizationEntity)
          .then((repo) => repo.findOne({ where: { id: orgId } }))
          .catch(() => null);
        capabilities = [
          ...this.resolver.resolveScoped(membership.role as never, overrides, org?.type),
        ];
      }
    }
    return {
      user: account ? publicUser(account) : null,
      activeOrgId: orgId,
      role,
      capabilities,
    };
  }

  private async recordAudit(
    actorUserId: string,
    actorOrgId: string | undefined,
    action: string,
    entityType: string,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
  ): Promise<void> {
    const audit = await this.db.repo(AuditLogEntity);
    await audit.save(
      audit.create({ actorUserId, actorOrgId, action, entityType, entityId, before, after }),
    );
  }
}

function publicUser(user: UserEntity) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    locale: user.locale,
    timezone: user.timezone,
    status: user.status,
    hasAvatar: Boolean(user.avatarRef),
  };
}

function profileValues(user: UserEntity) {
  return {
    name: user.name,
    phone: user.phone ?? null,
    locale: user.locale,
    timezone: user.timezone,
  };
}

function avatarExtension(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

export function hasValidAvatarSignature(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  return false;
}

function requestSessionMetadata(req: Request) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0];
  return {
    userAgent: req.get('user-agent') ?? undefined,
    ip: forwardedIp?.trim() || req.ip,
  };
}

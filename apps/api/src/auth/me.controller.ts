import { Body, Controller, ForbiddenException, Get, NotFoundException, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../common/database.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { MembershipEntity } from './entities/membership.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { UserCapabilityOverrideEntity } from './entities/user-capability-override.entity';
import { UserEntity } from './entities/user.entity';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './authenticated-user';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SwitchOrgDto } from './dto/switch-org.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AuthService } from './auth.service';
import { Capability } from '../capabilities/capability.enum';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';

@ApiTags('me')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.ME_VIEW)
@Controller('me')
export class MeController {
  constructor(
    private readonly db: DatabaseService,
    private readonly resolver: CapabilityResolverService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current user + active org + effective capabilities' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.withCapabilities(user);
  }

  @RequireCapabilities(Capability.ME_EDIT)
  @Patch()
  @ApiOperation({ summary: 'Update my profile (name, phone, locale)' })
  async updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    const users = await this.db.repo(UserEntity);
    const u = await users.findOne({ where: { id: user.userId } });
    if (!u) throw new NotFoundException('User not found');
    if (dto.name !== undefined) u.name = dto.name;
    if (dto.phone !== undefined) u.phone = dto.phone;
    if (dto.locale !== undefined) u.locale = dto.locale;
    await users.save(u);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone,
      locale: u.locale,
      status: u.status,
    };
  }

  @Get('capabilities')
  @ApiOperation({ summary: 'Effective capabilities for the current org context' })
  async capabilities(@CurrentUser() user: AuthenticatedUser) {
    const { role, capabilities } = await this.withCapabilities(user);
    return { role, capabilities, activeOrgId: user.activeOrgId };
  }

  @Get('organizations')
  @ApiOperation({ summary: 'Organizations the user belongs to' })
  async organizations(@CurrentUser() user: AuthenticatedUser) {
    const memberships = await this.db.repo(MembershipEntity);
    const rows = await memberships.find({ where: { userId: user.userId, status: 'active' } });
    const orgs = await this.db.repo(OrganizationEntity);
    const out: Array<{ organizationId: string; role: string; name: string; type: string }> = [];
    for (const m of rows) {
      const org = await orgs.findOne({ where: { id: m.organizationId } });
      out.push({ organizationId: m.organizationId, role: m.role, name: org?.name ?? '', type: org?.type ?? '' });
    }
    return out;
  }

  @Post('switch-org')
  @ApiOperation({ summary: 'Switch the active organization context (re-issues a JWT)' })
  async switchOrg(@CurrentUser() user: AuthenticatedUser, @Body() dto: SwitchOrgDto) {
    const users = await this.db.repo(UserEntity);
    const u = await users.findOne({ where: { id: user.userId } });
    if (!u) throw new NotFoundException('User not found');
    // Verify active membership in the target org before issuing a JWT for it.
    const memberships = await this.db.repo(MembershipEntity);
    const membership = await memberships.findOne({
      where: { userId: user.userId, organizationId: dto.organizationId, status: 'active' },
    });
    if (!membership) {
      throw new ForbiddenException('No active membership in the target organization');
    }
    return this.auth.issueTokens(u, dto.organizationId);
  }

  private async withCapabilities(user: AuthenticatedUser): Promise<{
    user: { id: string; email: string; name: string; phone?: string; locale: string; status: string } | null;
    activeOrgId?: string;
    role?: string;
    capabilities: Capability[];
  }> {
    const users = await this.db.repo(UserEntity);
    const u = await users.findOne({ where: { id: user.userId } });
    const orgId = user.activeOrgId;
    let role: string | undefined;
    let capabilities: Capability[] = [];
    if (orgId) {
      const memberships = await this.db.repo(MembershipEntity);
      const m = await memberships.findOne({ where: { userId: user.userId, organizationId: orgId } });
      if (m) {
        role = m.role;
        const overrides = await this.db
          .repo(UserCapabilityOverrideEntity)
          .then((r) => r.find({ where: { userId: user.userId, organizationId: orgId } }))
          .catch(() => []);
        capabilities = [...this.resolver.resolve(m.role as never, overrides)];
      }
    }
    return {
      user: u ? { id: u.id, email: u.email, name: u.name, phone: u.phone, locale: u.locale, status: u.status } : null,
      activeOrgId: orgId,
      role,
      capabilities,
    };
  }
}
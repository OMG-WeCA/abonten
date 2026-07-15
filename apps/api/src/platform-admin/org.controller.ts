import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { InviteDto } from './dto/invite.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { PlatformAdminService } from './platform-admin.service';

function orgContext(req: Request & { user?: AuthenticatedUser }): string | undefined {
  const header = req.headers['x-org-id'] as string | undefined;
  return header ?? req.user?.activeOrgId;
}

@ApiTags('org')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.MEMBERSHIP_MANAGE)
@Controller('org/users')
export class OrgController {
  constructor(private readonly svc: PlatformAdminService) {}

  @Get()
  @ApiOperation({ summary: 'List users in the active organization' })
  async list(@Req() req: Request & { user?: AuthenticatedUser }) {
    const orgId = orgContext(req);
    if (!orgId) return [];
    return this.svc.listOrgUsers(orgId);
  }

  @Post('invite')
  @ApiOperation({ summary: 'Invite a user to the active organization' })
  async invite(
    @Body() dto: InviteDto,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const orgId = orgContext(req);
    if (!orgId) return { error: 'no active organization' };
    return this.svc.invite(orgId, dto, req.user?.userId ?? '');
  }

  @Patch(':userId/membership')
  @ApiOperation({ summary: 'Change a user role within the active organization' })
  async updateMembership(
    @Param('userId') userId: string,
    @Body() dto: UpdateMembershipDto,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const orgId = orgContext(req);
    if (!orgId) return { error: 'no active organization' };
    return this.svc.updateMembership(orgId, userId, dto.role);
  }
}

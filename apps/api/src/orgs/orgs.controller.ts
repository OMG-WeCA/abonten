import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import {
  CreateOrgDto,
  InviteUserDto,
  UpdateOrganizationSettingsDto,
  UpdateOrgMemberDto,
} from './dto/orgs.dto';
import { OrgsService } from './orgs.service';

type AuthReq = Request & { user?: AuthenticatedUser };

function orgContext(req: AuthReq): string | undefined {
  const header = req.headers['x-org-id'] as string | undefined;
  return header ?? req.user?.activeOrgId;
}

// The CapabilitiesGuard checks membership in the X-Org-Id (or JWT activeOrg) org.
// For /orgs/:orgId/... routes, ensure the URL org matches that context so a user
// can't pass a different X-Org-Id (where they have MEMBERSHIP_MANAGE) to act on
// another org in the URL.
export function assertOrgMatch(req: AuthReq, orgId: string): void {
  if (orgId !== orgContext(req)) {
    throw new ForbiddenException('Organization context does not match the URL');
  }
}

@ApiTags('orgs')
@Controller('orgs')
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.ORG_CREATE)
  @Post()
  @ApiOperation({ summary: 'Create a new organization (creator becomes org_owner)' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateOrgDto) {
    return this.orgs.createOrg(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.ORG_VIEW)
  @Get('me')
  @ApiOperation({ summary: 'Organizations the current user belongs to' })
  async myOrgs(@CurrentUser() user: AuthenticatedUser) {
    return this.orgs.listMyOrgs(user.userId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.ORG_SETTINGS_EDIT)
  @Patch(':orgId')
  @ApiOperation({ summary: 'Update the active organization’s current settings' })
  async updateSettings(
    @Param('orgId') orgId: string,
    @Body() dto: UpdateOrganizationSettingsDto,
    @Req() req: AuthReq,
  ) {
    assertOrgMatch(req, orgId);
    return this.orgs.updateSettings(orgId, dto, req.user?.userId ?? '');
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.MEMBERSHIP_MANAGE)
  @Get(':orgId/members')
  @ApiOperation({ summary: 'List members of an organization' })
  async members(@Param('orgId') orgId: string, @Req() req: AuthReq) {
    assertOrgMatch(req, orgId);
    return this.orgs.listMembers(orgId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.MEMBERSHIP_MANAGE)
  @Post(':orgId/invite')
  @ApiOperation({ summary: 'Invite a user to an organization by email (sends a sign-in code)' })
  async invite(@Param('orgId') orgId: string, @Body() dto: InviteUserDto, @Req() req: AuthReq) {
    assertOrgMatch(req, orgId);
    return this.orgs.invite(orgId, dto, req.user?.userId ?? '');
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.MEMBERSHIP_MANAGE)
  @Patch(':orgId/memberships/:userId')
  @ApiOperation({ summary: "Change a member's role" })
  async updateMembership(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateOrgMemberDto,
    @Req() req: AuthReq,
  ) {
    assertOrgMatch(req, orgId);
    return this.orgs.updateMembership(orgId, userId, dto.role, req.user?.userId ?? '');
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.MEMBERSHIP_MANAGE)
  @Delete(':orgId/memberships/:userId')
  @ApiOperation({ summary: 'Remove a member from an organization' })
  async removeMember(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @Req() req: AuthReq,
  ) {
    assertOrgMatch(req, orgId);
    return this.orgs.removeMember(orgId, userId, req.user?.userId ?? '');
  }
}

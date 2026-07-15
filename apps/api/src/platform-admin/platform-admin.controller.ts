import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CapabilityOverrideDto } from './dto/capability-override.dto';
import { PlatformAdminService } from './platform-admin.service';
import type { Request } from 'express';

function orgContext(req: Request & { user?: AuthenticatedUser }): string | undefined {
  const header = req.headers['x-org-id'] as string | undefined;
  return header ?? req.user?.activeOrgId;
}

@ApiTags('admin')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.USER_MANAGE)
@Controller('admin/users')
export class PlatformAdminController {
  constructor(private readonly svc: PlatformAdminService) {}

  @Get(':userId/capabilities')
  @ApiOperation({ summary: 'List a user effective capabilities + overrides in an org' })
  async list(@Param('userId') userId: string, @Req() req: Request & { user?: AuthenticatedUser }) {
    const orgId = orgContext(req);
    if (!orgId) return { error: 'no active organization' };
    return this.svc.getCapabilities(userId, orgId);
  }

  @Post(':userId/capabilities')
  @ApiOperation({ summary: 'Add/replace a capability override (grant/revoke)' })
  async set(
    @Param('userId') userId: string,
    @Body() dto: CapabilityOverrideDto,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const orgId = orgContext(req);
    if (!orgId) return { error: 'no active organization' };
    return this.svc.setOverride(userId, orgId, dto, req.user?.userId ?? '');
  }

  @Delete(':userId/capabilities/:capability')
  @ApiOperation({ summary: 'Remove a capability override' })
  async remove(
    @Param('userId') userId: string,
    @Param('capability') capability: string,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    const orgId = orgContext(req);
    if (!orgId) return { error: 'no active organization' };
    return this.svc.removeOverride(userId, orgId, capability);
  }
}

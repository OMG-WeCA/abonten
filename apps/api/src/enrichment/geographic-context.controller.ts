import { Controller, Get, Header, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { SiteGeographicContext } from '@abonten/contracts/enrichment';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireAnyCapabilities } from '../capabilities/require-capabilities.decorator';
import { GeographicContextService } from './geographic-context.service';
import { geographicContextSchema } from './geographic-context.openapi';

@ApiTags('geographic-context')
@Controller('inventory/sites')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
export class GeographicContextController {
  constructor(private readonly service: GeographicContextService) {}

  @Get(':id/geographic-context')
  @Header('Cache-Control', 'private, no-store')
  @RequireAnyCapabilities(
    Capability.INVENTORY_VIEW,
    Capability.MARKETPLACE_VIEW,
    Capability.PLATFORM_ADMIN,
  )
  @ApiOperation({
    summary: 'Production geographic context for an authorized site; never audience/reach',
    description:
      'Returns 250/500/1000m catchments with per-metric provenance. Missing/partial coverage is explicit. Only owners, platform admins, or marketplace viewers of a listed site may read it. No request coordinates or remote URLs are accepted.',
  })
  @ApiOkResponse({
    schema: geographicContextSchema,
    description:
      'SiteGeographicContext contract in @abonten/contracts: nearestRoad, administrative, catchments (mapped POIs and modelled residents), traffic; every metric contains nullable value, status, method, warnings, provenance.',
  })
  async getContext(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SiteGeographicContext> {
    const org = req.headers['x-org-id'];
    return this.service.getSiteContext(user, typeof org === 'string' ? org : user.activeOrgId, id);
  }
}

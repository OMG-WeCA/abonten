import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceQueryDto } from './dto/marketplace.dto';

@ApiTags('marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  // Marketplace inventory is shared only with authenticated buyers. It is never a
  // public catalog: site detail includes faces, assets, enrichment, and rate cards.
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.MARKETPLACE_VIEW)
  @Get()
  @ApiOperation({ summary: 'Search listed marketplace sites' })
  async search(@Query() q: MarketplaceQueryDto, @Req() req: Request & { user: AuthenticatedUser }) {
    return this.service.search(q, undefined, this.org(req));
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.MARKETPLACE_VIEW)
  @Get(':siteId')
  @ApiOperation({ summary: 'Authenticated buyer detail for a listed site' })
  async getSite(
    @Param('siteId') siteId: string,
    @Req() req: Request & { user: AuthenticatedUser },
  ) {
    return this.service.getMarketplaceSite(siteId, undefined, this.org(req));
  }
  private org(req: Request & { user: AuthenticatedUser }) {
    const header = req.headers['x-org-id'];
    return typeof header === 'string' ? header : req.user.activeOrgId;
  }
}

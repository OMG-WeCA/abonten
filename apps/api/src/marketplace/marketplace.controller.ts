import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceQueryDto } from './dto/marketplace.dto';

@ApiTags('marketplace')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.MARKETPLACE_VIEW)
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  @Get()
  @ApiOperation({ summary: 'Search listed sites available for booking' })
  async search(@Query() q: MarketplaceQueryDto) {
    return this.service.search(q);
  }

  @Get(':siteId')
  @ApiOperation({ summary: 'Public detail of a listed site' })
  async getSite(@Param('siteId') siteId: string) {
    return this.service.getPublicSite(siteId);
  }
}
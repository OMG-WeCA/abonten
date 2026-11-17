import { Body, Controller, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { TravelDemandScenarioDto, TravelDemandScenarioResponse } from './dto/travel-demand.dto';
import { TravelDemandService } from './travel-demand.service';

@ApiTags('planning-v1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.CAMPAIGN_CREATE, Capability.MARKETPLACE_VIEW)
@ApiResponse({ status: 401, description: 'Valid signed-in session required' })
@ApiResponse({
  status: 403,
  description: 'Organization membership and marketplace + campaign-create capabilities required',
})
@Controller('planning/v1/travel-demand')
export class TravelDemandController {
  constructor(private readonly travelDemand: TravelDemandService) {}

  @Post('scenarios')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Abonten Directional Travel Demand Model',
    description:
      'Compares the submitted routes for one time window. Each route receives a share of its origin-to-destination demand in proportion to inverse duration. Scenario shares use all submitted pair weights. Mapbox estimates are for planning. When driving, follow traffic laws and information on the road if it conflicts with Mapbox. See [Mapbox driving directions policy](https://www.mapbox.com/legal/tos).',
  })
  @ApiResponse({ status: 200, type: TravelDemandScenarioResponse })
  @ApiResponse({
    status: 400,
    description: 'Invalid scenario, duration source or transfer confirmation',
  })
  @ApiResponse({ status: 429, description: 'Request or Mapbox routing capacity reached' })
  @ApiResponse({
    status: 503,
    description: 'No server token configured for Mapbox Directions',
  })
  async compareTravelDemand(
    @Body() dto: TravelDemandScenarioDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const abort = new AbortController();
    const cancel = () => abort.abort();
    res.once('close', cancel);
    try {
      return await this.travelDemand.compare(dto, abort.signal);
    } finally {
      res.off('close', cancel);
    }
  }
}

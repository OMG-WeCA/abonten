import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { AgencyCampaignsService } from './agency-campaigns.service';
import { agencyCampaignDetailSchema, agencyCampaignListSchema } from './agency-campaigns.openapi';

class CampaignListQuery {
  @ApiPropertyOptional({ enum: ['draft', 'planned', 'booking', 'live', 'completed', 'cancelled'] })
  @IsOptional()
  @IsIn(['draft', 'planned', 'booking', 'live', 'completed', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

@ApiTags('planning-v1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.CAMPAIGN_VIEW)
@ApiResponse({ status: 401, description: 'Signed-in session required' })
@ApiResponse({
  status: 403,
  description: 'Active agency membership and campaign-view capability required',
})
@Controller('planning/v1/campaigns')
export class AgencyCampaignsController {
  constructor(private readonly service: AgencyCampaignsService) {}

  private actor(req: Request & { user: AuthenticatedUser }) {
    const header = req.headers['x-org-id'];
    return {
      userId: req.user.userId,
      organizationId: typeof header === 'string' ? header : (req.user.activeOrgId ?? ''),
    };
  }

  @Get()
  @ApiOperation({
    summary:
      'Read agency campaigns with same-currency totals; personal drafts and alternatives excluded',
  })
  @ApiResponse({ status: 200, schema: agencyCampaignListSchema })
  @ApiResponse({ status: 400, description: 'Invalid status or pagination' })
  list(@Req() req: Request & { user: AuthenticatedUser }, @Query() query: CampaignListQuery) {
    return this.service.list(this.actor(req), query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Read owned campaign facts; booking, monitoring and issue projections respect their own capabilities',
  })
  @ApiResponse({ status: 200, schema: agencyCampaignDetailSchema })
  @ApiResponse({ status: 404, description: 'No campaign visible in this agency' })
  get(@Req() req: Request & { user: AuthenticatedUser }, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(this.actor(req), id);
  }

  @Get(':id/proofs/:proofId/photos/:photoId')
  @ApiOperation({
    summary:
      'Read a private JPEG preview of a synced campaign proof photo; stored originals remain immutable',
  })
  @ApiResponse({
    status: 200,
    content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({
    status: 403,
    description: 'Monitoring-view capability required independently of booking-view',
  })
  @ApiResponse({
    status: 404,
    description: 'No authorized synced photo, missing object or unsupported image',
  })
  @ApiResponse({ status: 503, description: 'Two photo previews already processing; retry shortly' })
  async photo(
    @Req() req: Request & { user: AuthenticatedUser },
    @Res({ passthrough: true }) res: Response,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('proofId', ParseUUIDPipe) proofId: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    const buffer = await this.service.photo(this.actor(req), id, proofId, photoId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Content-Disposition', `inline; filename="proof-${photoId}.jpg"`);
    return new StreamableFile(buffer, { type: 'image/jpeg', length: buffer.length });
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import {
  RequireAnyCapabilities,
  RequireCapabilities,
} from '../capabilities/require-capabilities.decorator';
import { InventoryService } from './inventory.service';
import {
  CreateFaceDto,
  CreateBlackoutDto,
  CreateMetadataDto,
  CreateRateCardDto,
  CreateSiteDto,
  ListSitesQueryDto,
  RejectSiteDto,
  UpdateFaceDto,
  UpdateMetadataDto,
  UpdateRateCardDto,
  UpdateSiteDto,
  VerifyLocationDto,
} from './dto/inventory.dto';

type AuthReq = Request & { user?: AuthenticatedUser };

function orgContext(req: AuthReq): string | undefined {
  const header = req.headers['x-org-id'] as string | undefined;
  return header ?? req.user?.activeOrgId;
}

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_VIEW)
  @Get('faces/:faceId/blackouts')
  @ApiOperation({ summary: 'List Partner-owned unavailable dates for a face' })
  async listBlackouts(@Req() req: AuthReq, @Param('faceId', ParseUUIDPipe) faceId: string) {
    return this.service.listBlackouts(orgContext(req)!, faceId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Post('faces/:faceId/blackouts')
  @ApiOperation({ summary: 'Block dates on a Partner-owned face' })
  async addBlackout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('faceId', ParseUUIDPipe) faceId: string,
    @Body() dto: CreateBlackoutDto,
  ) {
    return this.service.addBlackout(user, orgContext(req)!, faceId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Delete('blackouts/:id')
  @ApiOperation({ summary: 'Remove a Partner-owned unavailable period' })
  async removeBlackout(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.removeBlackout(user, orgContext(req)!, id);
  }

  // --------------------------------------------------------------- sites
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_CREATE)
  @Post('sites')
  @ApiOperation({ summary: 'Create a new billboard site (media partner)' })
  async createSite(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Body() dto: CreateSiteDto,
  ) {
    return this.service.createSite(orgContext(req)!, dto, {
      userId: user.userId,
      orgId: orgContext(req),
    });
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireAnyCapabilities(
    Capability.INVENTORY_VIEW,
    Capability.MARKETPLACE_VIEW,
    Capability.PLATFORM_ADMIN,
  )
  @Get('sites')
  @ApiOperation({ summary: 'List sites (own org for partners; listed for planners)' })
  async listSites(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Query() q: ListSitesQueryDto,
  ) {
    return this.service.listSites(user, orgContext(req), q);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireAnyCapabilities(
    Capability.INVENTORY_VIEW,
    Capability.MARKETPLACE_VIEW,
    Capability.PLATFORM_ADMIN,
  )
  @Get('sites/:id')
  @ApiOperation({ summary: 'Site detail with faces, assets, metadata, rate cards' })
  async getSite(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('id') id: string,
  ) {
    return this.service.getSite(user, orgContext(req), id);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Patch('sites/:id')
  @ApiOperation({ summary: 'Update a site (owner only)' })
  async updateSite(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
  ) {
    return this.service.updateSite(user, orgContext(req)!, id, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_DELETE)
  @Delete('sites/:id')
  @ApiOperation({ summary: 'Soft-delete a site (→ decommissioned)' })
  async deleteSite(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('id') id: string,
  ) {
    return this.service.deleteSite(user, orgContext(req)!, id);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Post('sites/:id/submit')
  @ApiOperation({ summary: 'Submit a site for review (draft → pending_review)' })
  async submitSite(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyLocationDto,
  ) {
    return this.service.submitSite(user, orgContext(req)!, id, dto.locale);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Post('sites/:id/verify-location')
  @ApiOperation({
    summary: 'Check the saved address against the saved pin; ambiguity never proves mismatch',
  })
  async verifySiteLocation(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyLocationDto,
  ) {
    return this.service.verifySiteLocation(user, orgContext(req)!, id, dto.locale);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.PLATFORM_ADMIN)
  @Post('sites/:id/approve')
  @ApiOperation({ summary: 'Approve a site (platform admin; → listed)' })
  async approveSite(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('id') id: string,
  ) {
    return this.service.approveSite(user, orgContext(req), id);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.PLATFORM_ADMIN)
  @Post('sites/:id/reject')
  @ApiOperation({ summary: 'Reject a site (platform admin; → draft with reason)' })
  async rejectSite(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('id') id: string,
    @Body() dto: RejectSiteDto,
  ) {
    return this.service.rejectSite(user, orgContext(req), id, dto.reason);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.PLATFORM_ADMIN)
  @Post('sites/:id/suspend')
  @ApiOperation({ summary: 'Suspend a site (platform admin)' })
  async suspendSite(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('id') id: string,
  ) {
    return this.service.suspendSite(user, orgContext(req), id);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.PLATFORM_ADMIN)
  @Post('sites/:id/unsuspend')
  @ApiOperation({ summary: 'Reactivate a suspended site (platform admin)' })
  async unsuspendSite(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('id') id: string,
  ) {
    return this.service.unsuspendSite(user, orgContext(req), id);
  }

  // --------------------------------------------------------------- faces
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_CREATE)
  @Post('sites/:siteId/faces')
  @ApiOperation({ summary: 'Add a face to a site' })
  async addFace(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('siteId') siteId: string,
    @Body() dto: CreateFaceDto,
  ) {
    return this.service.addFace(user, orgContext(req)!, siteId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_VIEW)
  @Get('sites/:siteId/faces')
  @ApiOperation({ summary: 'List faces for a site' })
  async listFaces(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('siteId') siteId: string,
  ) {
    await this.service.assertCanReadSite(user, orgContext(req), siteId);
    return this.service.listFaces(siteId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Patch('faces/:faceId')
  @ApiOperation({ summary: 'Update a face' })
  async updateFace(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('faceId') faceId: string,
    @Body() dto: UpdateFaceDto,
  ) {
    return this.service.updateFace(user, orgContext(req)!, faceId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_DELETE)
  @Delete('faces/:faceId')
  @ApiOperation({ summary: 'Remove a face' })
  async removeFace(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('faceId') faceId: string,
  ) {
    return this.service.removeFace(user, orgContext(req)!, faceId);
  }

  // --------------------------------------------------------------- assets
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_VIEW)
  @Get('sites/:siteId/assets')
  @ApiOperation({ summary: 'List assets for a site' })
  async listAssets(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('siteId') siteId: string,
  ) {
    await this.service.assertCanReadSite(user, orgContext(req), siteId);
    return this.service.listAssets(siteId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Delete('sites/:siteId/assets/:assetId')
  @ApiOperation({ summary: 'Delete an asset (and its stored object)' })
  async deleteAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('siteId') siteId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.service.deleteAsset(user, orgContext(req)!, siteId, assetId);
  }

  // --------------------------------------------------------------- metadata
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Post('sites/:siteId/metadata')
  @ApiOperation({ summary: 'Add enrichment data to a site' })
  async addMetadata(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('siteId') siteId: string,
    @Body() dto: CreateMetadataDto,
  ) {
    return this.service.addMetadata(user, orgContext(req)!, siteId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_VIEW)
  @Get('sites/:siteId/metadata')
  @ApiOperation({ summary: 'Get all enrichment for a site' })
  async listMetadata(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('siteId') siteId: string,
  ) {
    await this.service.assertCanReadSite(user, orgContext(req), siteId);
    return this.service.listMetadata(siteId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Patch('sites/:siteId/metadata/:metadataId')
  @ApiOperation({ summary: 'Update an enrichment record' })
  async updateMetadata(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('metadataId') metadataId: string,
    @Body() dto: UpdateMetadataDto,
  ) {
    return this.service.updateMetadata(user, orgContext(req)!, metadataId, dto);
  }

  // --------------------------------------------------------------- rate cards
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Post('sites/:siteId/rate-cards')
  @ApiOperation({ summary: 'Create a rate card for a site (media partner)' })
  async createRateCard(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('siteId') siteId: string,
    @Body() dto: CreateRateCardDto,
  ) {
    return this.service.createRateCard(user, orgContext(req)!, siteId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_VIEW)
  @Get('sites/:siteId/rate-cards')
  @ApiOperation({ summary: 'List rate cards for a site' })
  async listRateCards(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('siteId') siteId: string,
  ) {
    await this.service.assertCanReadSite(user, orgContext(req), siteId);
    return this.service.listRateCards(siteId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Patch('rate-cards/:rateCardId')
  @ApiOperation({ summary: 'Update a rate card' })
  async updateRateCard(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('rateCardId') rateCardId: string,
    @Body() dto: UpdateRateCardDto,
  ) {
    return this.service.updateRateCard(user, orgContext(req)!, rateCardId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Delete('rate-cards/:rateCardId/future')
  @ApiOperation({ summary: 'Withdraw a future rate card before it takes effect' })
  async withdrawFutureRateCard(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('rateCardId') rateCardId: string,
  ) {
    return this.service.withdrawFutureRateCard(user, orgContext(req)!, rateCardId);
  }
}

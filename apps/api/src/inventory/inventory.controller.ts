import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { InventoryService } from './inventory.service';
import {
  CreateFaceDto,
  CreateMetadataDto,
  CreateRateCardDto,
  CreateSiteDto,
  ListSitesQueryDto,
  RejectSiteDto,
  UpdateFaceDto,
  UpdateMetadataDto,
  UpdateRateCardDto,
  UpdateSiteDto,
} from './dto/inventory.dto';

type AuthReq = Request & { user?: AuthenticatedUser };

function orgContext(req: AuthReq): string | undefined {
  const header = req.headers['x-org-id'] as string | undefined;
  return header ?? req.user?.activeOrgId;
}

const uploadsDir = process.env.UPLOADS_DIR ?? './uploads';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  // --------------------------------------------------------------- sites
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_CREATE)
  @Post('sites')
  @ApiOperation({ summary: 'Create a new billboard site (media partner)' })
  async createSite(@CurrentUser() user: AuthenticatedUser, @Req() req: AuthReq, @Body() dto: CreateSiteDto) {
    return this.service.createSite(orgContext(req)!, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sites')
  @ApiOperation({ summary: 'List sites (own org for partners; listed for planners)' })
  async listSites(@CurrentUser() user: AuthenticatedUser, @Req() req: AuthReq, @Query() q: ListSitesQueryDto) {
    return this.service.listSites(user, orgContext(req), q);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_VIEW)
  @Get('sites/:id')
  @ApiOperation({ summary: 'Site detail with faces, assets, metadata, rate cards' })
  async getSite(@CurrentUser() user: AuthenticatedUser, @Req() req: AuthReq, @Param('id') id: string) {
    return this.service.getSite(user, orgContext(req), id);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Patch('sites/:id')
  @ApiOperation({ summary: 'Update a site (owner only)' })
  async updateSite(@Req() req: AuthReq, @Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.service.updateSite(orgContext(req)!, id, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_DELETE)
  @Delete('sites/:id')
  @ApiOperation({ summary: 'Soft-delete a site (→ decommissioned)' })
  async deleteSite(@Req() req: AuthReq, @Param('id') id: string) {
    return this.service.deleteSite(orgContext(req)!, id);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Post('sites/:id/submit')
  @ApiOperation({ summary: 'Submit a site for review (draft → pending_review)' })
  async submitSite(@Req() req: AuthReq, @Param('id') id: string) {
    return this.service.submitSite(orgContext(req)!, id);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.PLATFORM_ADMIN)
  @Post('sites/:id/approve')
  @ApiOperation({ summary: 'Approve a site (platform admin; → listed)' })
  async approveSite(@Param('id') id: string) {
    return this.service.approveSite(id);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.PLATFORM_ADMIN)
  @Post('sites/:id/reject')
  @ApiOperation({ summary: 'Reject a site (platform admin; → draft with reason)' })
  async rejectSite(@Param('id') id: string, @Body() dto: RejectSiteDto) {
    return this.service.rejectSite(id, dto.reason);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.PLATFORM_ADMIN)
  @Post('sites/:id/suspend')
  @ApiOperation({ summary: 'Suspend a site (platform admin)' })
  async suspendSite(@Param('id') id: string) {
    return this.service.suspendSite(id);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.PLATFORM_ADMIN)
  @Post('sites/:id/unsuspend')
  @ApiOperation({ summary: 'Reactivate a suspended site (platform admin)' })
  async unsuspendSite(@Param('id') id: string) {
    return this.service.unsuspendSite(id);
  }

  // --------------------------------------------------------------- faces
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_CREATE)
  @Post('sites/:siteId/faces')
  @ApiOperation({ summary: 'Add a face to a site' })
  async addFace(@Req() req: AuthReq, @Param('siteId') siteId: string, @Body() dto: CreateFaceDto) {
    return this.service.addFace(orgContext(req)!, siteId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_VIEW)
  @Get('sites/:siteId/faces')
  @ApiOperation({ summary: 'List faces for a site' })
  async listFaces(@Param('siteId') siteId: string) {
    return this.service.listFaces(siteId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Patch('faces/:faceId')
  @ApiOperation({ summary: 'Update a face' })
  async updateFace(@Req() req: AuthReq, @Param('faceId') faceId: string, @Body() dto: UpdateFaceDto) {
    return this.service.updateFace(orgContext(req)!, faceId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_DELETE)
  @Delete('faces/:faceId')
  @ApiOperation({ summary: 'Remove a face' })
  async removeFace(@Req() req: AuthReq, @Param('faceId') faceId: string) {
    return this.service.removeFace(orgContext(req)!, faceId);
  }

  // --------------------------------------------------------------- assets
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Post('sites/:siteId/assets')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a reference photo for a site' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadsDir,
        filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`),
      }),
    }),
  )
  async uploadAsset(
    @Req() req: AuthReq,
    @Param('siteId') siteId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind?: string,
    @Body('capturedAt') capturedAt?: string,
  ) {
    if (!file) throw new Error('No file uploaded');
    const storageRef = `uploads/${file.filename}`;
    return this.service.addAsset(
      orgContext(req)!,
      siteId,
      kind ?? 'front',
      storageRef,
      capturedAt ? new Date(capturedAt) : undefined,
    );
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_VIEW)
  @Get('sites/:siteId/assets')
  @ApiOperation({ summary: 'List assets for a site' })
  async listAssets(@Param('siteId') siteId: string) {
    return this.service.listAssets(siteId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Delete('sites/:siteId/assets/:assetId')
  @ApiOperation({ summary: 'Delete an asset' })
  async deleteAsset(@Req() req: AuthReq, @Param('siteId') siteId: string, @Param('assetId') assetId: string) {
    return this.service.deleteAsset(orgContext(req)!, siteId, assetId);
  }

  // --------------------------------------------------------------- metadata
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Post('sites/:siteId/metadata')
  @ApiOperation({ summary: 'Add enrichment data to a site' })
  async addMetadata(@Req() req: AuthReq, @Param('siteId') siteId: string, @Body() dto: CreateMetadataDto) {
    return this.service.addMetadata(orgContext(req)!, siteId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_VIEW)
  @Get('sites/:siteId/metadata')
  @ApiOperation({ summary: 'Get all enrichment for a site' })
  async listMetadata(@Param('siteId') siteId: string) {
    return this.service.listMetadata(siteId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Patch('sites/:siteId/metadata/:metadataId')
  @ApiOperation({ summary: 'Update an enrichment record' })
  async updateMetadata(
    @Req() req: AuthReq,
    @Param('metadataId') metadataId: string,
    @Body() dto: UpdateMetadataDto,
  ) {
    return this.service.updateMetadata(orgContext(req)!, metadataId, dto);
  }

  // --------------------------------------------------------------- rate cards
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Post('sites/:siteId/rate-cards')
  @ApiOperation({ summary: 'Create a rate card for a site (media partner)' })
  async createRateCard(@Req() req: AuthReq, @Param('siteId') siteId: string, @Body() dto: CreateRateCardDto) {
    return this.service.createRateCard(orgContext(req)!, siteId, dto);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_VIEW)
  @Get('sites/:siteId/rate-cards')
  @ApiOperation({ summary: 'List rate cards for a site' })
  async listRateCards(@Param('siteId') siteId: string) {
    return this.service.listRateCards(siteId);
  }

  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @Patch('rate-cards/:rateCardId')
  @ApiOperation({ summary: 'Update a rate card' })
  async updateRateCard(@Req() req: AuthReq, @Param('rateCardId') rateCardId: string, @Body() dto: UpdateRateCardDto) {
    return this.service.updateRateCard(orgContext(req)!, rateCardId, dto);
  }
}
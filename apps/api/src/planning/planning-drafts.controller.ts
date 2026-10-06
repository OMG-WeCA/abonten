import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { PlanningDraftsService } from './planning-drafts.service';
import { planningDraftWriteSchema, savedDraftSchema } from './planning-drafts.openapi';

@ApiTags('planning-v1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.MARKETPLACE_VIEW, Capability.CAMPAIGN_CREATE)
@ApiResponse({ status: 401, description: 'Signed-in session required' })
@ApiResponse({
  status: 403,
  description: 'Active agency membership and marketplace + campaign-create capabilities required',
})
@Controller('planning/v1/drafts')
export class PlanningDraftsController {
  constructor(private readonly service: PlanningDraftsService) {}
  private actor(req: Request & { user: AuthenticatedUser }) {
    const header = req.headers['x-org-id'];
    return {
      userId: req.user.userId,
      organizationId: typeof header === 'string' ? header : (req.user.activeOrgId ?? ''),
    };
  }
  @Get()
  @ApiOperation({ summary: 'List personal drafts in the selected agency, newest first' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      required: ['items', 'limit'],
      properties: {
        items: { type: 'array', items: savedDraftSchema },
        limit: { type: 'integer', enum: [30] },
      },
    },
  })
  list(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.service.list(this.actor(req));
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Read a personal draft; current inventory must be rechecked separately',
  })
  @ApiResponse({ status: 200, schema: savedDraftSchema })
  @ApiResponse({ status: 404, description: 'No personal draft visible in this scope' })
  get(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.get(this.actor(req), id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a personal planning draft; repeat identical request UUID safely',
  })
  @ApiBody({ schema: planningDraftWriteSchema('create') })
  @ApiResponse({ status: 201, schema: savedDraftSchema })
  @ApiResponse({
    status: 409,
    description: 'Request UUID content conflict or 30-draft quota reached',
  })
  create(@Req() req: Request & { user: AuthenticatedUser }, @Body() body: unknown) {
    return this.service.create(this.actor(req), body);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Replace personal draft controls using the current optimistic revision',
  })
  @ApiBody({ schema: planningDraftWriteSchema('update') })
  @ApiResponse({ status: 200, schema: savedDraftSchema })
  @ApiResponse({
    status: 409,
    description: 'DRAFT_REVISION_CONFLICT: reload without silently overwriting',
  })
  @ApiResponse({ status: 404, description: 'No personal draft visible in this scope' })
  update(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.service.update(this.actor(req), id, body);
  }
}

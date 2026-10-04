import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {} from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { PlanningService } from './planning.service';
import { BriefExtractionService } from './brief-extraction.service';
import { AssistantMessageDto, SiteOptionsQueryDto } from './dto/planning.dto';
import { BRIEF_MAX_BYTES } from './brief-parser';
import {
  AssistantStatusResponse,
  ExtractedBriefResponse,
  PlannerReplyResponse,
  SiteOptionsResponse,
} from './dto/planning-response.dto';

@ApiTags('planning-v1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.CAMPAIGN_CREATE, Capability.MARKETPLACE_VIEW)
@ApiResponse({ status: 401, description: 'Valid signed-in session required' })
@ApiResponse({
  status: 403,
  description: 'Organization membership and marketplace + campaign-create capabilities required',
})
@Controller('planning/v1')
export class PlanningController {
  constructor(
    private readonly service: PlanningService,
    private readonly briefs: BriefExtractionService,
  ) {}

  @Get('assistant/status')
  @ApiOperation({ summary: 'Local assistant capabilities and document privacy policy' })
  @ApiResponse({ status: 200, type: AssistantStatusResponse })
  status() {
    return this.service.assistantStatus();
  }

  @Post('assistant')
  @ApiOperation({
    summary: 'Deterministic local planning guidance; no AI provider or external document transfer',
  })
  @ApiResponse({ status: 201, type: PlannerReplyResponse })
  assist(@Body() dto: AssistantMessageDto) {
    return this.service.assist(dto);
  }

  @Post('briefs')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Extract inert brief text for user confirmation; document and text are not retained',
  })
  @ApiResponse({
    status: 400,
    description: 'Unsupported, invalid, encrypted or unreadable document',
  })
  @ApiResponse({ status: 413, description: 'Maximum 10 MB upload' })
  @ApiResponse({ status: 429, description: 'Two extraction workers already busy' })
  @ApiResponse({ status: 201, type: ExtractedBriefResponse })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: BRIEF_MAX_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  extract(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Choose a document to upload.');
    return this.briefs.extract(file);
  }

  @Get('site-options/:siteId')
  @ApiOperation({
    summary:
      'Check public face availability for an inclusive start/exclusive end date window; no hold or booking',
  })
  @ApiResponse({ status: 200, type: SiteOptionsResponse })
  @ApiResponse({ status: 400, description: 'Invalid date or non-positive flight window' })
  @ApiResponse({ status: 404, description: 'Site is absent, unlisted or not marketplace-ready' })
  options(@Param('siteId', ParseUUIDPipe) siteId: string, @Query() query: SiteOptionsQueryDto) {
    return this.service.siteOptions(siteId, query);
  }
}

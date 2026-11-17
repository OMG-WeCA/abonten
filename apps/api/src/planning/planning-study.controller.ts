import {
  planningBriefFieldsRequestSchema,
  planningBriefFieldsResultSchema,
} from './planning-journey.openapi';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { PlanningStudyService } from './planning-study.service';
import {
  planningStudyRequestSchema,
  planningStudyPreflightRequestSchema,
  planningStudyReadinessSchema,
  planningStudyEvaluationSchema,
  planningStudyJobSchema,
  planningStudyEvaluateSchema,
  planningStudyCompareSchema,
} from './planning-study.openapi';

@ApiTags('planning-studies-v1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.CAMPAIGN_CREATE, Capability.MARKETPLACE_VIEW)
@ApiResponse({ status: 401, description: 'Signed-in session required' })
@ApiResponse({
  status: 403,
  description: 'Active agency membership and planning capabilities required',
})
@Controller('planning/v1/studies')
export class PlanningStudyController {
  constructor(private readonly studies: PlanningStudyService) {}
  private actor(req: Request & { user: AuthenticatedUser }) {
    return {
      userId: req.user.userId,
      organizationId:
        typeof req.headers['x-org-id'] === 'string'
          ? req.headers['x-org-id']
          : (req.user.activeOrgId ?? ''),
    };
  }
  private async cancellable<T>(
    req: Request,
    res: Response,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const abort = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) abort.abort();
    };
    req.once('aborted', cancel);
    res.once('close', cancel);
    try {
      return await run(abort.signal);
    } finally {
      req.off('aborted', cancel);
      res.off('close', cancel);
    }
  }
  @Post('preflight')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Check qualified population and face readiness before routing',
    description:
      'Reads current public references and authorized inventory only. No Mapbox or AI transfer. Missing viewing facts do not hide supported population qualification.',
  })
  @ApiBody({ schema: planningStudyPreflightRequestSchema })
  @ApiResponse({ status: 200, schema: planningStudyReadinessSchema })
  preflight(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cancellable(req, res, (signal) =>
      this.studies.preflight(this.actor(req), body, signal),
    );
  }
  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Start one authorized planning study shared by face scores, modeled audience and budget-constrained face recommendations',
    description:
      'Routes public road points and representative local departures only. Inventory, target and campaign facts remain in Abonten. Jobs and source-compatible results expire after 24 hours; controls are retained separately in personal drafts.',
  })
  @ApiBody({ schema: planningStudyRequestSchema })
  @ApiResponse({ status: 202, schema: planningStudyJobSchema })
  create(@Req() req: Request & { user: AuthenticatedUser }, @Body() body: unknown) {
    return this.studies.create(this.actor(req), body);
  }
  @Get(':id')
  @ApiOperation({ summary: 'Read personal study progress or current source-compatible results' })
  @ApiResponse({ status: 200, schema: planningStudyJobSchema })
  get(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.studies.get(this.actor(req), id);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Cancel queued or active routing, preserving retry controls' })
  @ApiResponse({ status: 200, schema: planningStudyJobSchema })
  cancel(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.studies.cancel(this.actor(req), id);
  }
  @Post(':id/retry')
  @HttpCode(202)
  @ApiOperation({ summary: 'Retry with the same controls and current authorized source versions' })
  @ApiResponse({ status: 202, schema: planningStudyJobSchema })
  retry(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.studies.retry(this.actor(req), id);
  }
  @Post(':id/evaluate')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Change faces, reach threshold, objective or budget without rerouting or changing the modeled population',
    description:
      'Additional authorized candidate faces may be assessed against the retained fixed directed pairs. Current commercial facts are rechecked. The original sample remains fixed and new board stability diagnostics can show a shortfall.',
  })
  @ApiBody({ schema: planningStudyEvaluateSchema })
  @ApiResponse({ status: 200, schema: planningStudyEvaluationSchema })
  @ApiResponse({
    status: 409,
    description:
      'The study or saved face choices changed during evaluation. Reload before retrying.',
  })
  evaluate(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cancellable(req, res, (signal) =>
      this.studies.evaluate(this.actor(req), id, body, signal),
    );
  }
  @Post(':id/compare')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Compare an alternative on the retained population without changing the current study',
    description:
      'Rechecks current source versions, authorization and face facts. Returns the same compact metrics as evaluation without saving a request, result or evaluation overlay.',
  })
  @ApiBody({ schema: planningStudyCompareSchema })
  @ApiResponse({ status: 200, schema: planningStudyEvaluationSchema })
  compare(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ) {
    return this.studies.compare(this.actor(req), id, body);
  }
}

@ApiTags('planning-v1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.CAMPAIGN_CREATE, Capability.MARKETPLACE_VIEW)
@Controller('planning/v1')
export class PlanningCampaignController {
  constructor(private readonly studies: PlanningStudyService) {}
  @Post('extract-brief')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Extract an uploaded brief into a partial editable campaign form',
    description:
      'The explicit import action authorizes this transient provider request. Raw document text is not stored. Absent fields leave current values unchanged.',
  })
  @ApiBody({ schema: planningBriefFieldsRequestSchema })
  @ApiResponse({ status: 200, schema: planningBriefFieldsResultSchema })
  @ApiResponse({ status: 400, description: 'Invalid or oversized brief text' })
  @ApiResponse({
    status: 503,
    description: 'Planning intelligence unavailable; complete the form manually',
  })
  async extract(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const abort = new AbortController();
    const cancel = () => {
      if (!res.writableEnded) abort.abort();
    };
    req.once('aborted', cancel);
    res.once('close', cancel);
    try {
      return await this.studies.extractBriefFields(
        {
          userId: req.user.userId,
          organizationId:
            typeof req.headers['x-org-id'] === 'string'
              ? req.headers['x-org-id']
              : (req.user.activeOrgId ?? ''),
        },
        body,
        abort.signal,
      );
    } finally {
      req.off('aborted', cancel);
      res.off('close', cancel);
    }
  }
}

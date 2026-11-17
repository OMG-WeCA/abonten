import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { PlanningAgentService } from './planning-agent.service';

@ApiTags('planning-agent-v1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.CAMPAIGN_CREATE, Capability.MARKETPLACE_VIEW)
@Controller('planning/v1/agent')
export class PlanningAgentController {
  constructor(private readonly agent: PlanningAgentService) {}
  @Get('status')
  @ApiOperation({ summary: 'Read platform agent availability without making a provider request' })
  status() {
    return this.agent.status();
  }

  @Post('turns')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Ask the platform agent to inspect or act on the current working plan',
    description:
      'One deliberate send runs the tool-capable agent. Draft tools preserve tenant scope, ownership, revisions, audit and idempotency. No booking, publication, payments or messages. Transient chat and unsaved brief context are not retained.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['requestId', 'contextKey', 'message', 'locale', 'draft', 'draftName'],
      additionalProperties: false,
      properties: {
        requestId: { type: 'string', format: 'uuid' },
        contextKey: { type: 'string', maxLength: 20000 },
        message: { type: 'string', maxLength: 8000 },
        locale: { type: 'string', enum: ['en', 'fr'] },
        history: {
          type: 'array',
          maxItems: 12,
          items: {
            type: 'object',
            required: ['role', 'content'],
            properties: {
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string', maxLength: 4000 },
            },
          },
        },
        draft: {
          type: 'object',
          description:
            'Current AgencyPlanningDraftV1; normalized using the same personal draft contract.',
        },
        draftName: { type: 'string', maxLength: 80 },
        savedDraft: {
          type: 'object',
          required: ['id', 'revision'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            revision: { type: 'integer', minimum: 1 },
          },
        },
        studyId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description:
      'PlanningAgentTurnResult: actual working draft, saved revisions, compact study/face facts and authoritative tool receipts; partial actions remain explicit after a later failure.',
    schema: {
      type: 'object',
      required: ['requestId', 'contextKey', 'status', 'message', 'events', 'draft', 'draftName'],
      properties: {
        requestId: { type: 'string', format: 'uuid' },
        contextKey: { type: 'string' },
        status: { type: 'string', enum: ['completed', 'partial', 'failed'] },
        message: { type: 'string' },
        events: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'tool', 'status', 'applied', 'label'],
            properties: {
              id: { type: 'string' },
              tool: { type: 'string' },
              status: { type: 'string', enum: ['succeeded', 'failed'] },
              applied: { type: 'boolean' },
              label: { type: 'string' },
              facts: { type: 'object', additionalProperties: true },
              error: {
                type: 'object',
                properties: { code: { type: 'string' }, message: { type: 'string' } },
              },
            },
          },
        },
        draft: {
          type: 'object',
          description: 'Actual normalized AgencyPlanningDraftV1 working state.',
        },
        draftName: { type: 'string' },
        savedDraft: {
          type: 'object',
          description:
            'Owned SavedAgencyPlanningDraft including actual revision and saved content.',
        },
        study: {
          type: 'object',
          description:
            'PlanningAgentStudy: actual status and compact primary/secondary metrics; unavailable values remain null.',
        },
        faces: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              siteId: { type: 'string', format: 'uuid' },
              faceId: { type: 'string', format: 'uuid' },
              coordinates: {
                type: 'object',
                required: ['latitude', 'longitude'],
                properties: {
                  latitude: { type: 'number', nullable: true },
                  longitude: { type: 'number', nullable: true },
                },
              },
              distanceFromStudyCenterKm: {
                type: 'number',
                nullable: true,
                description: 'Great-circle distance using authorized map coordinates.',
              },
              insideStudyArea: { type: 'boolean', nullable: true },
              insideStudyCatchment: { type: 'boolean', nullable: true },
            },
          },
          description: 'PlanningAgentFace canonical authorized cost and availability facts.',
        },
        alternatives: {
          type: 'array',
          items: { type: 'object' },
          description: 'Actual saved alternative records.',
        },
        error: {
          type: 'object',
          properties: { code: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Active authorized agency membership required' })
  @ApiResponse({
    status: 409,
    description:
      'Typed PlanningAgentRecovery with known safe action IDs; never rerun a duplicate request automatically.',
    schema: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          enum: [
            'AGENT_REQUEST_ALREADY_PROCESSED',
            'AGENT_REQUEST_IN_PROGRESS',
            'AGENT_REQUEST_CONFLICT',
            'DRAFT_REVISION_CONFLICT',
          ],
        },
        message: { type: 'string' },
        recovery: {
          type: 'string',
          enum: ['reload_saved_plan', 'inspect_saved_alternatives', 'retry_later'],
        },
        events: { type: 'array', items: { type: 'object' } },
        savedDraftId: { type: 'string', format: 'uuid' },
        alternativeIds: { type: 'array', items: { type: 'string', format: 'uuid' } },
        studyId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'No configured provider; manual planning remains available.',
  })
  async turn(
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
      return await this.agent.turn(
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

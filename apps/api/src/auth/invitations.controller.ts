import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiBody } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { AuthenticatedUser } from './authenticated-user';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { RequireCapabilities } from '../capabilities/require-capabilities.decorator';
import { Capability } from '../capabilities/capability.enum';
import { InvitationsService } from './invitations.service';
import {
  AcceptInvitationDto,
  CreateInvitationDto,
  MemberInvitationDto,
  InvitationQueryDto,
} from './invitations.dto';
type AuthRequest = Request & { user: AuthenticatedUser };
function context(r: AuthRequest) {
  return (r.headers['x-org-id'] as string | undefined) ?? r.user.activeOrgId ?? '';
}
@ApiTags('admin invitations')
@Controller('admin/invitations')
@UseGuards(JwtAuthGuard, CapabilitiesGuard)
@RequireCapabilities(Capability.PLATFORM_ADMIN)
export class AdminInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}
  @Get()
  @ApiOperation({ summary: 'List invitation states; no admission secrets are returned' })
  list(@Req() r: AuthRequest, @Query() q: InvitationQueryDto) {
    return this.invitations.listAdmin(r.user.userId, context(r), q.page, q.limit);
  }
  @Get('organizations') organizations(@Req() r: AuthRequest, @Query() q: InvitationQueryDto) {
    return this.invitations.organizations(r.user.userId, context(r), q.page, q.limit, q.search);
  }
  @Post()
  @ApiOperation({ summary: 'Invite a new account by email and product account type' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'accountType'],
      additionalProperties: false,
      properties: {
        email: { type: 'string', format: 'email' },
        accountType: { type: 'string', enum: ['media_partner', 'agency', 'brand'] },
        clientRequestId: {
          type: 'string',
          format: 'uuid',
          description: 'Internal retry identifier; retain it for the same submission.',
        },
      },
    },
  })
  async create(@Req() r: AuthRequest, @Body() body: Record<string, unknown>) {
    const dto = await new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }).transform(body, { type: 'body', metatype: CreateInvitationDto });
    return this.invitations.create(r.user.userId, context(r), dto);
  }
  @Post('members')
  async createMember(@Req() r: AuthRequest, @Body() body: Record<string, unknown>) {
    const dto = await new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }).transform(body, { type: 'body', metatype: MemberInvitationDto });
    return this.invitations.createMember(r.user.userId, context(r), dto);
  }
  @Post(':id/resend') resend(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.change(r.user.userId, context(r), id, 'resend');
  }
  @Post(':id/revoke') revoke(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.change(r.user.userId, context(r), id, 'revoke');
  }
}
@ApiTags('invitations')
@Controller('invitations')
@UseGuards(JwtAuthGuard)
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}
  @Get('me') list(@Req() r: AuthRequest) {
    return this.invitations.listMine(r.user.userId);
  }
  @Get(':id')
  detail(@Req() r: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.invitations.getMine(r.user.userId, id);
  }
  @Post(':id/accept')
  @ApiOperation({
    summary:
      'Accept once using the authenticated invitee email; no role or organization may be substituted',
  })
  async accept(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: Record<string, unknown>,
  ) {
    const dto = await new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }).transform(body, { type: 'body', metatype: AcceptInvitationDto });
    return this.invitations.accept(r.user.userId, id, dto);
  }
}

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
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { assertOrgMatch } from './orgs.controller';
import { PartnerTermsAcceptanceDto } from './dto/partner-terms.dto';
import { PartnerTermsService } from './partner-terms.service';
import { partnerTermsDocument } from './terms/partner-terms.catalog';

class TermsLocaleQuery {
  @ApiProperty({ enum: ['en', 'fr'], default: 'en' }) @IsIn(['en', 'fr']) locale: 'en' | 'fr' =
    'en';
}
@ApiTags('partner-terms')
@Controller('partner-terms')
export class PartnerTermsController {
  constructor(private readonly terms: PartnerTermsService) {}
  @Get('current')
  @ApiOperation({
    summary: 'Current immutable terms content and acceptance policy; draft is never legally active',
  })
  current(@Query() query: TermsLocaleQuery) {
    return this.terms.current(query.locale);
  }
  @Get(':version')
  @ApiOperation({ summary: 'Read an exact immutable terms version' })
  version(@Param('version') version: string, @Query() query: TermsLocaleQuery) {
    return partnerTermsDocument(query.locale, version);
  }
}
@ApiTags('partner-terms')
@Controller('orgs')
@UseGuards(JwtAuthGuard)
export class OrganizationPartnerTermsController {
  constructor(private readonly terms: PartnerTermsService) {}
  @Get(':orgId/partner-terms')
  @ApiOperation({
    summary: 'Read exact acceptance records for an organization with active membership',
  })
  history(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    assertOrgMatch(req, orgId);
    return this.terms.history(user.userId, orgId);
  }
  @Post(':orgId/partner-terms')
  @ApiOperation({
    summary:
      'Owner expressly accepts the current version; preview acknowledgements are labeled nonlegal',
  })
  accept(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() input: PartnerTermsAcceptanceDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request & { user?: AuthenticatedUser },
  ) {
    assertOrgMatch(req, orgId);
    return this.terms.accept(user.userId, orgId, input);
  }
}

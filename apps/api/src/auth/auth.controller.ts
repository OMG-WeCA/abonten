import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService, type SessionMetadata } from './auth.service';
import { EmailCodeService } from './email-code.service';
import { RequestEmailCodeDto, VerifyEmailCodeDto } from './dto/email-code.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import type { UserEntity } from './entities/user.entity';
import { microsoftAuthAvailability } from './microsoft-auth.config';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailCode: EmailCodeService,
    private readonly cfg: ConfigService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Public sign-in method availability' })
  config() {
    const microsoft = microsoftAuthAvailability({
      tenantId: this.cfg.get<string>('azureAd.tenantId'),
      clientId: this.cfg.get<string>('azureAd.clientId'),
      clientSecret: this.cfg.get<string>('azureAd.clientSecret'),
    });
    return {
      emailCodeEnabled: true,
      microsoftEnabled: microsoft.enabled,
      microsoftUnavailableReason: microsoft.unavailableReason,
    };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('email-code/request')
  @ApiOperation({ summary: 'Email a six-digit passwordless sign-in code' })
  requestEmailCode(@Body() dto: RequestEmailCodeDto) {
    return this.emailCode.request(dto.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('email-code/verify')
  @ApiOperation({ summary: 'Verify an emailed sign-in code and issue a token pair' })
  verifyEmailCode(@Body() dto: VerifyEmailCodeDto, @Req() req: Request) {
    return this.emailCode.verify(dto.email, dto.code, sessionMetadata(req));
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a new access/refresh pair' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto, sessionMetadata(req));
  }

  @Post('logout')
  @ApiOperation({ summary: 'Revoke the presented refresh token' })
  async logout(@Body() dto: LogoutDto) {
    await this.auth.logout(dto.refreshToken);
    return { loggedOut: true };
  }

  @Get('microsoft')
  @UseGuards(AuthGuard('azure-ad'))
  @ApiOperation({ summary: 'Redirect to Microsoft Azure AD / Entra ID SSO' })
  microsoft(): void {
    // Passport initiates the OIDC redirect when Microsoft is configured.
  }

  @Get('microsoft/callback')
  @UseGuards(AuthGuard('azure-ad'))
  @ApiOperation({ summary: 'Azure AD OIDC callback; issues JWT and redirects to the frontend' })
  async microsoftCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as UserEntity;
    const result = await this.auth.issueTokens(user, undefined, sessionMetadata(req));
    const url = microsoftCallbackUrl(
      this.cfg.get<string>('web.baseUrl') ?? 'http://localhost:3001',
      this.cfg.get<string>('web.basePath'),
    );
    // Hash values are never sent to the web server in a request or Referer header.
    const session = new URLSearchParams({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
    if (result.activeOrgId) session.set('activeOrgId', result.activeOrgId);
    url.hash = session.toString();
    res.redirect(url.toString());
  }
}

export function microsoftCallbackUrl(baseUrl: string, basePath?: string): URL {
  const url = new URL(baseUrl);
  const configuredBasePath = normalizeBasePath(basePath);
  const baseUrlPath = normalizeBasePath(url.pathname);
  url.pathname = `${configuredBasePath || baseUrlPath}/auth/microsoft/callback`;
  url.search = '';
  url.hash = '';
  return url;
}

function normalizeBasePath(value?: string): string {
  const path = value?.trim();
  if (!path || path === '/') return '';
  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}

function sessionMetadata(req: Request): SessionMetadata {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0];
  return {
    userAgent: req.get('user-agent') ?? undefined,
    ip: forwardedIp?.trim() || req.ip,
  };
}

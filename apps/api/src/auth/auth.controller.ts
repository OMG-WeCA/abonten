import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { MagicLinkService } from './magic-link.service';
import { MagicLinkDto } from './dto/magic-link.dto';
import { RefreshDto } from './dto/refresh.dto';
import type { UserEntity } from './entities/user.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly magic: MagicLinkService,
    private readonly cfg: ConfigService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('magic-link')
  @ApiOperation({ summary: 'Request a passwordless sign-in link by email' })
  magicLink(@Body() dto: MagicLinkDto) {
    return this.magic.request(dto.email);
  }

  @Get('magic-link/verify')
  @ApiOperation({ summary: 'Verify a magic-link token and redirect to the frontend with tokens' })
  async magicLinkVerify(@Query('token') token: string, @Res() res: Response) {
    const result = await this.magic.verify(token);
    const url = new URL(`${this.cfg.get<string>('web.baseUrl')}/auth/magic-link/callback`);
    url.searchParams.set('accessToken', result.accessToken);
    url.searchParams.set('refreshToken', result.refreshToken);
    res.redirect(url.toString());
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a new access/refresh pair' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: 'Revoke the refresh token' })
  async logout(@Body() body: { refreshToken?: string }) {
    if (body.refreshToken) await this.auth.logout(body.refreshToken);
    return { loggedOut: true };
  }

  @Get('microsoft')
  @UseGuards(AuthGuard('azure-ad'))
  @ApiOperation({ summary: 'Redirect to Microsoft Azure AD / Entra ID SSO' })
  microsoft(): void {
    // Passport initiates the OIDC redirect.
  }

  @Get('microsoft/callback')
  @UseGuards(AuthGuard('azure-ad'))
  @ApiOperation({ summary: 'Azure AD OIDC callback; issues JWT and redirects to the frontend' })
  async microsoftCallback(@Req() req: Request, @Res() res: Response) {
    const user = req.user as UserEntity;
    const result = await this.auth.issueTokens(user);
    const url = new URL(`${this.cfg.get<string>('web.baseUrl')}/auth/microsoft/callback`);
    url.searchParams.set('accessToken', result.accessToken);
    url.searchParams.set('refreshToken', result.refreshToken);
    res.redirect(url.toString());
  }
}

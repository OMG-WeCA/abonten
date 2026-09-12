import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailCodeService } from './email-code.service';
import { RequestEmailCodeDto, VerifyEmailCodeDto } from './dto/email-code.dto';
import { RefreshDto } from './dto/refresh.dto';
import type { UserEntity } from './entities/user.entity';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailCode: EmailCodeService,
    private readonly cfg: ConfigService,
  ) {}

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('email-code/request')
  @ApiOperation({ summary: 'Email a six-digit passwordless sign-in code' })
  requestEmailCode(@Body() dto: RequestEmailCodeDto) {
    return this.emailCode.request(dto.email);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('email-code/verify')
  @ApiOperation({ summary: 'Verify an emailed sign-in code and issue a token pair' })
  verifyEmailCode(@Body() dto: VerifyEmailCodeDto) {
    return this.emailCode.verify(dto.email, dto.code);
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

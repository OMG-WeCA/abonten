import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { parseDurationMs } from './auth-helpers';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { MeController } from './me.controller';
import { AuthService } from './auth.service';
import { MagicLinkService } from './magic-link.service';
import { MicrosoftAuthService } from './microsoft-auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('jwt.secret') ?? 'change-me-in-dev',
        signOptions: { expiresIn: Math.round(parseDurationMs(cfg.get<string>('jwt.accessExpiresIn') ?? '15m') / 1000) },
      }),
    }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    MagicLinkService,
    MicrosoftAuthService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

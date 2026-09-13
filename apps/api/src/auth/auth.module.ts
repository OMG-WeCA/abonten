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
import { EmailCodeService } from './email-code.service';
import { MicrosoftAuthService } from './microsoft-auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UserIdentityService } from './user-identity.service';
import { StorageService } from '../common/storage.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: Math.round(
            parseDurationMs(cfg.get<string>('jwt.accessExpiresIn') ?? '15m') / 1000,
          ),
        },
      }),
    }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
  ],
  controllers: [AuthController, MeController],
  providers: [
    AuthService,
    EmailCodeService,
    MicrosoftAuthService,
    UserIdentityService,
    StorageService,
    JwtStrategy,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [AuthService, EmailCodeService, UserIdentityService, JwtModule],
})
export class AuthModule {}

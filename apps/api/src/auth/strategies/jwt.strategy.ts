import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DatabaseService } from '../../common/database.service';
import { UserEntity } from '../entities/user.entity';
import type { AuthenticatedUser } from '../authenticated-user';
import type { JwtPayload } from '../jwt-payload';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    cfg: ConfigService,
    private readonly db: DatabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.getOrThrow<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const users = await this.db.repo(UserEntity);
    const user = await users.findOne({ where: { id: payload.sub } });
    // A session-version mismatch means the user selected "sign out everywhere".
    // Do not leave an otherwise valid short-lived JWT usable after that action.
    if (!user || user.status !== 'active' || payload.sessionVersion !== user.sessionVersion) {
      throw new UnauthorizedException('Session is no longer active');
    }
    return {
      userId: payload.sub,
      email: payload.email,
      activeOrgId: payload.activeOrgId,
      role: payload.role,
      sessionVersion: payload.sessionVersion,
    };
  }
}

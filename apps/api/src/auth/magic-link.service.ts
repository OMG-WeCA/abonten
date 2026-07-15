import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { MailService } from '../common/mail.service';
import { RedisService } from '../common/redis.service';
import { DatabaseService } from '../common/database.service';
import { AuthService, type AuthResult } from './auth.service';
import { UserEntity } from './entities/user.entity';

@Injectable()
export class MagicLinkService {
  constructor(
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly cfg: ConfigService,
    private readonly db: DatabaseService,
    private readonly auth: AuthService,
  ) {}

  async request(email: string): Promise<{ sent: true }> {
    const token = randomUUID();
    await this.redis.instance.set(`magic:${token}`, email, 'EX', 900).catch(() => undefined); // 15 min
    const link = `${this.cfg.get<string>('api.baseUrl')}/auth/magic-link/verify?token=${token}`;
    await this.mail.send(
      email,
      'Abonten sign-in link',
      `<p>Click to sign in: <a href="${link}">${link}</a></p><p>This link expires in 15 minutes.</p>`,
    );
    return { sent: true };
  }

  async verify(token: string): Promise<AuthResult> {
    const key = `magic:${token}`;
    const email = await this.redis.instance.get(key);
    if (!email) throw new UnauthorizedException('Invalid or expired magic link');
    await this.redis.instance.del(key).catch(() => undefined);
    const users = await this.db.repo(UserEntity);
    let user = await users.findOne({ where: { email } });
    if (!user) {
      const created = users.create({ email, name: email.split('@')[0], status: 'active' });
      user = await users.save(created);
    }
    return this.auth.issueTokens(user);
  }
}

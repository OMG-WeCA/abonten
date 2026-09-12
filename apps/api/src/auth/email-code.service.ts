import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { MailService } from '../common/mail.service';
import { RedisService } from '../common/redis.service';
import { AuthService, type AuthResult } from './auth.service';
import { normalizeEmailIdentity } from './email-identity';
import { UserIdentityService } from './user-identity.service';

interface EmailCodeChallenge {
  id: string;
  email: string;
  codeHash: string;
  attempts: number;
}

const REQUEST_CODE_SCRIPT = `
-- email-code-request
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
if count > tonumber(ARGV[1]) then
  return 0
end
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[4])
return 1
`;

const VERIFY_CODE_SCRIPT = `
-- email-code-verify
local verificationCount = redis.call('INCR', KEYS[2])
if verificationCount == 1 then
  redis.call('EXPIRE', KEYS[2], ARGV[3])
end
if verificationCount > tonumber(ARGV[2]) then
  return { 'rate_limited' }
end

local rawChallenge = redis.call('GET', KEYS[1])
if not rawChallenge then
  return { 'invalid' }
end

local challenge = cjson.decode(rawChallenge)
if challenge.codeHash == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return { 'valid', challenge.email }
end

challenge.attempts = challenge.attempts + 1
if challenge.attempts >= tonumber(ARGV[4]) then
  redis.call('DEL', KEYS[1])
  return { 'locked' }
end

local ttl = redis.call('TTL', KEYS[1])
if ttl > 0 then
  redis.call('SET', KEYS[1], cjson.encode(challenge), 'EX', ttl)
end
return { 'invalid' }
`;

const DELETE_CHALLENGE_IF_CURRENT_SCRIPT = `
-- email-code-delete-current
local rawChallenge = redis.call('GET', KEYS[1])
if not rawChallenge then
  return 0
end
local challenge = cjson.decode(rawChallenge)
if challenge.id == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

@Injectable()
export class EmailCodeService {
  constructor(
    private readonly redis: RedisService,
    private readonly mail: MailService,
    private readonly identities: UserIdentityService,
    private readonly auth: AuthService,
    private readonly cfg: ConfigService,
  ) {}

  async request(emailInput: string): Promise<{ accepted: true }> {
    const email = normalizeEmailIdentity(emailInput);
    const code = generateCode();
    const challenge: EmailCodeChallenge = {
      id: randomUUID(),
      email,
      codeHash: this.hashCode(email, code),
      attempts: 0,
    };

    try {
      const accepted = await this.redis.instance.eval(
        REQUEST_CODE_SCRIPT,
        2,
        this.requestRateKey(email),
        this.challengeKey(email),
        String(this.requestLimit),
        String(this.requestWindowSeconds),
        JSON.stringify(challenge),
        String(this.codeTtlSeconds),
      );
      if (Number(accepted) !== 1) {
        throw new HttpException(
          'Too many sign-in code requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS)
        throw error;
      throw new ServiceUnavailableException(
        'Sign-in is temporarily unavailable. Please try again.',
      );
    }

    try {
      await this.mail.send(
        email,
        'Your Abonten sign-in code',
        `<p>Use this code to sign in:</p><p style="font-size: 28px; font-weight: 700; letter-spacing: 0.2em">${code}</p><p>It expires in ${this.codeTtlMinutes} minutes. If you did not request it, you can ignore this email.</p>`,
      );
    } catch {
      await this.deleteChallengeIfCurrent(email, challenge.id);
      throw new ServiceUnavailableException(
        'Sign-in is temporarily unavailable. Please try again.',
      );
    }

    return { accepted: true };
  }

  async verify(emailInput: string, code: string): Promise<AuthResult> {
    const email = normalizeEmailIdentity(emailInput);
    const result = await this.verifyChallenge(email, code);
    if (result.status === 'rate_limited') {
      throw new HttpException(
        'Too many verification attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (result.status !== 'valid') {
      throw new UnauthorizedException('Invalid or expired sign-in code');
    }

    const user = await this.identities.findOrCreateByEmail(result.email, {
      name: result.email.split('@')[0],
    });
    return this.auth.issueTokens(user);
  }

  private async verifyChallenge(
    email: string,
    code: string,
  ): Promise<
    { status: 'valid'; email: string } | { status: 'invalid' | 'locked' | 'rate_limited' }
  > {
    let response: unknown;
    try {
      response = await this.redis.instance.eval(
        VERIFY_CODE_SCRIPT,
        2,
        this.challengeKey(email),
        this.verificationRateKey(email),
        this.hashCode(email, code),
        String(this.verificationLimit),
        String(this.verificationWindowSeconds),
        String(this.maxAttempts),
      );
    } catch {
      throw new ServiceUnavailableException(
        'Sign-in is temporarily unavailable. Please try again.',
      );
    }

    const values = Array.isArray(response) ? response.map(String) : [];
    if (values[0] === 'valid' && values[1]) {
      return { status: 'valid', email: values[1] };
    }
    if (values[0] === 'rate_limited') return { status: 'rate_limited' };
    if (values[0] === 'locked') return { status: 'locked' };
    return { status: 'invalid' };
  }

  private async deleteChallengeIfCurrent(email: string, id: string): Promise<void> {
    try {
      await this.redis.instance.eval(
        DELETE_CHALLENGE_IF_CURRENT_SCRIPT,
        1,
        this.challengeKey(email),
        id,
      );
    } catch {
      // A delivery failure must not turn a generic error response into a Redis diagnostic.
    }
  }

  private hashCode(email: string, code: string): string {
    return createHmac('sha256', this.codeSecret).update(`${email}:${code}`).digest('hex');
  }

  private get codeSecret(): string {
    return this.cfg.get<string>('auth.emailCodeSecret') ?? this.cfg.get<string>('jwt.secret') ?? '';
  }

  private get codeTtlSeconds(): number {
    return this.cfg.get<number>('auth.emailCodeTtlSeconds') ?? 600;
  }

  private get codeTtlMinutes(): number {
    return Math.ceil(this.codeTtlSeconds / 60);
  }

  private get maxAttempts(): number {
    return this.cfg.get<number>('auth.emailCodeMaxAttempts') ?? 5;
  }

  private get requestLimit(): number {
    return this.cfg.get<number>('auth.emailCodeRequestLimit') ?? 3;
  }

  private get requestWindowSeconds(): number {
    return this.cfg.get<number>('auth.emailCodeRequestWindowSeconds') ?? 900;
  }

  private get verificationLimit(): number {
    return this.cfg.get<number>('auth.emailCodeVerificationLimit') ?? 15;
  }

  private get verificationWindowSeconds(): number {
    return this.cfg.get<number>('auth.emailCodeVerificationWindowSeconds') ?? 900;
  }

  private challengeKey(email: string): string {
    return `auth:email-code:challenge:${this.emailDigest(email)}`;
  }

  private requestRateKey(email: string): string {
    return `auth:email-code:request:${this.emailDigest(email)}`;
  }

  private verificationRateKey(email: string): string {
    return `auth:email-code:verify:${this.emailDigest(email)}`;
  }

  private emailDigest(email: string): string {
    return createHmac('sha256', this.codeSecret).update(email).digest('hex');
  }
}

function generateCode(): string {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return code;
}

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import passport from 'passport';
import { OIDCStrategy, type IOidcProfile } from 'passport-azure-ad';
import { UserEntity } from './entities/user.entity';
import { UserIdentityService } from './user-identity.service';
import { microsoftAuthAvailability, microsoftTenantIssuers } from './microsoft-auth.config';

@Injectable()
export class MicrosoftAuthService implements OnModuleInit {
  constructor(
    private readonly cfg: ConfigService,
    private readonly identities: UserIdentityService,
  ) {}

  onModuleInit(): void {
    const tenantId = this.cfg.get<string>('azureAd.tenantId')?.trim();
    const clientId = this.cfg.get<string>('azureAd.clientId')?.trim();
    const clientSecret = this.cfg.get<string>('azureAd.clientSecret')?.trim();
    // Microsoft SSO is optional: register only when the authorization-code
    // credentials are complete enough to exchange a callback code.
    if (
      !microsoftAuthAvailability({ tenantId, clientId, clientSecret }).enabled ||
      !tenantId ||
      !clientId ||
      !clientSecret
    ) {
      return;
    }

    const opts: Record<string, unknown> = {
      identityMetadata: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
      clientID: clientId,
      responseType: 'code',
      responseMode: 'query',
      redirectUrl: this.cfg.get<string>('azureAd.redirectUrl'),
      allowHttpForRedirectUrl: this.cfg.get<string>('nodeEnv') !== 'production',
      clientSecret,
      scope: ['openid', 'email', 'profile', 'offline_access'],
      validateIssuer: true,
      issuer: microsoftTenantIssuers(tenantId),
      passReqToCallback: false,
    };

    const strategy = new OIDCStrategy(opts, (...args: unknown[]) => {
      const profile = (args[2] ?? args[0]) as IOidcProfile;
      const done = args[args.length - 1] as (err: unknown, user?: unknown) => void;
      this.findOrCreateFromMicrosoft(profile)
        .then((user) => done(null, user))
        .catch((err) => done(err));
    });
    passport.use('azure-ad', strategy as unknown as passport.Strategy);
  }

  async findOrCreateFromMicrosoft(profile: IOidcProfile): Promise<UserEntity> {
    const oid = profile.oid ?? profile.sub;
    const email = profile.emails?.[0]?.value ?? (profile._json?.email as string | undefined) ?? '';
    const user = await this.identities.findOrCreateFromMicrosoft({
      email,
      name: profile.displayName ?? email,
      subject: oid,
    });

    // OIDC proves identity only. Organization access is granted separately by
    // an administrator-created membership/invitation; email domains never grant roles.
    return user;
  }
}

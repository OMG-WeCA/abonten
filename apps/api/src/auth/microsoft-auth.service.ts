import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import passport from 'passport';
import { OIDCStrategy, type IOidcProfile } from 'passport-azure-ad';
import { DatabaseService } from '../common/database.service';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { MembershipEntity } from './entities/membership.entity';
import { UserEntity } from './entities/user.entity';
import { normalizeEmailIdentity } from './email-identity';
import { UserIdentityService } from './user-identity.service';

@Injectable()
export class MicrosoftAuthService implements OnModuleInit {
  constructor(
    private readonly cfg: ConfigService,
    private readonly db: DatabaseService,
    private readonly identities: UserIdentityService,
  ) {}

  onModuleInit(): void {
    const tenantId = this.cfg.get<string>('azureAd.tenantId');
    const clientId = this.cfg.get<string>('azureAd.clientId');
    // Microsoft SSO is optional: skip strategy registration if not configured.
    if (!tenantId || !clientId) return;

    const opts: Record<string, unknown> = {
      identityMetadata: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
      clientID: clientId,
      responseType: 'code',
      responseMode: 'query',
      redirectUrl: this.cfg.get<string>('azureAd.redirectUrl'),
      allowHttpForRedirectUrl: this.cfg.get<string>('nodeEnv') !== 'production',
      clientSecret: this.cfg.get<string>('azureAd.clientSecret'),
      scope: ['openid', 'email', 'profile', 'offline_access'],
      validateIssuer: false,
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

    // Link to an org whose allowedEmailDomains matches the user's email domain.
    if (email) {
      const domain = normalizeEmailIdentity(email).split('@')[1];
      if (domain) {
        const orgs = await this.db.repo(OrganizationEntity);
        const all = await orgs.find();
        const matched = all.find((organization) =>
          (organization.allowedEmailDomains ?? []).some(
            (allowedDomain) => normalizeEmailIdentity(allowedDomain) === domain,
          ),
        );
        if (matched) {
          const memberships = await this.db.repo(MembershipEntity);
          const existing = await memberships.findOne({
            where: { userId: user.id, organizationId: matched.id },
          });
          if (!existing) {
            try {
              await memberships.save(
                memberships.create({
                  userId: user.id,
                  organizationId: matched.id,
                  role: 'planner',
                  status: 'active',
                }),
              );
            } catch (error) {
              if (!isUniqueViolation(error)) throw error;
            }
          }
        }
      }
    }
    return user;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

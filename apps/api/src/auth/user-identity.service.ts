import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { IsNull, type Repository } from 'typeorm';
import { DatabaseService } from '../common/database.service';
import { normalizeEmailIdentity } from './email-identity';
import { UserEntity } from './entities/user.entity';

export interface NewUserProfile {
  name: string;
  status?: string;
  locale?: 'en' | 'fr';
}

export interface MicrosoftIdentityProfile extends NewUserProfile {
  email?: string;
  subject?: string;
}

@Injectable()
export class UserIdentityService {
  constructor(private readonly db: DatabaseService) {}

  async findOrCreateByEmail(emailInput: string, profile: NewUserProfile): Promise<UserEntity> {
    const email = normalizeEmailIdentity(emailInput);
    const users = await this.db.repo(UserEntity);
    const existing = await users.findOne({ where: { email } });
    if (existing) return existing;

    return this.createInvited(email, profile);
  }

  async findOrCreateFromMicrosoft(profile: MicrosoftIdentityProfile): Promise<UserEntity> {
    const subject = profile.subject?.trim() || undefined;
    const email = normalizeEmailIdentity(profile.email || `ms-${subject ?? 'unknown'}@local`);
    const users = await this.db.repo(UserEntity);

    const resolved = await this.resolveMicrosoftIdentity(users, email, subject);
    if (resolved) return resolved;

    return this.createInvited(email, profile, subject);
  }

  async canRequestCode(emailInput: string): Promise<boolean> {
    const email = normalizeEmailIdentity(emailInput),
      users = await this.db.repo(UserEntity);
    const existing = await users.findOne({ where: { email } });
    if (existing) return existing.status === 'active';
    const rows = await users.query(
      `SELECT 1 FROM invitations i LEFT JOIN organizations o ON o.id::text=i.organization_id WHERE i.email=$1 AND i.status='pending' AND i.expires_at>clock_timestamp() AND ((i.kind='account' AND i.account_type IN ('media_partner','agency','brand')) OR (i.kind='membership' AND o.status='active')) LIMIT 1`,
      [email],
    );
    return rows.length > 0;
  }

  private async createInvited(
    email: string,
    profile: NewUserProfile,
    subject?: string,
  ): Promise<UserEntity> {
    try {
      return await this.db.transaction(async (manager) => {
        const users = manager.getRepository(UserEntity);
        // The invitation lock serializes admission with resend/revoke and competing identities.
        const invitations = await manager.query(
          `SELECT i.id FROM invitations i LEFT JOIN organizations o ON o.id::text=i.organization_id WHERE i.email=$1 AND i.status='pending' AND i.expires_at>clock_timestamp() AND ((i.kind='account' AND i.account_type IN ('media_partner','agency','brand')) OR (i.kind='membership' AND o.status='active')) ORDER BY i.id LIMIT 1 FOR UPDATE OF i`,
          [email],
        );
        const existing = subject
          ? await this.resolveMicrosoftIdentity(users, email, subject)
          : await users.findOne({ where: { email } });
        if (existing) return existing;
        if (!invitations.length)
          throw new ForbiddenException('An invitation is required to join Abonten');
        // Check expiry again after any lock wait, using the database clock.
        const valid = await manager.query(
          `SELECT 1 FROM invitations WHERE id=$1 AND status='pending' AND expires_at>clock_timestamp()`,
          [invitations[0].id],
        );
        if (!valid.length)
          throw new ForbiddenException('An invitation is required to join Abonten');
        return users.save(
          users.create({
            email,
            name: profile.name,
            status: profile.status ?? 'active',
            ...(profile.locale ? { locale: profile.locale } : {}),
            ...(subject ? { msOauthSubject: subject } : {}),
          }),
        );
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const users = await this.db.repo(UserEntity);
      const existing = subject
        ? await this.resolveMicrosoftIdentity(users, email, subject)
        : await users.findOne({ where: { email } });
      if (existing) return existing;
      throw error;
    }
  }

  private async resolveMicrosoftIdentity(
    users: Repository<UserEntity>,
    email: string,
    subject?: string,
  ): Promise<UserEntity | null> {
    const bySubject = subject ? await users.findOne({ where: { msOauthSubject: subject } }) : null;
    const byEmail = await users.findOne({ where: { email } });

    if (bySubject && byEmail && bySubject.id !== byEmail.id) {
      throw this.microsoftIdentityConflict();
    }

    if (bySubject) return bySubject;
    if (!byEmail) return null;

    if (subject && byEmail.msOauthSubject && byEmail.msOauthSubject !== subject) {
      throw this.microsoftIdentityConflict();
    }

    if (subject && !byEmail.msOauthSubject) {
      try {
        await users.update(
          { id: byEmail.id, msOauthSubject: IsNull() },
          { msOauthSubject: subject },
        );
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }

      const linked = await users.findOne({ where: { id: byEmail.id } });
      if (linked?.msOauthSubject === subject) return linked;
      throw this.microsoftIdentityConflict();
    }

    return byEmail;
  }

  private microsoftIdentityConflict(): ConflictException {
    return new ConflictException(
      'Microsoft identity conflicts with an existing Abonten account. Contact an administrator before retrying.',
    );
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

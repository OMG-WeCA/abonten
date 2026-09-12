import { ConflictException, Injectable } from '@nestjs/common';
import { IsNull, type Repository } from 'typeorm';
import { DatabaseService } from '../common/database.service';
import { normalizeEmailIdentity } from './email-identity';
import { UserEntity } from './entities/user.entity';

export interface NewUserProfile {
  name: string;
  status?: string;
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

    try {
      return await users.save(
        users.create({
          email,
          name: profile.name,
          status: profile.status ?? 'active',
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const concurrent = await users.findOne({ where: { email } });
      if (concurrent) return concurrent;
      throw error;
    }
  }

  async findOrCreateFromMicrosoft(profile: MicrosoftIdentityProfile): Promise<UserEntity> {
    const subject = profile.subject?.trim() || undefined;
    const email = normalizeEmailIdentity(profile.email || `ms-${subject ?? 'unknown'}@local`);
    const users = await this.db.repo(UserEntity);

    const resolved = await this.resolveMicrosoftIdentity(users, email, subject);
    if (resolved) return resolved;

    try {
      return await users.save(
        users.create({
          email,
          name: profile.name || email,
          msOauthSubject: subject,
          status: profile.status ?? 'active',
        }),
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const concurrent = await this.resolveMicrosoftIdentity(users, email, subject);
      if (concurrent) return concurrent;
      throw this.microsoftIdentityConflict();
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

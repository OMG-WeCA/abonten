import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import type { DatabaseService } from '../common/database.service';
import { UserEntity } from './entities/user.entity';
import { UserIdentityService } from './user-identity.service';

class FakeUsers {
  readonly users: UserEntity[] = [];
  failNextSaveWithConcurrent?: UserEntity;
  beforeConditionalUpdate?: (user: UserEntity) => void;

  async findOne({
    where,
  }: {
    where: Partial<Pick<UserEntity, 'id' | 'email' | 'msOauthSubject'>>;
  }): Promise<UserEntity | null> {
    return (
      this.users.find(
        (user) =>
          (where.id !== undefined && user.id === where.id) ||
          (where.email !== undefined && user.email === where.email) ||
          (typeof where.msOauthSubject === 'string' &&
            user.msOauthSubject === where.msOauthSubject),
      ) ?? null
    );
  }

  async update(
    where: Partial<Pick<UserEntity, 'id' | 'msOauthSubject'>>,
    update: Partial<Pick<UserEntity, 'msOauthSubject'>>,
  ): Promise<{ affected: number }> {
    const user = this.users.find((candidate) => candidate.id === where.id);
    if (!user) return { affected: 0 };
    this.beforeConditionalUpdate?.(user);
    this.beforeConditionalUpdate = undefined;
    if (user.msOauthSubject) return { affected: 0 };
    user.msOauthSubject = update.msOauthSubject;
    return { affected: 1 };
  }

  create(input: Partial<UserEntity>): UserEntity {
    return { id: `user-${this.users.length + 1}`, ...input } as UserEntity;
  }

  async save(user: UserEntity): Promise<UserEntity> {
    if (this.failNextSaveWithConcurrent) {
      const concurrent = this.failNextSaveWithConcurrent;
      this.failNextSaveWithConcurrent = undefined;
      this.users.push(concurrent);
      throw Object.assign(new Error('unique violation'), { code: '23505' });
    }
    const index = this.users.findIndex((candidate) => candidate.id === user.id);
    if (index >= 0) this.users[index] = user;
    else this.users.push(user);
    return user;
  }
}

function createSubject() {
  const users = new FakeUsers();
  const db = { repo: async () => users } as unknown as DatabaseService;
  return { service: new UserIdentityService(db), users };
}

describe('UserIdentityService', () => {
  it('uses the chosen sign-in language for new accounts without overwriting existing preferences', async () => {
    const { service } = createSubject();
    const created = await service.findOrCreateByEmail('french@example.com', {
      name: 'French',
      locale: 'fr',
    });
    assert.equal(created.locale, 'fr');
    const existing = await service.findOrCreateByEmail('french@example.com', {
      name: 'Other',
      locale: 'en',
    });
    assert.equal(existing.locale, 'fr');
    assert.equal(existing.name, 'French');
  });

  it('canonicalizes email creation and recovers the winner of a concurrent insert', async () => {
    const { service, users } = createSubject();
    users.failNextSaveWithConcurrent = {
      id: 'concurrent-user',
      email: 'person@example.com',
      name: 'Concurrent',
      status: 'active',
    } as UserEntity;

    const user = await service.findOrCreateByEmail(' Person@Example.com ', { name: 'Person' });
    assert.equal(user.id, 'concurrent-user');
    assert.equal(user.email, 'person@example.com');
    assert.equal(users.users.length, 1);
  });

  it('links a case-normalized Microsoft identity to the existing email user', async () => {
    const { service, users } = createSubject();
    users.users.push({
      id: 'existing-user',
      email: 'person@example.com',
      name: 'Person',
      status: 'active',
    } as UserEntity);

    const user = await service.findOrCreateFromMicrosoft({
      email: 'PERSON@EXAMPLE.COM',
      name: 'Microsoft Person',
      subject: 'microsoft-subject',
    });
    assert.equal(user.id, 'existing-user');
    assert.equal(user.msOauthSubject, 'microsoft-subject');
    assert.equal(users.users.length, 1);
  });

  it('accepts an idempotent same-subject race after reloading the linked row', async () => {
    const { service, users } = createSubject();
    const existing = {
      id: 'existing-user',
      email: 'person@example.com',
      name: 'Person',
      status: 'active',
    } as UserEntity;
    users.users.push(existing);
    users.beforeConditionalUpdate = (user) => {
      user.msOauthSubject = 'microsoft-subject';
    };

    const user = await service.findOrCreateFromMicrosoft({
      email: 'person@example.com',
      name: 'Microsoft Person',
      subject: 'microsoft-subject',
    });
    assert.equal(user.id, existing.id);
    assert.equal(user.msOauthSubject, 'microsoft-subject');
  });

  it('rejects a different subject that wins the link race', async () => {
    const { service, users } = createSubject();
    const existing = {
      id: 'existing-user',
      email: 'person@example.com',
      name: 'Person',
      status: 'active',
    } as UserEntity;
    users.users.push(existing);
    users.beforeConditionalUpdate = (user) => {
      user.msOauthSubject = 'competing-subject';
    };

    await assert.rejects(
      () =>
        service.findOrCreateFromMicrosoft({
          email: 'person@example.com',
          name: 'Microsoft Person',
          subject: 'requested-subject',
        }),
      ConflictException,
    );
    assert.equal(existing.msOauthSubject, 'competing-subject');
  });

  it('fails safely when Microsoft subject and canonical email resolve to different users', async () => {
    const { service, users } = createSubject();
    users.users.push(
      {
        id: 'subject-user',
        email: 'old@example.com',
        name: 'Subject User',
        status: 'active',
        msOauthSubject: 'microsoft-subject',
      } as UserEntity,
      {
        id: 'email-user',
        email: 'new@example.com',
        name: 'Email User',
        status: 'active',
      } as UserEntity,
    );

    await assert.rejects(
      () =>
        service.findOrCreateFromMicrosoft({
          email: 'NEW@EXAMPLE.COM',
          name: 'Microsoft Person',
          subject: 'microsoft-subject',
        }),
      ConflictException,
    );
    assert.equal(users.users[1].msOauthSubject, undefined);
  });
});

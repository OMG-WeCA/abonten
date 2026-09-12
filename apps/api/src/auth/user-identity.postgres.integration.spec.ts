import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { DataSource, type Repository } from 'typeorm';
import type { DatabaseService } from '../common/database.service';
import { UserEntity } from './entities/user.entity';
import { UserIdentityService } from './user-identity.service';

const databaseUrl = process.env.POSTGRES_INTEGRATION_URL;

async function withUserRepository(
  test: (repository: Repository<UserEntity>) => Promise<void>,
): Promise<void> {
  if (!databaseUrl) throw new Error('POSTGRES_INTEGRATION_URL is required');
  const schema = `identity_link_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new DataSource({ type: 'postgres', url: databaseUrl });
  await admin.initialize();
  let dataSource: DataSource | undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await admin.query(`
      CREATE TABLE "${schema}".users (
        id uuid NOT NULL PRIMARY KEY,
        email varchar NOT NULL UNIQUE,
        name varchar NOT NULL,
        phone varchar,
        locale varchar NOT NULL DEFAULT 'en',
        status varchar NOT NULL DEFAULT 'active',
        ms_oauth_subject varchar,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "UQ_users_ms_oauth_subject"
        ON "${schema}".users (ms_oauth_subject)
        WHERE ms_oauth_subject IS NOT NULL;
    `);
    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      schema,
      synchronize: false,
      entities: [UserEntity],
    });
    await dataSource.initialize();
    await test(dataSource.getRepository(UserEntity));
  } finally {
    if (dataSource?.isInitialized) await dataSource.destroy();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await admin.destroy();
  }
}

function serviceWithUpdateBarrier(repository: Repository<UserEntity>): UserIdentityService {
  let arrivals = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const users = {
    findOne: repository.findOne.bind(repository),
    create: repository.create.bind(repository),
    save: repository.save.bind(repository),
    async update(
      criteria: Parameters<Repository<UserEntity>['update']>[0],
      partial: Parameters<Repository<UserEntity>['update']>[1],
    ) {
      arrivals += 1;
      if (arrivals === 2) release();
      await gate;
      return repository.update(criteria, partial);
    },
  } as unknown as Repository<UserEntity>;
  const db = { repo: async () => users } as unknown as DatabaseService;
  return new UserIdentityService(db);
}

async function insertEmailOnlyUser(
  repository: Repository<UserEntity>,
  email: string,
): Promise<UserEntity> {
  return repository.save(
    repository.create({
      id: randomUUID(),
      email,
      name: 'Concurrent User',
      status: 'active',
    }),
  );
}

describe('UserIdentityService Microsoft linking against PostgreSQL', () => {
  it(
    'atomically permits one different-subject winner and idempotent same-subject callers',
    { skip: !databaseUrl },
    async () => {
      await withUserRepository(async (repository) => {
        const contested = await insertEmailOnlyUser(repository, 'contested@example.com');
        const contestedService = serviceWithUpdateBarrier(repository);
        const contestedResults = await Promise.allSettled([
          contestedService.findOrCreateFromMicrosoft({
            email: contested.email,
            name: contested.name,
            subject: 'subject-one',
          }),
          contestedService.findOrCreateFromMicrosoft({
            email: contested.email,
            name: contested.name,
            subject: 'subject-two',
          }),
        ]);

        const winner = contestedResults.find(
          (result): result is PromiseFulfilledResult<UserEntity> => result.status === 'fulfilled',
        );
        const loser = contestedResults.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        assert.ok(winner);
        assert.ok(loser);
        assert.equal(contestedResults.filter((result) => result.status === 'fulfilled').length, 1);
        assert.ok(loser.reason instanceof ConflictException);
        const persistedWinner = await repository.findOneByOrFail({ id: contested.id });
        assert.equal(persistedWinner.msOauthSubject, winner.value.msOauthSubject);
        assert.ok(['subject-one', 'subject-two'].includes(persistedWinner.msOauthSubject ?? ''));

        const idempotent = await insertEmailOnlyUser(repository, 'idempotent@example.com');
        const idempotentService = serviceWithUpdateBarrier(repository);
        const sameSubjectResults = await Promise.all([
          idempotentService.findOrCreateFromMicrosoft({
            email: idempotent.email,
            name: idempotent.name,
            subject: 'shared-subject',
          }),
          idempotentService.findOrCreateFromMicrosoft({
            email: idempotent.email,
            name: idempotent.name,
            subject: 'shared-subject',
          }),
        ]);
        assert.deepEqual(
          sameSubjectResults.map((user) => [user.id, user.msOauthSubject]),
          [
            [idempotent.id, 'shared-subject'],
            [idempotent.id, 'shared-subject'],
          ],
        );
      });
    },
  );
});

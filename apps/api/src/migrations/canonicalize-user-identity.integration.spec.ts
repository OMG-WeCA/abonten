import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { DataSource, type QueryRunner } from 'typeorm';
import { CanonicalizeUserIdentity1720000000002 } from './1720000000002-CanonicalizeUserIdentity';

const databaseUrl = process.env.POSTGRES_INTEGRATION_URL;

async function withFixtureSchema(test: (queryRunner: QueryRunner) => Promise<void>): Promise<void> {
  if (!databaseUrl) throw new Error('POSTGRES_INTEGRATION_URL is required');
  const schema = `identity_test_${randomUUID().replaceAll('-', '')}`;
  const dataSource = new DataSource({ type: 'postgres', url: databaseUrl });
  await dataSource.initialize();
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  try {
    await queryRunner.query(`CREATE SCHEMA "${schema}"`);
    await queryRunner.query(`SET search_path TO "${schema}"`);
    await createIdentityFixtureTables(queryRunner);
    await test(queryRunner);
  } finally {
    await queryRunner.query('SET search_path TO public').catch(() => undefined);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await queryRunner.release();
    await dataSource.destroy();
  }
}

async function createIdentityFixtureTables(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`
    CREATE TABLE users (
      id uuid PRIMARY KEY,
      email varchar NOT NULL UNIQUE,
      name varchar NOT NULL,
      phone varchar,
      locale varchar NOT NULL DEFAULT 'en',
      status varchar NOT NULL DEFAULT 'active',
      ms_oauth_subject varchar,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE memberships (
      id uuid PRIMARY KEY,
      user_id varchar NOT NULL,
      organization_id varchar NOT NULL,
      role varchar NOT NULL,
      status varchar NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE user_capability_overrides (
      id uuid PRIMARY KEY,
      user_id varchar NOT NULL,
      organization_id varchar NOT NULL,
      capability varchar NOT NULL,
      action varchar NOT NULL,
      created_by varchar,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE refresh_tokens (
      id uuid PRIMARY KEY,
      user_id varchar NOT NULL,
      token_hash varchar NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE issues (
      id uuid PRIMARY KEY,
      assigned_user_id varchar
    );
    CREATE TABLE issue_comments (
      id uuid PRIMARY KEY,
      author_user_id varchar NOT NULL
    );
    CREATE TABLE alert_rules (
      id uuid PRIMARY KEY,
      user_id varchar
    );
    CREATE TABLE audit_logs (
      id uuid PRIMARY KEY,
      actor_user_id varchar
    );
  `);
}

describe('CanonicalizeUserIdentity migration', () => {
  it(
    'reconciles compatible duplicates, preserves all references, enforces uniqueness, and reverts',
    { skip: !databaseUrl },
    async () => {
      await withFixtureSchema(async (queryRunner) => {
        const keeperId = randomUUID();
        const duplicateId = randomUUID();
        const orgOne = randomUUID();
        const orgTwo = randomUUID();
        const membershipOne = randomUUID();
        const membershipDuplicate = randomUUID();
        const membershipTwo = randomUUID();
        const overrideId = randomUUID();
        const refreshId = randomUUID();
        const issueId = randomUUID();
        const commentId = randomUUID();
        const alertId = randomUUID();
        const auditId = randomUUID();

        await queryRunner.query(
          `INSERT INTO users
             (id, email, name, phone, locale, status, ms_oauth_subject, created_at, updated_at)
           VALUES
             ($1, 'Person@Example.com', 'Person', NULL, 'en', 'active', NULL, now() - interval '1 day', now()),
             ($2, 'person@example.com', 'Person', '+2335550100', 'en', 'active', 'ms-subject', now(), now())`,
          [keeperId, duplicateId],
        );
        await queryRunner.query(
          `INSERT INTO memberships
             (id, user_id, organization_id, role, status)
           VALUES
             ($1, $4, $7, 'planner', 'active'),
             ($2, $5, $7, 'planner', 'active'),
             ($3, $5, $6, 'client_viewer', 'active')`,
          [
            membershipOne,
            membershipDuplicate,
            membershipTwo,
            keeperId,
            duplicateId,
            orgTwo,
            orgOne,
          ],
        );
        await queryRunner.query(
          `INSERT INTO user_capability_overrides
             (id, user_id, organization_id, capability, action, created_by)
           VALUES ($1, $2, $3, 'REPORT_VIEW', 'grant', $2)`,
          [overrideId, duplicateId, orgOne],
        );
        await queryRunner.query(
          `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
           VALUES ($1, $2, 'hash', now() + interval '1 day')`,
          [refreshId, duplicateId],
        );
        await queryRunner.query(`INSERT INTO issues VALUES ($1, $2)`, [issueId, duplicateId]);
        await queryRunner.query(`INSERT INTO issue_comments VALUES ($1, $2)`, [
          commentId,
          duplicateId,
        ]);
        await queryRunner.query(`INSERT INTO alert_rules VALUES ($1, $2)`, [alertId, duplicateId]);
        await queryRunner.query(`INSERT INTO audit_logs VALUES ($1, $2)`, [auditId, duplicateId]);

        const migration = new CanonicalizeUserIdentity1720000000002();
        await migration.up(queryRunner);

        const reconciledUsers = (await queryRunner.query(
          `SELECT id, email, phone, ms_oauth_subject FROM users`,
        )) as unknown as Array<Record<string, string>>;
        assert.deepEqual(reconciledUsers, [
          {
            id: keeperId,
            email: 'person@example.com',
            phone: '+2335550100',
            ms_oauth_subject: 'ms-subject',
          },
        ]);
        const reconciledMemberships = (await queryRunner.query(
          `SELECT organization_id, role, status FROM memberships ORDER BY organization_id`,
        )) as unknown as Array<Record<string, string>>;
        assert.equal(reconciledMemberships.length, 2);
        assert.deepEqual(
          new Set(reconciledMemberships.map((membership) => membership.organization_id)),
          new Set([orgOne, orgTwo]),
        );

        for (const [table, column, id] of [
          ['user_capability_overrides', 'user_id', overrideId],
          ['user_capability_overrides', 'created_by', overrideId],
          ['refresh_tokens', 'user_id', refreshId],
          ['issues', 'assigned_user_id', issueId],
          ['issue_comments', 'author_user_id', commentId],
          ['alert_rules', 'user_id', alertId],
          ['audit_logs', 'actor_user_id', auditId],
        ] as const) {
          const rows = (await queryRunner.query(
            `SELECT "${column}" AS user_id FROM "${table}" WHERE id = $1`,
            [id],
          )) as unknown as Array<{ user_id: string }>;
          assert.equal(rows[0].user_id, keeperId, `${table}.${column} was reconciled`);
        }

        await assert.rejects(
          () =>
            queryRunner.query(
              `INSERT INTO users (id, email, name) VALUES ($1, 'PERSON@example.com', 'Other')`,
              [randomUUID()],
            ),
          (error: unknown) =>
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            ['23505', '23514'].includes(String((error as { code?: unknown }).code)),
        );

        await migration.down(queryRunner);
        const restoredUsers = (await queryRunner.query(
          `SELECT id, email FROM users ORDER BY email`,
        )) as unknown as Array<{ id: string; email: string }>;
        assert.deepEqual(
          new Map(restoredUsers.map((user) => [user.id, user.email])),
          new Map([
            [keeperId, 'Person@Example.com'],
            [duplicateId, 'person@example.com'],
          ]),
        );
        const restoredMemberships = (await queryRunner.query(
          `SELECT id, user_id FROM memberships ORDER BY id`,
        )) as unknown as Array<{ id: string; user_id: string }>;
        assert.equal(restoredMemberships.length, 3);
        assert.equal(
          restoredMemberships.find((membership) => membership.id === membershipDuplicate)?.user_id,
          duplicateId,
        );
        const restoredRefresh = (await queryRunner.query(
          `SELECT user_id FROM refresh_tokens WHERE id = $1`,
          [refreshId],
        )) as unknown as Array<{ user_id: string }>;
        assert.equal(restoredRefresh[0].user_id, duplicateId);
      });
    },
  );

  it(
    'fails before mutation when duplicate memberships disagree on role or access status',
    { skip: !databaseUrl },
    async () => {
      await withFixtureSchema(async (queryRunner) => {
        const firstId = randomUUID();
        const secondId = randomUUID();
        const orgId = randomUUID();
        await queryRunner.query(
          `INSERT INTO users (id, email, name, status)
           VALUES ($1, 'Conflict@Example.com', 'Person', 'active'),
                  ($2, 'conflict@example.com', 'Person', 'active')`,
          [firstId, secondId],
        );
        await queryRunner.query(
          `INSERT INTO memberships (id, user_id, organization_id, role, status)
           VALUES ($1, $3, $5, 'planner', 'active'),
                  ($2, $4, $5, 'org_owner', 'revoked')`,
          [randomUUID(), randomUUID(), firstId, secondId, orgId],
        );

        const migration = new CanonicalizeUserIdentity1720000000002();
        await assert.rejects(
          () => migration.up(queryRunner),
          /memberships disagree on role or status; no privilege was selected/,
        );
        const users = (await queryRunner.query(
          `SELECT email FROM users ORDER BY email`,
        )) as unknown as Array<{ email: string }>;
        assert.deepEqual(
          users.map((user) => user.email).sort(),
          ['Conflict@Example.com', 'conflict@example.com'].sort(),
        );
        const archives = (await queryRunner.query(
          `SELECT to_regclass('user_identity_reconciliations') AS archive`,
        )) as unknown as Array<{ archive: string | null }>;
        assert.equal(archives[0].archive, null);
      });
    },
  );
});

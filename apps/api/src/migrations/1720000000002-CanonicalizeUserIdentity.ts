import type { MigrationInterface, QueryRunner } from 'typeorm';

interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  locale: string;
  status: string;
  ms_oauth_subject: string | null;
  created_at: Date;
}

interface MembershipRow {
  id: string;
  user_id: string;
  organization_id: string;
  role: string;
  status: string;
}

interface CapabilityOverrideRow {
  id: string;
  user_id: string;
  organization_id: string;
  capability: string;
  action: string;
}

interface ReconciliationReference {
  table_name: string;
  column_name: string;
  row_id: string;
  user_id: string;
}

const USER_REFERENCE_COLUMNS = [
  ['memberships', 'user_id'],
  ['user_capability_overrides', 'user_id'],
  ['user_capability_overrides', 'created_by'],
  ['refresh_tokens', 'user_id'],
  ['issues', 'assigned_user_id'],
  ['issue_comments', 'author_user_id'],
  ['alert_rules', 'user_id'],
  ['audit_logs', 'actor_user_id'],
] as const;

/**
 * Makes email identity canonical and concurrency-safe without guessing through
 * authorization conflicts. Original identity rows and every rewired reference
 * are retained in reconciliation tables so an immediate migration revert can
 * restore the pre-migration shape.
 */
export class CanonicalizeUserIdentity1720000000002 implements MigrationInterface {
  name = 'CanonicalizeUserIdentity1720000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    const users = (await queryRunner.query(
      `SELECT id, email, name, phone, locale, status, ms_oauth_subject, created_at
       FROM users
       ORDER BY created_at, id`,
    )) as unknown as UserRow[];
    const memberships = (await queryRunner.query(
      `SELECT id, user_id, organization_id, role, status FROM memberships`,
    )) as unknown as MembershipRow[];
    const overrides = (await queryRunner.query(
      `SELECT id, user_id, organization_id, capability, action
       FROM user_capability_overrides`,
    )) as unknown as CapabilityOverrideRow[];

    const groups = groupUsersByCanonicalEmail(users);
    const canonicalUserByUserId = new Map<string, string>();
    for (const group of groups.values()) {
      const canonicalUserId = group[0].id;
      for (const user of group) canonicalUserByUserId.set(user.id, canonicalUserId);
      this.assertCompatibleProfiles(group);
    }
    this.assertCompatibleMicrosoftSubjects(users, canonicalUserByUserId);
    this.assertCompatibleMemberships(memberships, canonicalUserByUserId);
    this.assertCompatibleOverrides(overrides, canonicalUserByUserId);

    await queryRunner.query(`
      CREATE TABLE "user_identity_reconciliations" (
        "user_id" uuid NOT NULL PRIMARY KEY,
        "canonical_user_id" uuid NOT NULL,
        "original_user" jsonb NOT NULL,
        "was_removed" boolean NOT NULL,
        "reconciled_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "user_identity_reconciliation_references" (
        "user_id" uuid NOT NULL,
        "table_name" varchar NOT NULL,
        "column_name" varchar NOT NULL,
        "row_id" uuid NOT NULL,
        PRIMARY KEY ("user_id", "table_name", "column_name", "row_id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "user_identity_reconciliation_removed_memberships" (
        "id" uuid NOT NULL PRIMARY KEY,
        "original_row" jsonb NOT NULL
      )
    `);

    for (const group of groups.values()) {
      const canonicalUser = group[0];
      const canonicalEmail = canonicalEmailOf(canonicalUser.email);
      const requiresArchive = group.length > 1 || canonicalUser.email !== canonicalEmail;
      if (!requiresArchive) continue;

      const groupIds = group.map((user) => user.id);
      await queryRunner.query(
        `INSERT INTO user_identity_reconciliations
           (user_id, canonical_user_id, original_user, was_removed)
         SELECT id, $1, to_jsonb(users), id <> $1
         FROM users
         WHERE id = ANY($2::uuid[])`,
        [canonicalUser.id, groupIds],
      );

      const loserIds = groupIds.filter((id) => id !== canonicalUser.id);
      for (const loserId of loserIds) {
        for (const [tableName, columnName] of USER_REFERENCE_COLUMNS) {
          await queryRunner.query(
            `INSERT INTO user_identity_reconciliation_references
               (user_id, table_name, column_name, row_id)
             SELECT $1::uuid, $2::varchar, $3::varchar, id
             FROM "${tableName}"
             WHERE "${columnName}" = $1::varchar`,
            [loserId, tableName, columnName],
          );
        }
      }
      for (const [tableName, columnName] of USER_REFERENCE_COLUMNS) {
        await queryRunner.query(
          `UPDATE "${tableName}" SET "${columnName}" = $1
           WHERE "${columnName}" = ANY($2::varchar[])`,
          [canonicalUser.id, loserIds],
        );
      }

      const preservedPhone = group.find((user) => user.phone)?.phone ?? null;
      const preservedSubject =
        group.find((user) => user.ms_oauth_subject)?.ms_oauth_subject ?? null;
      if (loserIds.length > 0) {
        await queryRunner.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [loserIds]);
      }
      await queryRunner.query(
        `UPDATE users
         SET email = $1,
             phone = $2,
             ms_oauth_subject = $3,
             updated_at = now()
         WHERE id = $4`,
        [canonicalEmail, preservedPhone, preservedSubject, canonicalUser.id],
      );
    }

    // Canonicalize non-duplicate rows after their originals have been archived.
    await queryRunner.query(
      `UPDATE users SET email = lower(btrim(email)) WHERE email <> lower(btrim(email))`,
    );

    // Repointing duplicate identities can produce semantically identical duplicate
    // memberships. Archive and remove only those exact duplicates; conflicts were
    // rejected during preflight.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT id,
               row_number() OVER (
                 PARTITION BY user_id, organization_id
                 ORDER BY created_at, id
               ) AS duplicate_rank
        FROM memberships
      )
      INSERT INTO user_identity_reconciliation_removed_memberships (id, original_row)
      SELECT memberships.id, to_jsonb(memberships)
      FROM memberships
      JOIN ranked ON ranked.id = memberships.id
      WHERE ranked.duplicate_rank > 1
    `);
    await queryRunner.query(`
      DELETE FROM memberships
      WHERE id IN (SELECT id FROM user_identity_reconciliation_removed_memberships)
    `);

    await queryRunner.query(
      `ALTER TABLE users
       ADD CONSTRAINT "CHK_users_email_canonical"
       CHECK (email = lower(btrim(email)))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_email_canonical" ON users ((lower(btrim(email))))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_ms_oauth_subject"
       ON users (ms_oauth_subject) WHERE ms_oauth_subject IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_memberships_user_organization"
       ON memberships (user_id, organization_id)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_memberships_user_organization"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_ms_oauth_subject"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email_canonical"`);
    await queryRunner.query(
      `ALTER TABLE users DROP CONSTRAINT IF EXISTS "CHK_users_email_canonical"`,
    );

    // Restore canonical/retained rows before inserting removed case variants so
    // the original exact-case users.email uniqueness is not transiently violated.
    await queryRunner.query(`
      UPDATE users
      SET email = reconciliations.original_user->>'email',
          name = reconciliations.original_user->>'name',
          phone = reconciliations.original_user->>'phone',
          locale = reconciliations.original_user->>'locale',
          status = reconciliations.original_user->>'status',
          ms_oauth_subject = reconciliations.original_user->>'ms_oauth_subject',
          created_at = (reconciliations.original_user->>'created_at')::timestamptz,
          updated_at = (reconciliations.original_user->>'updated_at')::timestamptz
      FROM user_identity_reconciliations AS reconciliations
      WHERE users.id = reconciliations.user_id
        AND reconciliations.was_removed = false
    `);
    await queryRunner.query(`
      INSERT INTO users
        (id, email, name, phone, locale, status, ms_oauth_subject, created_at, updated_at)
      SELECT user_id,
             original_user->>'email',
             original_user->>'name',
             original_user->>'phone',
             original_user->>'locale',
             original_user->>'status',
             original_user->>'ms_oauth_subject',
             (original_user->>'created_at')::timestamptz,
             (original_user->>'updated_at')::timestamptz
      FROM user_identity_reconciliations
      WHERE was_removed = true
      ON CONFLICT (id) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO memberships
      SELECT *
      FROM jsonb_populate_recordset(
        NULL::memberships,
        COALESCE(
          (SELECT jsonb_agg(original_row)
           FROM user_identity_reconciliation_removed_memberships),
          '[]'::jsonb
        )
      )
      ON CONFLICT (id) DO NOTHING
    `);

    const references = (await queryRunner.query(
      `SELECT table_name, column_name, row_id, user_id
       FROM user_identity_reconciliation_references`,
    )) as unknown as ReconciliationReference[];
    for (const reference of references) {
      if (!isKnownReference(reference.table_name, reference.column_name)) {
        throw new Error(
          `Identity reconciliation rollback found an unknown reference target: ${reference.table_name}.${reference.column_name}`,
        );
      }
      await queryRunner.query(
        `UPDATE "${reference.table_name}" SET "${reference.column_name}" = $1 WHERE id = $2`,
        [reference.user_id, reference.row_id],
      );
    }

    await queryRunner.query(`DROP TABLE "user_identity_reconciliation_removed_memberships"`);
    await queryRunner.query(`DROP TABLE "user_identity_reconciliation_references"`);
    await queryRunner.query(`DROP TABLE "user_identity_reconciliations"`);
  }

  private assertCompatibleProfiles(group: UserRow[]): void {
    if (group.length < 2) return;
    const canonicalEmail = canonicalEmailOf(group[0].email);
    this.assertOneValue(
      canonicalEmail,
      'name',
      group.map((user) => user.name),
    );
    this.assertOneValue(
      canonicalEmail,
      'locale',
      group.map((user) => user.locale),
    );
    this.assertOneValue(
      canonicalEmail,
      'status',
      group.map((user) => user.status),
    );
    this.assertOneValue(
      canonicalEmail,
      'phone',
      group.map((user) => user.phone).filter((value): value is string => Boolean(value)),
    );
    this.assertOneValue(
      canonicalEmail,
      'Microsoft subject',
      group.map((user) => user.ms_oauth_subject).filter((value): value is string => Boolean(value)),
    );
  }

  private assertOneValue(canonicalEmail: string, field: string, values: string[]): void {
    const uniqueValues = new Set(values);
    if (uniqueValues.size > 1) {
      throw new Error(
        `Identity reconciliation blocked for ${canonicalEmail}: conflicting ${field} values require manual resolution.`,
      );
    }
  }

  private assertCompatibleMicrosoftSubjects(
    users: UserRow[],
    canonicalUserByUserId: Map<string, string>,
  ): void {
    const subjects = new Map<string, Set<string>>();
    for (const user of users) {
      if (!user.ms_oauth_subject) continue;
      const canonicalUserId = canonicalUserByUserId.get(user.id) ?? user.id;
      const owners = subjects.get(user.ms_oauth_subject) ?? new Set<string>();
      owners.add(canonicalUserId);
      subjects.set(user.ms_oauth_subject, owners);
    }
    for (const [subject, owners] of subjects) {
      if (owners.size > 1) {
        throw new Error(
          `Identity reconciliation blocked: Microsoft subject ${subject} belongs to multiple canonical identities (${[...owners].join(', ')}).`,
        );
      }
    }
  }

  private assertCompatibleMemberships(
    memberships: MembershipRow[],
    canonicalUserByUserId: Map<string, string>,
  ): void {
    const values = new Map<string, { roles: Set<string>; statuses: Set<string> }>();
    for (const membership of memberships) {
      const userId = canonicalUserByUserId.get(membership.user_id) ?? membership.user_id;
      const key = `${userId}:${membership.organization_id}`;
      const current = values.get(key) ?? { roles: new Set<string>(), statuses: new Set<string>() };
      current.roles.add(membership.role);
      current.statuses.add(membership.status);
      values.set(key, current);
    }
    for (const [identityAndOrg, value] of values) {
      if (value.roles.size > 1 || value.statuses.size > 1) {
        throw new Error(
          `Identity reconciliation blocked for user/organization ${identityAndOrg}: memberships disagree on role or status; no privilege was selected.`,
        );
      }
    }
  }

  private assertCompatibleOverrides(
    overrides: CapabilityOverrideRow[],
    canonicalUserByUserId: Map<string, string>,
  ): void {
    const actions = new Map<string, Set<string>>();
    for (const override of overrides) {
      const userId = canonicalUserByUserId.get(override.user_id) ?? override.user_id;
      const key = `${userId}:${override.organization_id}:${override.capability}`;
      const current = actions.get(key) ?? new Set<string>();
      current.add(override.action);
      actions.set(key, current);
    }
    for (const [identityOrgCapability, values] of actions) {
      if (values.size > 1) {
        throw new Error(
          `Identity reconciliation blocked for ${identityOrgCapability}: capability overrides disagree; no grant or revoke was selected.`,
        );
      }
    }
  }
}

function canonicalEmailOf(email: string): string {
  return email.trim().toLowerCase();
}

function groupUsersByCanonicalEmail(users: UserRow[]): Map<string, UserRow[]> {
  const groups = new Map<string, UserRow[]>();
  for (const user of users) {
    const canonicalEmail = canonicalEmailOf(user.email);
    const group = groups.get(canonicalEmail) ?? [];
    group.push(user);
    groups.set(canonicalEmail, group);
  }
  return groups;
}

function isKnownReference(tableName: string, columnName: string): boolean {
  return USER_REFERENCE_COLUMNS.some(
    ([knownTable, knownColumn]) => knownTable === tableName && knownColumn === columnName,
  );
}

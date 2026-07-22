import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remediate legacy non-platform platform_admin memberships and platform-only
 * capability overrides. Organizations of type != 'platform' should never have
 * platform_admin role members or platform-only capability grants; this
 * migration changes those memberships to org_admin and removes the overrides,
 * as an explicit, auditable data-remediation policy.
 */
export class RemediateNonPlatformPlatformAdmin1720000000001 implements MigrationInterface {
  name = 'RemediateNonPlatformPlatformAdmin1720000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Change platform_admin memberships in non-platform orgs to org_admin.
    await queryRunner.query(`
      UPDATE memberships
      SET role = 'org_admin', updated_at = now()
      WHERE role = 'platform_admin'
        AND organization_id IN (SELECT id::text FROM organizations WHERE type != 'platform')
    `);

    // Remove platform-only capability grants in non-platform orgs.
    await queryRunner.query(`
      DELETE FROM user_capability_overrides
      WHERE capability IN (
          'PLATFORM_ADMIN', 'USER_MANAGE', 'AUDIT_VIEW',
          'REFERENCE_DATA_MANAGE', 'MARKETPLACE_MANAGE', 'REPORT_MANAGE'
        )
        AND organization_id IN (SELECT id::text FROM organizations WHERE type != 'platform')
    `);
  }

  async down(): Promise<void> {
    // Remediation is not reversible — the original role/override data is lost.
  }
}
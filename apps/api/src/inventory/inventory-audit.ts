import type { EntityManager } from 'typeorm';
import { AuditLogEntity } from '../common/entities/audit-log.entity';

/**
 * Transactional inventory audit writes (SPEC §6.5 / execution plan §1.2).
 *
 * Every inventory mutation writes exactly ONE audit_logs row inside the SAME
 * database transaction as the mutation itself: if the audit insert fails the
 * mutation rolls back, and if the mutation fails no audit row is committed.
 * Audit rows carry actor, organization, action, entity type + id, and
 * before/after snapshots — mirroring the organization-flow audit pattern.
 *
 * Entity-type names follow the storage tables so audit entries stay greppable
 * against the data model (SPEC §6.3).
 */
export const INVENTORY_AUDIT_ENTITY = {
  site: 'billboard_site',
  face: 'site_face',
  asset: 'site_asset',
  metadata: 'site_metadata',
  rateCard: 'rate_card',
} as const;

export type InventoryAuditAction =
  | 'inventory.site.created'
  | 'inventory.site.updated'
  | 'inventory.site.deleted'
  | 'inventory.site.submitted'
  | 'inventory.site.approved'
  | 'inventory.site.rejected'
  | 'inventory.site.suspended'
  | 'inventory.site.unsuspended'
  | 'inventory.face.added'
  | 'inventory.face.updated'
  | 'inventory.face.removed'
  | 'inventory.asset.added'
  | 'inventory.asset.deleted'
  | 'inventory.metadata.added'
  | 'inventory.metadata.updated'
  | 'inventory.rate_card.created'
  | 'inventory.rate_card.updated';

export interface InventoryAuditActor {
  userId?: string;
  orgId?: string;
}

export interface InventoryAuditEntry {
  action: InventoryAuditAction;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/** Must be called with the same manager/transaction as the mutation itself. */
export async function writeInventoryAudit(
  manager: EntityManager,
  actor: InventoryAuditActor,
  entry: InventoryAuditEntry,
): Promise<void> {
  const repo = manager.getRepository(AuditLogEntity);
  await repo.save(
    repo.create({
      actorUserId: actor.userId,
      actorOrgId: actor.orgId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before ?? null,
      after: entry.after ?? null,
    }),
  );
}
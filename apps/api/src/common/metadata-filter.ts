/**
 * Demo/production metadata classification (execution plan §1.4.1, SPEC §5.1):
 * seeded showcase rows are stamped data_class='demo' and must never reach a
 * production context, planning surface, or model input. Every metadata read
 * that feeds such a surface enforces the predicate in the query itself, so no
 * consumer can accidentally aggregate an unlabelled demo row.
 *
 * Shared by InventoryService (partner detail + planning read) and
 * MarketplaceService (planner/buyer surfaces).
 */
export const PRODUCTION_METADATA_WHERE = `(data_class IS NULL OR data_class <> 'demo')`;

/** SELECT list for site_metadata reads, camelCased for the API surface. */
export const METADATA_COLUMNS =
  'id, site_id AS "siteId", dimension, payload, source, method, confidence, ' +
  'collected_at AS "collectedAt", expires_at AS "expiresAt", verification, data_class AS "dataClass", ' +
  'created_at AS "createdAt", updated_at AS "updatedAt"';

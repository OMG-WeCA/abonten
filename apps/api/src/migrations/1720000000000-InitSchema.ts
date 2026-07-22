import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema — creates the PostGIS extension and every entity table for the
 * S1/S2 MVP (SPEC.md §6). Hand-written so geometry columns, the spatial index,
 * and the PostGIS extension are explicit. Column types mirror the TypeORM
 * entities in src/common/entities + src/auth/entities.
 *
 * Run with: pnpm --filter @abonten/api migration:run
 */
export class InitSchema1720000000000 implements MigrationInterface {
  name = 'InitSchema1720000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "postgis"`);

    // ---- Identity & tenancy -------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "name" varchar NOT NULL,
        "type" varchar NOT NULL,
        "country" varchar NOT NULL,
        "default_currency" varchar NOT NULL DEFAULT 'NGN',
        "default_locale" varchar NOT NULL DEFAULT 'en',
        "status" varchar NOT NULL DEFAULT 'active',
        "billing_ref" varchar,
        "allowed_email_domains" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "email" varchar NOT NULL UNIQUE,
        "name" varchar NOT NULL,
        "phone" varchar,
        "locale" varchar NOT NULL DEFAULT 'en',
        "status" varchar NOT NULL DEFAULT 'active',
        "ms_oauth_subject" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" varchar NOT NULL,
        "organization_id" varchar NOT NULL,
        "role" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_capability_overrides" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" varchar NOT NULL,
        "organization_id" varchar NOT NULL,
        "capability" varchar NOT NULL,
        "action" varchar NOT NULL,
        "created_by" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id" varchar NOT NULL,
        "token_hash" varchar NOT NULL UNIQUE,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // ---- Inventory ----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "billboard_sites" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "organization_id" varchar NOT NULL,
        "code" varchar NOT NULL,
        "name" varchar NOT NULL,
        "type" varchar NOT NULL DEFAULT 'billboard',
        "format" varchar NOT NULL,
        "sub_format" varchar,
        "location" geometry(Point, 4326) NOT NULL,
        "geo_polygon" geometry(Polygon, 4326),
        "address" varchar,
        "city" varchar,
        "region" varchar,
        "country" varchar NOT NULL,
        "market_id" varchar,
        "orientation_deg" double precision,
        "viewing_distance" double precision,
        "elevation" double precision,
        "width" double precision,
        "height" double precision,
        "area" double precision,
        "units" varchar,
        "illumination_type" varchar NOT NULL,
        "illumination_hours" varchar,
        "description" text,
        "status" varchar NOT NULL DEFAULT 'draft',
        "permit_ref" varchar,
        "permit_expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "billboard_sites_location_idx" ON "billboard_sites" USING GIST ("location")`,
    );

    await queryRunner.query(`
      CREATE TABLE "site_faces" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "site_id" varchar NOT NULL,
        "face_label" varchar NOT NULL,
        "width" double precision NOT NULL,
        "height" double precision NOT NULL,
        "area" double precision NOT NULL,
        "units" varchar NOT NULL,
        "printable_area" varchar,
        "bookable" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "site_assets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "site_id" varchar NOT NULL,
        "face_id" varchar,
        "kind" varchar NOT NULL,
        "storage_ref" varchar NOT NULL,
        "captured_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "site_metadata" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "site_id" varchar NOT NULL,
        "dimension" varchar NOT NULL,
        "payload" json NOT NULL,
        "source" varchar,
        "method" varchar,
        "confidence" double precision,
        "collected_at" timestamptz,
        "expires_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "rate_cards" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "organization_id" varchar NOT NULL,
        "site_id" varchar,
        "face_id" varchar,
        "currency" varchar NOT NULL,
        "rates" json NOT NULL,
        "seasonal_rules" json,
        "effective_from" timestamptz NOT NULL,
        "effective_to" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "markets" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "name" varchar NOT NULL,
        "country" varchar NOT NULL,
        "parent_id" varchar,
        "bounds" json,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tags" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "scope" varchar NOT NULL,
        "value" varchar NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // ---- Planning & booking (stubs) ----------------------------------------
    await queryRunner.query(`
      CREATE TABLE "campaigns" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "organization_id" varchar NOT NULL,
        "client_org_id" varchar,
        "name" varchar NOT NULL,
        "objective" varchar,
        "currency" varchar,
        "total_budget" double precision,
        "flight_start" timestamptz,
        "flight_end" timestamptz,
        "target_audience" varchar,
        "status" varchar NOT NULL DEFAULT 'draft',
        "scenario_of" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "campaign_items" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "campaign_id" varchar NOT NULL,
        "face_id" varchar NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "rate" double precision,
        "currency" varchar,
        "status" varchar NOT NULL DEFAULT 'planned',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bookings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "campaign_item_id" varchar,
        "face_id" varchar NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" varchar NOT NULL DEFAULT 'requested',
        "hold_expires_at" timestamptz,
        "rate" double precision,
        "currency" varchar,
        "fx_rate_ref" double precision,
        "cancelled_reason" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "quotes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "campaign_id" varchar,
        "booking_id" varchar,
        "currency" varchar,
        "line_items" json,
        "subtotal" double precision,
        "taxes" double precision,
        "total" double precision,
        "fx_rate_ref" double precision,
        "status" varchar NOT NULL DEFAULT 'draft',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "creatives" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "campaign_id" varchar,
        "face_id" varchar,
        "name" varchar NOT NULL,
        "file_ref" varchar,
        "dimensions" varchar,
        "status" varchar NOT NULL DEFAULT 'draft',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // ---- POP & issues (stubs) -----------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "proofs_of_performance" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "booking_id" varchar,
        "face_id" varchar,
        "check_date" date NOT NULL,
        "status" varchar NOT NULL DEFAULT 'intact',
        "condition_notes" text,
        "latitude" double precision,
        "longitude" double precision,
        "captured_at" timestamptz,
        "device_id" varchar,
        "sync_state" varchar NOT NULL DEFAULT 'pending',
        "integrity_flags" json,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "pop_photos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "pop_id" varchar NOT NULL,
        "storage_ref" varchar,
        "kind" varchar,
        "exif" json,
        "ai_flags" json,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "issues" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "campaign_id" varchar,
        "booking_id" varchar,
        "pop_id" varchar,
        "type" varchar NOT NULL,
        "severity" varchar,
        "status" varchar NOT NULL DEFAULT 'open',
        "owner_org_id" varchar,
        "assigned_user_id" varchar,
        "summary" text,
        "due_at" timestamptz,
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "issue_comments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "issue_id" varchar NOT NULL,
        "author_user_id" varchar NOT NULL,
        "body" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "alert_rules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "organization_id" varchar NOT NULL,
        "user_id" varchar,
        "trigger" varchar,
        "channels" text,
        "sla_minutes" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    // ---- Platform & cross-cutting ------------------------------------------
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "actor_user_id" varchar,
        "actor_org_id" varchar,
        "action" varchar NOT NULL,
        "entity_type" varchar,
        "entity_id" varchar,
        "before" json,
        "after" json,
        "at" timestamptz NOT NULL DEFAULT now(),
        "ip" varchar,
        "request_id" varchar,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "reference_data" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "code" varchar NOT NULL,
        "label" varchar,
        "category" varchar,
        "payload" json,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "report_definitions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "owner_org_id" varchar,
        "kind" varchar NOT NULL,
        "parameters" json,
        "schedule" varchar,
        "last_run_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "report_runs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        "definition_id" varchar,
        "owner_org_id" varchar,
        "parameters" json,
        "output_ref" varchar,
        "status" varchar,
        "started_at" timestamptz,
        "finished_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order; leave the PostGIS extension in place (shared, harmless).
    await queryRunner.query(`DROP TABLE IF EXISTS "report_runs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "report_definitions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reference_data"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "alert_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issue_comments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issues"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pop_photos"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "proofs_of_performance"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "creatives"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "quotes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bookings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaign_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "campaigns"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "markets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rate_cards"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "site_metadata"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "site_assets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "site_faces"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "billboard_sites_location_idx"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "billboard_sites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_capability_overrides"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "memberships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
  }
}
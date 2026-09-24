import { MigrationInterface, QueryRunner } from 'typeorm';

/** Partner-owned unavailable periods. Reservations will use this table later. */
export class PartnerAvailability1720000000008 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE rate_cards ADD COLUMN min_booking_days integer`);
    await queryRunner.query(`ALTER TABLE rate_cards ADD CONSTRAINT rate_cards_min_booking_days CHECK (min_booking_days IS NULL OR min_booking_days >= 1)`);
    await queryRunner.query(`ALTER TABLE site_faces ADD COLUMN bleed_mm double precision`);
    await queryRunner.query(`ALTER TABLE site_faces ADD COLUMN substrate varchar`);
    await queryRunner.query(`ALTER TABLE site_faces ADD COLUMN file_requirements text`);
    await queryRunner.query(`
      CREATE TABLE face_blackouts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        face_id varchar NOT NULL,
        organization_id varchar NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        reason text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT face_blackouts_date_order CHECK (start_date < end_date)
      )
    `);
    await queryRunner.query(`CREATE INDEX face_blackouts_face_dates ON face_blackouts (face_id, start_date, end_date)`);
    await queryRunner.query(`CREATE INDEX face_blackouts_org ON face_blackouts (organization_id, created_at DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE face_blackouts`);
    await queryRunner.query(`ALTER TABLE site_faces DROP COLUMN file_requirements`);
    await queryRunner.query(`ALTER TABLE site_faces DROP COLUMN substrate`);
    await queryRunner.query(`ALTER TABLE site_faces DROP COLUMN bleed_mm`);
    await queryRunner.query(`ALTER TABLE rate_cards DROP CONSTRAINT rate_cards_min_booking_days`);
    await queryRunner.query(`ALTER TABLE rate_cards DROP COLUMN min_booking_days`);
  }
}

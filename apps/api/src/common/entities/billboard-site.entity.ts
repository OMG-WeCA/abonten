import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type SiteStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'listed'
  | 'rejected'
  | 'suspended'
  | 'decommissioned';

/**
 * BillboardSite — a physical outdoor advertising structure (SPEC.md §5.1 / §6.2).
 * Location is stored as float `latitude`/`longitude` columns so the schema works
 * on any Postgres (including the disposable no-PostGIS test service). When the
 * PostGIS extension is available, spatial queries use ST_DWithin (on-the-fly
 * geometry); otherwise they fall back to the Haversine formula — see
 * MarketplaceService. `geoPolygon` is a JSON array of {longitude, latitude}.
 */
@Entity({ name: 'billboard_sites' })
export class BillboardSiteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' }) organizationId!: string;
  @Column() code!: string;
  @Column() name!: string;
  @Column({ default: 'billboard' }) type!: string;
  @Column() format!: string;
  @Column({ name: 'sub_format', nullable: true }) subFormat?: string;

  @Column({ type: 'double precision' }) latitude!: number;
  @Column({ type: 'double precision' }) longitude!: number;
  @Column({ name: 'geo_polygon', type: 'json', nullable: true })
  geoPolygon?: Array<{ longitude: number; latitude: number }> | null;

  @Column({ nullable: true }) address?: string;
  @Column({ nullable: true }) city?: string;
  @Column({ nullable: true }) region?: string;
  @Column() country!: string;
  @Column({ name: 'market_id', nullable: true }) marketId?: string;

  @Column({ name: 'orientation_deg', type: 'double precision', nullable: true }) orientationDeg?: number;
  @Column({ name: 'viewing_distance', type: 'double precision', nullable: true }) viewingDistance?: number;
  @Column({ type: 'double precision', nullable: true }) elevation?: number;
  @Column({ type: 'double precision', nullable: true }) width?: number;
  @Column({ type: 'double precision', nullable: true }) height?: number;
  @Column({ type: 'double precision', nullable: true }) area?: number;
  @Column({ nullable: true }) units?: string;

  @Column({ name: 'illumination_type' }) illuminationType!: string;
  @Column({ name: 'illumination_hours', nullable: true }) illuminationHours?: string;
  @Column({ type: 'text', nullable: true }) description?: string;
  @Column({ default: 'draft' }) status!: string;

  @Column({ name: 'permit_ref', nullable: true }) permitRef?: string;
  @Column({ name: 'permit_expires_at', type: 'timestamptz', nullable: true }) permitExpiresAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
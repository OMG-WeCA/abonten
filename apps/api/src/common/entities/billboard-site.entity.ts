import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'billboard_sites' })
export class BillboardSiteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' }) organizationId!: string;
  @Column() code!: string;
  @Column() name!: string;
  @Column() type!: string;
  @Column() format!: string;

  // PostGIS: geometry(Point, 4326) for lat/lon. Requires the PostGIS extension
  // (enabled in docker-compose via postgis/postgis). TypeORM supports the
  // 'geometry' type when PostGIS is available. See SPEC.md §9 / §6.2.
  @Index({ spatial: true })
  @Column({ type: 'geometry', spatialFeatureType: 'Point', srid: 4326 })
  location!: string;

  @Column() country!: string;
  @Column({ name: 'illumination_type' }) illuminationType!: string;
  @Column({ default: 'draft' }) status!: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Intentionally shared public reference source, SPEC §5.2. Operator imports only. */
@Entity({ name: 'enrichment_imports' })
export class EnrichmentImportEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'country_code' }) countryCode!: string;
  @Column({ name: 'source_key' }) sourceKey!: string;
  @Column() layer!: string;
  @Column({ name: 'data_class' }) dataClass!: string;
  @Column() version!: string;
  @Column({ name: 'reference_year' }) referenceYear!: number;
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true }) publishedAt!: Date | null;
  @Column({ name: 'fetched_at', type: 'timestamptz' }) fetchedAt!: Date;
  @Column() licence!: string;
  @Column({ name: 'licence_url' }) licenceUrl!: string;
  @Column() attribution!: string;
  @Column({ name: 'source_url' }) sourceUrl!: string;
  @Column() checksum!: string;
  @Column({ name: 'original_crs' }) originalCrs!: string;
  @Column({ type: 'geometry', spatialFeatureType: 'MultiPolygon', srid: 4326 }) coverage!: object;
  @Column() unit!: string;
  @Column() quality!: string;
  @Column({ type: 'jsonb' }) warnings!: string[];
  @Column({ name: 'raster_path', type: 'text', nullable: true }) rasterPath!: string | null;
  @Column({ name: 'feature_count' }) featureCount!: number;
  @Column() active!: boolean;
  @Column() operator!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

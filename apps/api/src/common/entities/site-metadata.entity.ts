import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'site_metadata' })
export class SiteMetadataEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'site_id' }) siteId!: string;
  @Column() dimension!: string;
  @Column({ type: 'json' }) payload!: Record<string, unknown>;
  @Column({ nullable: true }) source?: string;
  @Column({ nullable: true }) method?: string;
  @Column({ type: 'double precision', nullable: true }) confidence?: number;
  @Column({ name: 'collected_at', type: 'timestamptz', nullable: true }) collectedAt?: Date;
  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true }) expiresAt?: Date;
  /** Evidence level (SPEC §5.1 trust contract 4): defaults to unverified. */
  @Column({ default: 'unverified' }) verification!: string;
  /** Demo rows are seeded showcase data: excluded from production reads and
   * any model input (execution plan §1.4.1). Partner-entered rows are production. */
  @Column({ name: 'data_class', default: 'production' }) dataClass!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

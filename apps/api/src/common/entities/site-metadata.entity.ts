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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

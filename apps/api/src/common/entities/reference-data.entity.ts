import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Versioned code tables (formats, currencies, locales, KPI params) (SPEC.md §6.5). Stub. */
@Entity({ name: 'reference_data' })
export class ReferenceDataEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column() code!: string;
  @Column({ nullable: true }) label?: string;
  @Column({ nullable: true }) category?: string;
  @Column({ type: 'json', nullable: true }) payload?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
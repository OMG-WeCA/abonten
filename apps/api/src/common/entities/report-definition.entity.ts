import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Report definition (SPEC.md §6.5). Stub for S1/S2. */
@Entity({ name: 'report_definitions' })
export class ReportDefinitionEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'owner_org_id', nullable: true }) ownerOrgId?: string;
  @Column() kind!: string;
  @Column({ type: 'json', nullable: true }) parameters?: Record<string, unknown> | null;
  @Column({ nullable: true }) schedule?: string;
  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true }) lastRunAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
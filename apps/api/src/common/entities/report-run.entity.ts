import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Report run (SPEC.md §6.5). Stub for S1/S2. */
@Entity({ name: 'report_runs' })
export class ReportRunEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'definition_id', nullable: true }) definitionId?: string;
  @Column({ name: 'owner_org_id', nullable: true }) ownerOrgId?: string;
  @Column({ type: 'json', nullable: true }) parameters?: Record<string, unknown> | null;
  @Column({ name: 'output_ref', nullable: true }) outputRef?: string;
  @Column({ nullable: true }) status?: string;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true }) startedAt?: Date;
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true }) finishedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
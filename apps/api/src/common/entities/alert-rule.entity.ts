import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Alert rule / notification preference (SPEC.md §6.4). Stub for S1/S2. */
@Entity({ name: 'alert_rules' })
export class AlertRuleEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'organization_id' }) organizationId!: string;
  @Column({ name: 'user_id', nullable: true }) userId?: string;
  @Column({ nullable: true }) trigger?: string;
  @Column({ type: 'simple-array', nullable: true }) channels?: string[];
  @Column({ name: 'sla_minutes', type: 'int', nullable: true }) slaMinutes?: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
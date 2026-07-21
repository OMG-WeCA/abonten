import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Issue / alert record (SPEC.md §5.5 / §6.4). Stub for S1/S2. */
@Entity({ name: 'issues' })
export class IssueEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'campaign_id', nullable: true }) campaignId?: string;
  @Column({ name: 'booking_id', nullable: true }) bookingId?: string;
  @Column({ name: 'pop_id', nullable: true }) popId?: string;
  @Column() type!: string;
  @Column({ nullable: true }) severity?: string;
  @Column({ default: 'open' }) status!: string;
  @Column({ name: 'owner_org_id', nullable: true }) ownerOrgId?: string;
  @Column({ name: 'assigned_user_id', nullable: true }) assignedUserId?: string;
  @Column({ type: 'text', nullable: true }) summary?: string;
  @Column({ name: 'due_at', type: 'timestamptz', nullable: true }) dueAt?: Date;
  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true }) resolvedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
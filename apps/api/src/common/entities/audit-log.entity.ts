import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Append-only audit log — the backbone of trust/dispute resolution (SPEC.md §6.5). */
@Entity({ name: 'audit_logs' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'actor_user_id', nullable: true }) actorUserId?: string;
  @Column({ name: 'actor_org_id', nullable: true }) actorOrgId?: string;
  @Column() action!: string;
  @Column({ name: 'entity_type', nullable: true }) entityType?: string;
  @Column({ name: 'entity_id', nullable: true }) entityId?: string;
  @Column({ type: 'json', nullable: true }) before?: Record<string, unknown> | null;
  @Column({ type: 'json', nullable: true }) after?: Record<string, unknown> | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) at!: Date;
  @Column({ nullable: true }) ip?: string;
  @Column({ name: 'request_id', nullable: true }) requestId?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
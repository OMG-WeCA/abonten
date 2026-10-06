import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { AgencyPlanningDraftV1 } from '@abonten/contracts/planning-draft';

@Entity({ name: 'personal_planning_drafts' })
export class PlanningDraftEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'organization_id', type: 'uuid' }) organizationId!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ type: 'varchar', length: 80 }) name!: string;
  @Column({ type: 'jsonb' }) draft!: AgencyPlanningDraftV1;
  @Column({ type: 'int', default: 1 }) revision!: number;
  @Column({ name: 'client_request_id', type: 'uuid' }) clientRequestId!: string;
  @Column({ name: 'creation_fingerprint', type: 'varchar', length: 64 })
  creationFingerprint!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

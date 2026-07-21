import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'user_capability_overrides' })
export class UserCapabilityOverrideEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'user_id' }) userId!: string;
  @Column({ name: 'organization_id' }) organizationId!: string;
  @Column({ type: 'varchar' }) capability!: string;
  @Column({ type: 'varchar' }) action!: 'grant' | 'revoke';
  @Column({ name: 'created_by', nullable: true }) createdBy?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

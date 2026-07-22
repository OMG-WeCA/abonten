import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'memberships' })
export class MembershipEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'user_id' }) userId!: string;
  @Column({ name: 'organization_id' }) organizationId!: string;
  @Column() role!: string;
  @Column({ default: 'active' }) status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
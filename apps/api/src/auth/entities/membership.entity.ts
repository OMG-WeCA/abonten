import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { OrganizationEntity } from '../../common/entities/organization.entity';
import { UserEntity } from './user.entity';

@Entity({ name: 'memberships' })
export class MembershipEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'user_id' }) userId!: string;
  @Column({ name: 'organization_id' }) organizationId!: string;
  @Column() role!: string;
  @Column({ default: 'active' }) status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;

  @ManyToOne(() => UserEntity, (u) => u.memberships)
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @ManyToOne(() => OrganizationEntity, (o) => o.memberships)
  @JoinColumn({ name: 'organization_id' })
  organization?: OrganizationEntity;
}

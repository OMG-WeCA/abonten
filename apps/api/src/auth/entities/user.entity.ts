import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MembershipEntity } from './membership.entity';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true }) email!: string;
  @Column() name!: string;
  @Column({ nullable: true }) phone?: string;
  @Column({ default: 'en' }) locale!: string;
  @Column({ default: 'active' }) status!: string;
  @Column({ name: 'ms_oauth_subject', nullable: true }) msOauthSubject?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;

  @OneToMany(() => MembershipEntity, (m) => m.user)
  memberships!: MembershipEntity[];
}
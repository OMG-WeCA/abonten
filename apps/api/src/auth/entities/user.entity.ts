import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { normalizeEmailIdentity } from '../email-identity';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true }) email!: string;
  @Column() name!: string;
  @Column({ nullable: true }) phone?: string;
  @Column({ default: 'en' }) locale!: string;
  @Column({ default: 'Africa/Lagos' }) timezone!: string;
  @Column({ name: 'avatar_ref', nullable: true }) avatarRef?: string;
  @Column({ name: 'avatar_content_type', nullable: true }) avatarContentType?: string;
  // Incremented when every active session is revoked. Access JWTs carry this value
  // so revocation is enforced server-side rather than waiting for token expiry.
  @Column({ name: 'session_version', type: 'int', default: 0 }) sessionVersion!: number;
  @Column({ default: 'active' }) status!: string;
  @Column({ name: 'ms_oauth_subject', nullable: true }) msOauthSubject?: string;

  @BeforeInsert()
  @BeforeUpdate()
  canonicalizeEmail(): void {
    this.email = normalizeEmailIdentity(this.email);
  }

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

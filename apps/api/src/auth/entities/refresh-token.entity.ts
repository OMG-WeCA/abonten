import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'refresh_tokens' })
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'user_id' }) userId!: string;
  @Column({ name: 'token_hash', unique: true }) tokenHash!: string;
  @Column({ name: 'family_id', type: 'uuid' }) familyId!: string;
  @Column({ name: 'session_version', type: 'integer', default: 0 }) sessionVersion!: number;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt?: Date;
  @Column({ name: 'user_agent', nullable: true }) userAgent?: string;
  @Column({ nullable: true }) ip?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

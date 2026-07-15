import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'refresh_tokens' })
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'user_id' }) userId!: string;
  @Column({ name: 'token_hash', unique: true }) tokenHash!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt?: Date;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}

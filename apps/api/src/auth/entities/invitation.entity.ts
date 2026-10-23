import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
@Entity({ name: 'invitations' })
export class InvitationEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'client_request_id', type: 'uuid', nullable: true }) clientRequestId!:
    string | null;
  @Column({ name: 'request_fingerprint', type: 'varchar', nullable: true }) requestFingerprint!:
    string | null;
  @Column({ default: 'membership' }) kind!: 'account' | 'membership';
  @Column({ name: 'account_type', type: 'varchar', nullable: true }) accountType!: string | null;
  @Column() email!: string;
  @Column({ default: '' }) name!: string;
  @Column({ name: 'organization_id', type: 'varchar', nullable: true }) organizationId!:
    string | null;
  @Column() role!: string;
  @Column({ default: 'en' }) locale!: string;
  @Column({ default: 'pending' }) status!: string;
  @Column({ name: 'initial_owner', default: false }) initialOwner!: boolean;
  @Column({ name: 'created_by_user_id' }) createdByUserId!: string;
  @Column({ name: 'created_by_org_id' }) createdByOrgId!: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'accepted_by_user_id', type: 'varchar', nullable: true }) acceptedByUserId!:
    string | null;
  @Column({ name: 'accepted_at', type: 'timestamptz', nullable: true }) acceptedAt!: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt!: Date | null;
  @Column({ default: 'not_sent' }) delivery!: string;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt!: Date | null;
  @Column({ default: 1 }) revision!: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

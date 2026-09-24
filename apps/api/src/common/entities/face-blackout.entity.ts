import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Partner-owned period during which a face cannot be booked. End date is exclusive. */
@Entity({ name: 'face_blackouts' })
export class FaceBlackoutEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'face_id' }) faceId!: string;
  @Column({ name: 'organization_id' }) organizationId!: string;
  @Column({ name: 'start_date', type: 'date' }) startDate!: string;
  @Column({ name: 'end_date', type: 'date' }) endDate!: string;
  @Column({ type: 'text' }) reason!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

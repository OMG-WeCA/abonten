import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Booking / reservation on a face (SPEC.md §5.6 / §6.3). Stub for S1/S2. */
@Entity({ name: 'bookings' })
export class BookingEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'campaign_item_id', nullable: true }) campaignItemId?: string;
  @Column({ name: 'face_id' }) faceId!: string;
  @Column({ name: 'start_date', type: 'date' }) startDate!: string;
  @Column({ name: 'end_date', type: 'date' }) endDate!: string;
  @Column({ default: 'requested' }) status!: string;
  @Column({ name: 'hold_expires_at', type: 'timestamptz', nullable: true }) holdExpiresAt?: Date;
  @Column({ type: 'double precision', nullable: true }) rate?: number;
  @Column({ nullable: true }) currency?: string;
  @Column({ name: 'fx_rate_ref', type: 'double precision', nullable: true }) fxRateRef?: number;
  @Column({ name: 'cancelled_reason', nullable: true }) cancelledReason?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
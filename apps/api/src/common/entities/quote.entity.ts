import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Quote / Invoice generated from confirmed bookings (SPEC.md §6.3). Stub for S1/S2. */
@Entity({ name: 'quotes' })
export class QuoteEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'campaign_id', nullable: true }) campaignId?: string;
  @Column({ name: 'booking_id', nullable: true }) bookingId?: string;
  @Column({ nullable: true }) currency?: string;
  @Column({ name: 'line_items', type: 'json', nullable: true }) lineItems?: Record<string, unknown> | null;
  @Column({ type: 'double precision', nullable: true }) subtotal?: number;
  @Column({ type: 'double precision', nullable: true }) taxes?: number;
  @Column({ type: 'double precision', nullable: true }) total?: number;
  @Column({ name: 'fx_rate_ref', type: 'double precision', nullable: true }) fxRateRef?: number;
  @Column({ default: 'draft' }) status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
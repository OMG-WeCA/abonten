import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Rate card for a site/face (SPEC.md §6.3 / §5.6). `rates` is JSON {perDay, perWeek, perMonth}. */
@Entity({ name: 'rate_cards' })
export class RateCardEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'organization_id' }) organizationId!: string;
  @Column({ name: 'site_id', nullable: true }) siteId?: string;
  @Column({ name: 'face_id', nullable: true }) faceId?: string;
  @Column({ name: 'min_booking_days', type: 'integer', nullable: true }) minBookingDays?: number | null;
  @Column() currency!: string;
  @Column({ type: 'json' }) rates!: { perDay?: number; perWeek?: number; perMonth?: number };
  @Column({ name: 'seasonal_rules', type: 'json', nullable: true }) seasonalRules?: Record<string, unknown> | null;
  @Column({ name: 'effective_from', type: 'timestamptz' }) effectiveFrom!: Date;
  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true }) effectiveTo?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

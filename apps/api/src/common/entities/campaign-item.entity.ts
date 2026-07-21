import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Campaign line item = a face booked for a window (SPEC.md §6.3). Stub for S1/S2. */
@Entity({ name: 'campaign_items' })
export class CampaignItemEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'campaign_id' }) campaignId!: string;
  @Column({ name: 'face_id' }) faceId!: string;
  @Column({ name: 'start_date', type: 'date' }) startDate!: string;
  @Column({ name: 'end_date', type: 'date' }) endDate!: string;
  @Column({ type: 'double precision', nullable: true }) rate?: number;
  @Column({ nullable: true }) currency?: string;
  @Column({ default: 'planned' }) status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Creative artwork bound to a booking (SPEC.md §6.3). Stub for S1/S2. */
@Entity({ name: 'creatives' })
export class CreativeEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'campaign_id', nullable: true }) campaignId?: string;
  @Column({ name: 'face_id', nullable: true }) faceId?: string;
  @Column() name!: string;
  @Column({ name: 'file_ref', nullable: true }) fileRef?: string;
  @Column({ nullable: true }) dimensions?: string;
  @Column({ default: 'draft' }) status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
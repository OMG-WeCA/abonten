import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Daily site update / POP check (SPEC.md §5.4 / §6.4). Stub for S1/S2. */
@Entity({ name: 'proofs_of_performance' })
export class ProofOfPerformanceEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'booking_id', nullable: true }) bookingId?: string;
  @Column({ name: 'face_id', nullable: true }) faceId?: string;
  @Column({ name: 'check_date', type: 'date' }) checkDate!: string;
  @Column({ default: 'intact' }) status!: string;
  @Column({ name: 'condition_notes', type: 'text', nullable: true }) conditionNotes?: string;
  @Column({ type: 'double precision', nullable: true }) latitude?: number;
  @Column({ type: 'double precision', nullable: true }) longitude?: number;
  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true }) capturedAt?: Date;
  @Column({ name: 'device_id', nullable: true }) deviceId?: string;
  @Column({ name: 'sync_state', default: 'pending' }) syncState!: string;
  @Column({ name: 'integrity_flags', type: 'json', nullable: true }) integrityFlags?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
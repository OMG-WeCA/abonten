import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Photo attached to a POP check (SPEC.md §6.4). Stub for S1/S2. */
@Entity({ name: 'pop_photos' })
export class PopPhotoEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'pop_id' }) popId!: string;
  @Column({ name: 'storage_ref', nullable: true }) storageRef?: string;
  @Column({ nullable: true }) kind?: string;
  @Column({ type: 'json', nullable: true }) exif?: Record<string, unknown> | null;
  @Column({ name: 'ai_flags', type: 'json', nullable: true }) aiFlags?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
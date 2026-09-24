import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'site_faces' })
export class SiteFaceEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'site_id' }) siteId!: string;
  @Column({ name: 'face_label' }) faceLabel!: string;
  @Column({ type: 'double precision' }) width!: number;
  @Column({ type: 'double precision' }) height!: number;
  @Column({ type: 'double precision' }) area!: number;
  @Column() units!: string;
  @Column({ name: 'printable_area', nullable: true }) printableArea?: string;
  @Column({ name: 'bleed_mm', type: 'double precision', nullable: true }) bleedMm?: number | null;
  @Column({ type: 'varchar', nullable: true }) substrate?: string | null;
  @Column({ name: 'file_requirements', type: 'text', nullable: true }) fileRequirements?: string | null;
  @Column({ default: true }) bookable!: boolean;

  // Digital-face attributes (SPEC §5.1 trust contract 2): populated for faces of
  // digital_led sites; nullable everywhere so static faces are unaffected.
  @Column({ name: 'pixel_width', type: 'integer', nullable: true }) pixelWidth?: number;
  @Column({ name: 'pixel_height', type: 'integer', nullable: true }) pixelHeight?: number;
  @Column({ name: 'spot_length_seconds', type: 'double precision', nullable: true }) spotLengthSeconds?: number;
  @Column({ name: 'loop_length_seconds', type: 'double precision', nullable: true }) loopLengthSeconds?: number;
  @Column({ name: 'spots_per_loop', type: 'integer', nullable: true }) spotsPerLoop?: number;
  @Column({ name: 'proof_of_play', type: 'boolean', nullable: true }) proofOfPlay?: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

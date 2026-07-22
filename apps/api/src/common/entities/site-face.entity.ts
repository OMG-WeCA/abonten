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
  @Column({ default: true }) bookable!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
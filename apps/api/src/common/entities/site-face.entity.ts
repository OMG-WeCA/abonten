import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'site_faces' })
export class SiteFaceEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'site_id' }) siteId!: string;
  @Column({ name: 'face_label' }) faceLabel!: string;
  @Column() width!: number;
  @Column() height!: number;
  @Column() area!: number;
  @Column() units!: string;
  @Column({ nullable: true }) printableArea?: string;
  @Column({ default: true }) bookable!: boolean;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Reference photo / diagram for a site (SPEC.md §6.2 SiteAsset). */
@Entity({ name: 'site_assets' })
export class SiteAssetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'site_id' }) siteId!: string;
  @Column({ name: 'face_id', nullable: true }) faceId?: string;
  @Column() kind!: string; // front | context | night | diagram
  @Column({ name: 'storage_ref' }) storageRef!: string;
  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true }) capturedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
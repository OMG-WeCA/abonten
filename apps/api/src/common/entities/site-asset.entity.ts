import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Reference photo / diagram for a site (SPEC.md §6.2 SiteAsset). */
@Entity({ name: 'site_assets' })
export class SiteAssetEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'site_id' }) siteId!: string;
  @Column({ name: 'face_id', nullable: true }) faceId?: string;
  @Column() kind!: string; // front | context | night | diagram | board_video
  @Column({ name: 'storage_ref' }) storageRef!: string;
  @Column({ name: 'captured_at', type: 'timestamptz', nullable: true }) capturedAt?: Date;

  @Column({ name: 'media_type', default: 'image' }) mediaType!: 'image' | 'video';
  @Column({ name: 'content_type', nullable: true }) contentType?: string;
  @Column({ name: 'byte_size', type: 'integer', nullable: true }) byteSize?: number;
  @Column({ type: 'integer', nullable: true }) width?: number;
  @Column({ type: 'integer', nullable: true }) height?: number;
  @Column({ name: 'duration_seconds', type: 'double precision', nullable: true })
  durationSeconds?: number;
  @Column({ type: 'jsonb', nullable: true }) metadata?: Record<string, unknown>;
  @Column({ name: 'client_request_id', type: 'uuid', nullable: true }) clientRequestId?: string;
  @Column({ name: 'content_sha256', nullable: true }) contentSha256?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

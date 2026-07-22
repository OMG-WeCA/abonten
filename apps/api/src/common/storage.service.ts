import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { dirname, join } from 'node:path';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';

/**
 * Asset storage: local disk in development, S3-compatible (MinIO/AWS/etc.) in
 * production. The backend is selected by NODE_ENV — production uses S3 when an
 * endpoint is configured; development always uses the local UPLOADS_DIR. Both
 * backends expose store(ref, buffer, contentType) and remove(ref), so callers
 * stay backend-agnostic.
 */
@Injectable()
export class StorageService {
  private readonly s3: S3Client | null = null;
  private readonly bucket: string;
  private readonly localDir: string;
  private readonly useS3: boolean;

  constructor(cfg: ConfigService) {
    this.localDir = process.env.UPLOADS_DIR ?? './uploads';
    this.bucket = cfg.get<string>('s3.bucket') ?? 'abonten';
    const endpoint = cfg.get<string>('s3.endpoint');
    this.useS3 = process.env.NODE_ENV === 'production' && !!endpoint;
    if (this.useS3) {
      this.s3 = new S3Client({
        endpoint,
        region: cfg.get<string>('s3.region') ?? 'us-east-1',
        credentials: {
          accessKeyId: cfg.get<string>('s3.accessKey') ?? '',
          secretAccessKey: cfg.get<string>('s3.secretKey') ?? '',
        },
        forcePathStyle: true, // MinIO + most S3-compatible services
      });
    }
  }

  /** Store a buffer at `ref` (a relative key/path) and return the same ref. */
  async store(ref: string, buffer: Buffer, contentType: string): Promise<string> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: ref, Body: buffer, ContentType: contentType }),
      );
    } else {
      const path = join(this.localDir, ref);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, buffer);
    }
    return ref;
  }

  /** Remove the object at `ref`. Best-effort: a missing object is not an error. */
  async remove(ref: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: ref })).catch(() => undefined);
    } else {
      try {
        unlinkSync(join(this.localDir, ref));
      } catch {
        // already gone — idempotent
      }
    }
  }
}
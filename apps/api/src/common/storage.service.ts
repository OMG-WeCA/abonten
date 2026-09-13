import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { dirname, join, resolve } from 'node:path';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

/**
 * Asset storage: local disk in development, S3-compatible (MinIO/AWS/etc.) in
 * production. The backend is selected by NODE_ENV — production uses S3 when an
 * endpoint is configured; development always uses the local UPLOADS_DIR. Both
 * backends expose store/read/remove, so callers stay backend-agnostic.
 */
@Injectable()
export class StorageService {
  private readonly s3: S3Client | null = null;
  private readonly bucket: string;
  private readonly localDir: string;

  constructor(cfg: ConfigService) {
    this.localDir = process.env.UPLOADS_DIR ?? './uploads';
    this.bucket = cfg.get<string>('s3.bucket') ?? 'abonten';
    const endpoint = cfg.get<string>('s3.endpoint');
    const useS3 = process.env.NODE_ENV === 'production' && !!endpoint;
    if (useS3) {
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
    this.assertSafeRef(ref);
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: ref, Body: buffer, ContentType: contentType }),
      );
    } else {
      const resolved = this.resolveRef(ref);
      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(resolved, buffer);
    }
    return ref;
  }

  /** Read an object by its internally stored relative ref. */
  async read(ref: string): Promise<Buffer> {
    this.assertSafeRef(ref);
    if (this.s3) {
      const result = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: ref }));
      if (!result.Body) throw new Error('Stored object has no body');
      return Buffer.from(await result.Body.transformToByteArray());
    }
    return readFileSync(this.resolveRef(ref));
  }

  /** Remove the object at `ref`. Best-effort: a missing object is not an error. */
  async remove(ref: string): Promise<void> {
    this.assertSafeRef(ref);
    if (this.s3) {
      await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: ref })).catch(() => undefined);
    } else {
      try {
        unlinkSync(this.resolveRef(ref));
      } catch {
        // already gone — idempotent
      }
    }
  }

  private resolveRef(ref: string): string {
    return resolve(join(this.localDir, ref));
  }

  private assertSafeRef(ref: string): void {
    const root = resolve(this.localDir);
    const resolved = this.resolveRef(ref);
    if (resolved !== root && !resolved.startsWith(root + '/')) {
      throw new Error('storage ref escapes uploads directory');
    }
  }
}

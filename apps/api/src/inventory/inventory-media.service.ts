import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { DatabaseService } from '../common/database.service';
import { StorageService } from '../common/storage.service';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { InventoryService } from './inventory.service';
import { writeInventoryAudit } from './inventory-audit';
import { UploadInventoryMediaDto } from './dto/inventory-media.dto';
import { evidenceDistanceMeters, projectMediaAssetEvidence } from './inventory-media-projection';
export { evidenceDistanceMeters } from './inventory-media-projection';
import {
  validateInventoryMedia,
  type MediaFile,
  type ValidatedMedia,
} from './inventory-media-validation';

export interface PhotoEvidence {
  verification: 'unverified';
  captureMethod: 'uploaded' | 'device_camera';
  location: {
    source: 'exif' | 'device_gps' | 'missing';
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    recordedAt?: string;
  };
  time: {
    source: 'exif' | 'device_capture' | 'partner_declared' | 'missing';
    value?: string;
    localValue?: string;
    precision: 'day' | 'second' | 'unknown';
    declaredDate?: string;
  };
  exif: ValidatedMedia['exif'];
  device?: {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    capturedAt: string;
    locationRecordedAt?: string;
  };
  missingMetadataReason?: string;
  evidenceDistanceMeters: number | null;
  warnings: string[];
  warningCodes: string[];
}

/** Embedded and browser-supplied GPS can be changed by a partner. They are
 * evidence only; no upload can promote itself to field_verified. */
export function photoEvidence(
  media: ValidatedMedia,
  dto: UploadInventoryMediaDto,
  site: { latitude: number; longitude: number },
): PhotoEvidence {
  const evidence: PhotoEvidence = {
    verification: 'unverified',
    captureMethod: dto.captureMethod ?? 'uploaded',
    location: { source: 'missing' },
    time: { source: 'missing', precision: 'unknown' },
    exif: media.exif,
    evidenceDistanceMeters: null,
    warnings: [...media.exif.warnings],
    warningCodes: [],
  };
  if (dto.capturedAt) {
    assertCaptureDate(dto.capturedAt);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(dto.capturedAt) &&
      !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(dto.capturedAt)
    ) {
      throw new BadRequestException(
        'Capture times need a timezone; a calendar date may be supplied without a time.',
      );
    }
  }
  const gpsValues = [dto.deviceLatitude, dto.deviceLongitude, dto.deviceAccuracyMeters];
  const hasGps = gpsValues.some((v) => v !== undefined);
  if (hasGps || dto.deviceCapturedAt !== undefined || dto.deviceLocationRecordedAt !== undefined) {
    if (
      dto.captureMethod !== 'device_camera' ||
      !dto.deviceCapturedAt ||
      !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(dto.deviceCapturedAt) ||
      (hasGps &&
        (gpsValues.some((v) => v === undefined) ||
          !Number.isFinite(dto.deviceLatitude) ||
          Math.abs(dto.deviceLatitude!) > 90 ||
          !Number.isFinite(dto.deviceLongitude) ||
          Math.abs(dto.deviceLongitude!) > 180 ||
          !Number.isFinite(dto.deviceAccuracyMeters) ||
          dto.deviceAccuracyMeters! < 0 ||
          dto.deviceAccuracyMeters! > 100_000))
    ) {
      throw new BadRequestException(
        'Device capture needs a timestamp with timezone; GPS latitude, longitude and accuracy must be supplied together when available.',
      );
    }
    assertCaptureDate(dto.deviceCapturedAt);
    if (dto.deviceLocationRecordedAt !== undefined) {
      if (!hasGps || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(dto.deviceLocationRecordedAt))
        throw new BadRequestException('GPS fix time needs complete device GPS and a timezone.');
      assertCaptureDate(dto.deviceLocationRecordedAt);
    }
    evidence.device = {
      ...(hasGps
        ? {
            latitude: dto.deviceLatitude!,
            longitude: dto.deviceLongitude!,
            accuracyMeters: dto.deviceAccuracyMeters!,
          }
        : {}),
      capturedAt: new Date(dto.deviceCapturedAt).toISOString(),
      ...(dto.deviceLocationRecordedAt
        ? { locationRecordedAt: new Date(dto.deviceLocationRecordedAt).toISOString() }
        : {}),
    };
  }
  if (media.exif.gps) evidence.location = { source: 'exif', ...media.exif.gps };
  else if (evidence.device?.latitude !== undefined)
    evidence.location = {
      source: 'device_gps',
      latitude: evidence.device.latitude,
      longitude: evidence.device.longitude,
      accuracyMeters: evidence.device.accuracyMeters,
      recordedAt: evidence.device.locationRecordedAt,
    };
  if (media.exif.capturedAt)
    evidence.time = { source: 'exif', value: media.exif.capturedAt, precision: 'second' };
  else if (evidence.device)
    evidence.time = {
      source: 'device_capture',
      value: evidence.device.capturedAt,
      precision: 'second',
    };
  else if (dto.capturedAt)
    evidence.time = {
      source: 'partner_declared',
      value: new Date(dto.capturedAt).toISOString(),
      precision: /^\d{4}-\d{2}-\d{2}$/.test(dto.capturedAt) ? 'day' : 'second',
      ...(/^\d{4}-\d{2}-\d{2}$/.test(dto.capturedAt) ? { declaredDate: dto.capturedAt } : {}),
    };
  if (media.exif.localCapturedAt) evidence.time.localValue = media.exif.localCapturedAt;
  if (dto.missingMetadataReason?.trim())
    evidence.missingMetadataReason = dto.missingMetadataReason.trim().slice(0, 500);
  if (evidence.location.latitude !== undefined && evidence.location.longitude !== undefined) {
    evidence.evidenceDistanceMeters = evidenceDistanceMeters(site, {
      latitude: evidence.location.latitude,
      longitude: evidence.location.longitude,
    });
    if (
      evidence.evidenceDistanceMeters !== null &&
      evidence.evidenceDistanceMeters > Math.max(100, evidence.location.accuracyMeters ?? 0)
    ) {
      evidence.warnings.push(
        'Photo location differs from the site pin; check the photo and location. This is not an independently verified mismatch.',
      );
    }
  }
  if (
    media.exif.gps &&
    evidence.device?.latitude !== undefined &&
    evidence.device.longitude !== undefined &&
    (evidenceDistanceMeters(media.exif.gps, {
      latitude: evidence.device.latitude,
      longitude: evidence.device.longitude,
    }) ?? 0) > Math.max(100, evidence.device.accuracyMeters ?? 0)
  ) {
    evidence.warnings.push(
      'Embedded photo GPS differs from browser GPS; both sources are retained as unverified evidence.',
    );
  }
  if (evidence.location.source === 'missing') evidence.warnings.push('No photo GPS was available.');
  if (evidence.time.source === 'missing') evidence.warnings.push('Capture date is unknown.');
  evidence.warningCodes = evidence.warnings.map(mediaWarningCode);
  return evidence;
}

function assertCaptureDate(value: string): void {
  const time = new Date(value).getTime();
  const day = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  const parsedDay = day ? new Date(`${day}T00:00:00Z`) : null;
  const validDay =
    parsedDay &&
    Number.isFinite(parsedDay.getTime()) &&
    parsedDay.toISOString().slice(0, 10) === day;
  if (!validDay || !Number.isFinite(time) || time > Date.now() + 5 * 60_000)
    throw new BadRequestException('Use a valid capture date that is not in the future.');
}

@Injectable()
export class InventoryMediaService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly inventory: InventoryService,
  ) {}

  async upload(
    user: AuthenticatedUser,
    orgId: string | undefined,
    siteId: string,
    file: MediaFile,
    dto: UploadInventoryMediaDto,
    video = false,
  ): Promise<SiteAssetEntity> {
    const site = await this.ownedSite(orgId, siteId);
    if (video && site.format !== 'digital_led')
      throw new BadRequestException(
        'Board recordings are only available for digital LED inventory.',
      );
    const kind = video ? 'board_video' : (dto.kind ?? 'front');
    if (!video && !['front', 'context', 'night', 'diagram'].includes(kind))
      throw new BadRequestException('Unknown photo kind.');
    const contentSha256 = createHash('sha256').update(file.buffer).digest('hex');
    // Only fixed, validated DTO fields enter the digest. It carries no device
    // identifiers, filenames or arbitrary caller-provided structures.
    const requestFingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          kind,
          contentSha256,
          contentType: file.mimetype,
          capturedAt: dto.capturedAt ?? null,
          captureMethod: dto.captureMethod ?? 'uploaded',
          deviceLatitude: dto.deviceLatitude ?? null,
          deviceLongitude: dto.deviceLongitude ?? null,
          deviceAccuracyMeters: dto.deviceAccuracyMeters ?? null,
          deviceCapturedAt: dto.deviceCapturedAt ?? null,
          deviceLocationRecordedAt: dto.deviceLocationRecordedAt ?? null,
          missingMetadataReason: dto.missingMetadataReason?.trim() ?? null,
        }),
      )
      .digest('hex');
    const existing = dto.clientRequestId
      ? await (
          await this.db.repo(SiteAssetEntity)
        ).findOne({ where: { siteId, clientRequestId: dto.clientRequestId } })
      : null;
    if (existing) return projectMediaAssetEvidence(replay(existing, requestFingerprint), site);
    const media = await validateInventoryMedia(file, video);
    const evidence = photoEvidence(media, dto, site);
    const storageRef = `assets/${siteId}/${randomUUID()}.${media.extension}`;
    let stored = false;
    try {
      return await this.db.transaction(async (manager) => {
        // Serialize competing identical uploads before object creation. Retry
        // writes no second object or audit row. Recheck format/ownership under
        // the same lock so site edits cannot turn an LED-only upload invalid.
        const rows = await manager.query(
          'SELECT organization_id AS "organizationId", format, latitude, longitude FROM billboard_sites WHERE id = $1 FOR UPDATE',
          [siteId],
        );
        if (!rows[0] || rows[0].organizationId !== orgId)
          throw new ForbiddenException('Not your site');
        if (video && rows[0].format !== 'digital_led')
          throw new BadRequestException(
            'Board recordings are only available for digital LED inventory.',
          );
        const repo = manager.getRepository(SiteAssetEntity);
        const concurrent = dto.clientRequestId
          ? await repo.findOne({ where: { siteId, clientRequestId: dto.clientRequestId } })
          : null;
        if (concurrent)
          return projectMediaAssetEvidence(replay(concurrent, requestFingerprint), rows[0]);
        await this.storage.store(storageRef, file.buffer, media.contentType);
        stored = true;
        const asset = await repo.save(
          repo.create({
            siteId,
            kind,
            storageRef,
            capturedAt: evidence.time.value ? new Date(evidence.time.value) : undefined,
            mediaType: media.mediaType,
            contentType: media.contentType,
            byteSize: media.byteSize,
            width: media.width,
            height: media.height,
            durationSeconds: media.durationSeconds,
            metadata: { ...evidence, requestFingerprint },
            clientRequestId: dto.clientRequestId,
            contentSha256,
          }),
        );
        await writeInventoryAudit(
          manager,
          { userId: user.userId, orgId },
          {
            action: 'inventory.asset.added',
            entityType: 'site_asset',
            entityId: asset.id,
            before: null,
            after: {
              kind,
              storageRef,
              mediaType: media.mediaType,
              contentType: media.contentType,
              byteSize: media.byteSize,
              contentSha256,
              capturedAt: evidence.time.value ?? null,
              evidence: { ...evidence },
            },
          },
        );
        return projectMediaAssetEvidence(asset, rows[0]);
      });
    } catch (err) {
      if (stored) await this.storage.remove(storageRef).catch(() => undefined);
      throw err;
    }
  }

  async read(user: AuthenticatedUser, orgId: string | undefined, siteId: string, assetId: string) {
    await this.inventory.assertCanReadSite(user, orgId, siteId);
    const asset = await (
      await this.db.repo(SiteAssetEntity)
    ).findOne({ where: { id: assetId, siteId } });
    if (!asset) throw new NotFoundException('Asset not found');
    if (/^https?:\/\//i.test(asset.storageRef)) return { redirect: asset.storageRef };
    const buffer = await this.storage.read(asset.storageRef);
    const contentType = asset.contentType ?? legacyImageType(buffer);
    if (!contentType)
      throw new BadRequestException(
        'This legacy asset needs a replacement photo before it can be displayed.',
      );
    return { buffer, contentType, mediaType: asset.mediaType ?? 'image' };
  }

  private async ownedSite(orgId: string | undefined, siteId: string): Promise<BillboardSiteEntity> {
    if (!orgId) throw new ForbiddenException('No active organization context');
    const site = await (await this.db.repo(BillboardSiteEntity)).findOne({ where: { id: siteId } });
    if (!site) throw new NotFoundException('Site not found');
    if (site.organizationId !== orgId) throw new ForbiddenException('Not your site');
    return site;
  }
}
function replay(asset: SiteAssetEntity, fingerprint: string): SiteAssetEntity {
  if (asset.metadata?.requestFingerprint !== fingerprint)
    throw new ConflictException(
      'This upload operation already belongs to a different file or metadata. Start a new upload.',
    );
  return asset;
}
function legacyImageType(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

function mediaWarningCode(message: string): string {
  if (message.startsWith('EXIF capture time has no timezone')) return 'exif_timezone_missing';
  if (message.startsWith('EXIF capture time is in the future')) return 'exif_time_future';
  if (message.startsWith('Embedded EXIF metadata could not')) return 'exif_unreadable';
  if (message.startsWith('Photo location differs')) return 'photo_pin_distance';
  if (message.startsWith('Embedded photo GPS differs')) return 'photo_device_distance';
  if (message.startsWith('No photo GPS')) return 'gps_missing';
  if (message.startsWith('Capture date is unknown')) return 'capture_time_missing';
  return 'metadata_warning';
}

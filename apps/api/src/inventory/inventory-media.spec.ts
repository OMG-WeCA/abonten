import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import type { ExecutionContext } from '@nestjs/common';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { DatabaseService } from '../common/database.service';
import { StorageService } from '../common/storage.service';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { SiteAssetEntity } from '../common/entities/site-asset.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { InventoryService } from './inventory.service';
import {
  InventoryMediaController,
  InventoryMediaAdmissionGuard,
  parseMediaRange,
} from './inventory-media.controller';
import {
  InventoryMediaService,
  evidenceDistanceMeters,
  photoEvidence,
} from './inventory-media.service';
import { projectMediaAssetEvidence } from './inventory-media-projection';
import { extractPhotoExif } from './photo-exif';
import {
  validateInventoryMedia,
  IMAGE_MAX_BYTES,
  VIDEO_MAX_BYTES,
  type ValidatedMedia,
} from './inventory-media-validation';

const user = { userId: 'qa-user' } as AuthenticatedUser;
const site = {
  id: 'qa-site',
  organizationId: 'qa-org',
  format: 'digital_led',
  latitude: 5.6037,
  longitude: -0.187,
};
const picture = async () =>
  sharp({ create: { width: 32, height: 24, channels: 3, background: '#E4002B' } })
    .jpeg()
    .toBuffer();
const imageMedia: ValidatedMedia = {
  mediaType: 'image',
  contentType: 'image/jpeg',
  extension: 'jpg',
  width: 32,
  height: 24,
  byteSize: 100,
  exif: { warnings: [] },
};

/** Synthetic EXIF only: Accra GPS, UTC GPS time and a camera local time. */
function tiffFixture(): Buffer {
  const b = Buffer.alloc(290);
  b.write('II');
  b.writeUInt16LE(42, 2);
  b.writeUInt32LE(8, 4);
  const entry = (at: number, tag: number, type: number, count: number, value: number | string) => {
    b.writeUInt16LE(tag, at);
    b.writeUInt16LE(type, at + 2);
    b.writeUInt32LE(count, at + 4);
    if (typeof value === 'string') b.write(value, at + 8);
    else b.writeUInt32LE(value, at + 8);
  };
  b.writeUInt16LE(2, 8);
  entry(10, 0x8825, 4, 1, 38);
  entry(22, 0x8769, 4, 1, 128);
  b.writeUInt16LE(7, 38);
  entry(40, 1, 2, 2, 'N');
  entry(52, 2, 5, 3, 180);
  entry(64, 3, 2, 2, 'W');
  entry(76, 4, 5, 3, 204);
  entry(88, 7, 5, 3, 228);
  entry(100, 29, 2, 11, 252);
  // Unknown tag demonstrates ignored, bounded types rather than code execution.
  entry(112, 99, 2, 4, 'x');
  b.writeUInt16LE(1, 128);
  entry(130, 0x9003, 2, 20, 266);
  const rational = (at: number, n: number) => {
    b.writeUInt32LE(n, at);
    b.writeUInt32LE(1, at + 4);
  };
  [5, 36, 0].forEach((n, i) => rational(180 + i * 8, n));
  [0, 11, 0].forEach((n, i) => rational(204 + i * 8, n));
  [10, 30, 15].forEach((n, i) => rational(228 + i * 8, n));
  b.write('2026:01:15\0', 252);
  b.write('2026:01:15 10:30:15\0', 266);
  return b;
}

function harness(
  options: { foreign?: boolean; format?: string; auditFail?: boolean; readDenied?: boolean } = {},
) {
  const assets: SiteAssetEntity[] = [];
  const audits: unknown[] = [],
    stored: { ref: string; buffer: Buffer; type: string }[] = [],
    removed: string[] = [];
  const assetRepo = {
    create: (row: Partial<SiteAssetEntity>) => ({ ...row }),
    save: async (row: SiteAssetEntity) => {
      const saved = { ...row, id: `asset-${assets.length + 1}` };
      assets.push(saved);
      return saved;
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) =>
      assets.find((a) =>
        Object.entries(where).every(([k, v]) => a[k as keyof SiteAssetEntity] === v),
      ) ?? null,
  };
  const siteRow = {
    ...site,
    organizationId: options.foreign ? 'other-org' : 'qa-org',
    format: options.format ?? 'digital_led',
  };
  const repository = (entity: unknown) =>
    entity === SiteAssetEntity
      ? assetRepo
      : entity === BillboardSiteEntity
        ? { findOne: async () => siteRow }
        : entity === AuditLogEntity
          ? {
              create: (row: unknown) => row,
              save: async (row: unknown) => {
                if (options.auditFail) throw new Error('audit unavailable');
                audits.push(row);
              },
            }
          : assert.fail('Unexpected repository');
  const db = {
    repo: async (entity: unknown) => repository(entity),
    transaction: async (fn: (manager: unknown) => Promise<unknown>) =>
      fn({
        getRepository: repository,
        query: async () => [siteRow],
      }),
  } as unknown as DatabaseService;
  const storage = {
    store: async (ref: string, buffer: Buffer, type: string) => {
      stored.push({ ref, buffer, type });
      return ref;
    },
    remove: async (ref: string) => {
      removed.push(ref);
    },
    read: async () => stored[0]!.buffer,
  } as unknown as StorageService;
  const inventory = {
    assertCanReadSite: async () => {
      if (options.readDenied) throw new ForbiddenException();
    },
  } as unknown as InventoryService;
  return {
    service: new InventoryMediaService(db, storage, inventory),
    assets,
    audits,
    stored,
    removed,
  };
}

describe('inventory photo admission and EXIF evidence', () => {
  it('fully decodes JPEG/PNG/WebP and extracts actual EXIF in each supported container', async () => {
    const jpeg = await picture();
    const exif = Buffer.concat([Buffer.from('Exif\0\0'), tiffFixture()]);
    const app1 = Buffer.alloc(4);
    app1[0] = 0xff;
    app1[1] = 0xe1;
    app1.writeUInt16BE(exif.length + 2, 2);
    const tagged = Buffer.concat([jpeg.subarray(0, 2), app1, exif, jpeg.subarray(2)]);
    const png = await sharp(tagged).keepExif().png().toBuffer();
    const webp = await sharp(tagged).keepExif().webp().toBuffer();
    for (const [buffer, mimetype] of [
      [tagged, 'image/jpeg'],
      [png, 'image/png'],
      [webp, 'image/webp'],
    ] as const) {
      const media = await validateInventoryMedia(
        { buffer, mimetype, originalname: 'synthetic' },
        false,
      );
      assert.equal(media.width, 32);
      assert.equal(media.height, 24);
      assert.deepEqual(media.exif.gps, { latitude: 5.6, longitude: -11 / 60 });
      assert.equal(media.exif.capturedAt, '2026-01-15T10:30:15.000Z');
    }
  });
  it('rejects MIME spoofing, truncated and oversized payloads and animated images', async () => {
    const buffer = await picture();
    await assert.rejects(
      validateInventoryMedia({ buffer, mimetype: 'image/png', originalname: 'spoof.png' }, false),
      BadRequestException,
    );
    await assert.rejects(
      validateInventoryMedia(
        {
          buffer: buffer.subarray(0, buffer.length - 20),
          mimetype: 'image/jpeg',
          originalname: 'cut.jpg',
        },
        false,
      ),
      BadRequestException,
    );
    await assert.rejects(
      validateInventoryMedia(
        {
          buffer: Buffer.alloc(IMAGE_MAX_BYTES + 1),
          mimetype: 'image/jpeg',
          originalname: 'large.jpg',
        },
        false,
      ),
      PayloadTooLargeException,
    );
    await assert.rejects(
      validateInventoryMedia(
        {
          buffer: Buffer.from('<svg onload="alert(1)"/>'),
          mimetype: 'image/jpeg',
          originalname: 'active.jpg',
        },
        false,
      ),
      BadRequestException,
    );
    const frames = Buffer.alloc(16 * 32 * 3);
    for (let i = 0; i < 16 * 16; i++) {
      frames[i * 3] = 255;
      frames[16 * 16 * 3 + i * 3 + 2] = 255;
    }
    const animated = await sharp(frames, {
      raw: { width: 16, height: 32, pageHeight: 16, channels: 3 },
    })
      .webp({ delay: [100, 100] })
      .toBuffer();
    await assert.rejects(
      validateInventoryMedia(
        { buffer: animated, mimetype: 'image/webp', originalname: 'animated.webp' },
        false,
      ),
      BadRequestException,
    );
    const oversized = await sharp({
      create: { width: 10001, height: 1, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer();
    await assert.rejects(
      validateInventoryMedia(
        { buffer: oversized, mimetype: 'image/png', originalname: 'dimensions.png' },
        false,
      ),
      BadRequestException,
    );
  });
  it('bounds malformed EXIF and preserves local time without inventing a timezone', () => {
    const local = tiffFixture();
    local.writeUInt16LE(1, 8); // root only GPS, instead point to EXIF
    local.writeUInt16LE(0x8769, 10);
    local.writeUInt32LE(128, 18);
    const parsed = extractPhotoExif(local);
    assert.equal(parsed.capturedAt, undefined);
    assert.equal(parsed.localCapturedAt, '2026-01-15T10:30:15');
    assert.match(parsed.warnings[0]!, /no timezone/);
    const bad = tiffFixture();
    bad.writeUInt32LE(0xffffffff, 4);
    assert.match(extractPhotoExif(bad).warnings[0]!, /could not be read/);
    assert.deepEqual(extractPhotoExif(undefined), { warnings: [] });
  });
  it('never promotes browser GPS, EXIF or declared dates to independent verification', () => {
    const missing = photoEvidence(imageMedia, {}, site);
    assert.equal(missing.time.source, 'missing');
    assert.equal(missing.location.source, 'missing');
    assert.equal(missing.evidenceDistanceMeters, null);
    assert.equal(missing.verification, 'unverified');
    const declared = photoEvidence(imageMedia, { capturedAt: '2026-01-15' }, site);
    assert.equal(declared.time.precision, 'day');
    assert.equal(declared.time.declaredDate, '2026-01-15');
    assert.equal(declared.time.source, 'partner_declared');
    assert.equal(declared.location.source, 'missing');
    const device = photoEvidence(
      imageMedia,
      {
        captureMethod: 'device_camera',
        deviceLatitude: 5.6037,
        deviceLongitude: -0.187,
        deviceAccuracyMeters: 12,
        deviceCapturedAt: '2026-01-15T10:30:15Z',
        deviceLocationRecordedAt: '2026-01-15T10:30:20Z',
      },
      site,
    );
    const deniedGps = photoEvidence(
      imageMedia,
      { captureMethod: 'device_camera', deviceCapturedAt: '2026-01-15T10:30:15Z' },
      site,
    );
    assert.equal(deniedGps.time.source, 'device_capture');
    assert.equal(deniedGps.location.source, 'missing');
    assert.equal(device.location.recordedAt, '2026-01-15T10:30:20.000Z');
    assert.equal(device.time.value, '2026-01-15T10:30:15.000Z');
    assert.equal(device.time.precision, 'second');
    assert.equal(device.location.source, 'device_gps');
    assert.equal(device.evidenceDistanceMeters, 0);
    assert.equal(device.verification, 'unverified');
    assert.throws(
      () => photoEvidence(imageMedia, { captureMethod: 'device_camera', deviceLatitude: 5 }, site),
      BadRequestException,
    );
    assert.throws(
      () => photoEvidence(imageMedia, { capturedAt: '2099-01-01' }, site),
      BadRequestException,
    );
    assert.throws(
      () => photoEvidence(imageMedia, { capturedAt: '2026-02-30' }, site),
      BadRequestException,
    );
    assert.equal(
      evidenceDistanceMeters({ latitude: null as unknown as number, longitude: 0 }, site),
      null,
    );
  });
});

describe('inventory media ownership, audit, compensation and retries', () => {
  it('rejects foreign ownership and non-LED video before decoding or storing', async () => {
    const file = {
      buffer: Buffer.from('not media'),
      mimetype: 'video/mp4',
      originalname: 'board.mp4',
    };
    const foreign = harness({ foreign: true });
    await assert.rejects(
      foreign.service.upload(user, 'qa-org', site.id, file, {}, true),
      ForbiddenException,
    );
    assert.equal(foreign.stored.length, 0);
    const staticSite = harness({ format: 'static' });
    await assert.rejects(
      staticSite.service.upload(user, 'qa-org', site.id, file, {}, true),
      BadRequestException,
    );
    assert.equal(staticSite.stored.length, 0);
  });
  it('preserves original bytes, unknown front date and appends one audited record; identical retry replays', async () => {
    const h = harness(),
      buffer = await picture();
    const file = { buffer, mimetype: 'image/jpeg', originalname: '../../untrusted.jpg' };
    const dto = {
      clientRequestId: 'ef466c2d-8cbc-438d-8816-8292bfa05b1b',
      missingMetadataReason: 'Synthetic fixture without EXIF',
    };
    const first = await h.service.upload(user, 'qa-org', site.id, file, dto);
    assert.equal(first.capturedAt, undefined);
    assert.equal(first.metadata?.verification, 'unverified');
    assert.equal(first.contentType, 'image/jpeg');
    assert.deepEqual(h.stored[0]!.buffer, buffer);
    assert.match(first.storageRef, /^assets\/qa-site\/[\w-]+\.jpg$/);
    const replay = await h.service.upload(user, 'qa-org', site.id, file, dto);
    assert.equal(replay.id, first.id);
    assert.equal(h.assets.length, 1);
    assert.equal(h.audits.length, 1);
    assert.equal(h.stored.length, 1);
    await assert.rejects(
      h.service.upload(user, 'qa-org', site.id, file, { ...dto, capturedAt: '2026-01-15' }),
      ConflictException,
    );
  });
  it('compensates storage if audit/transaction fails and enforces read authorization first', async () => {
    const h = harness({ auditFail: true }),
      file = { buffer: await picture(), mimetype: 'image/jpeg', originalname: 'photo.jpg' };
    await assert.rejects(h.service.upload(user, 'qa-org', site.id, file, {}), /audit unavailable/);
    assert.equal(h.removed[0], h.stored[0]!.ref);
    await assert.rejects(
      harness({ readDenied: true }).service.read(user, 'other-org', site.id, 'unknown'),
      ForbiddenException,
    );
  });
  it('guards upload and playback routes and supports bounded single-byte ranges', () => {
    for (const method of ['uploadPhoto', 'uploadBoardVideo'] as const) {
      assert.deepEqual(
        Reflect.getMetadata(GUARDS_METADATA, InventoryMediaController.prototype[method]),
        [JwtAuthGuard, CapabilitiesGuard, InventoryMediaAdmissionGuard],
      );
    }
    assert.deepEqual(
      Reflect.getMetadata(GUARDS_METADATA, InventoryMediaController.prototype.read),
      [JwtAuthGuard, CapabilitiesGuard],
    );
    assert.deepEqual(parseMediaRange('bytes=2-5', 10), { start: 2, end: 5 });
    assert.deepEqual(parseMediaRange('bytes=8-', 10), { start: 8, end: 9 });
    assert.deepEqual(parseMediaRange('bytes=-4', 10), { start: 6, end: 9 });
    for (const header of [
      'bytes=10-',
      'bytes=-0',
      'bytes=5-4',
      'bytes=0-1,4-5',
      'bytes=-',
      'bytes=99999999999999999999-',
    ])
      assert.equal(parseMediaRange(header, 10), 'invalid');
    assert.equal(parseMediaRange(undefined, 10), null);
  });
});

describe('actual LED board video decoder', () => {
  // Bounded, local synthetic recordings; no partner media or network/provider.
  for (const [name, mimetype, codec] of [
    ['mp4', 'video/mp4', 'libx264'],
    ['webm', 'video/webm', 'libvpx-vp9'],
  ] as const) {
    it(`accepts and fully decodes a synthetic ${name}; saves a distinct board-video kind`, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'abonten-media-test-'));
      try {
        const path = join(dir, `board.${name}`);
        execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-f',
            'lavfi',
            '-i',
            'color=c=red:s=64x48:d=0.5',
            '-an',
            '-c:v',
            codec,
            '-threads',
            '1',
            '-pix_fmt',
            'yuv420p',
            path,
          ],
          { timeout: 15_000 },
        );
        const buffer = readFileSync(path),
          file = { buffer, mimetype, originalname: `board.${name}` };
        const media = await validateInventoryMedia(file, true);
        assert.equal(media.mediaType, 'video');
        assert.equal(media.contentType, mimetype);
        assert.equal(media.width, 64);
        assert.ok(media.durationSeconds! > 0 && media.durationSeconds! < 1);
        const h = harness(),
          asset = await h.service.upload(user, 'qa-org', site.id, file, {}, true);
        assert.equal(asset.kind, 'board_video');
        assert.equal(asset.mediaType, 'video');
        assert.equal(h.audits.length, 1);
        await assert.rejects(
          validateInventoryMedia({ ...file, buffer: buffer.subarray(0, 25) }, true),
          BadRequestException,
        );
        await assert.rejects(
          validateInventoryMedia(
            { ...file, mimetype: name === 'mp4' ? 'video/webm' : 'video/mp4' },
            true,
          ),
          BadRequestException,
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
  it('rejects oversize, overlong, non-playable codecs and non-video active payloads', async () => {
    await assert.rejects(
      validateInventoryMedia(
        {
          buffer: Buffer.alloc(VIDEO_MAX_BYTES + 1),
          mimetype: 'video/mp4',
          originalname: 'large.mp4',
        },
        true,
      ),
      PayloadTooLargeException,
    );
    const dir = mkdtempSync(join(tmpdir(), 'abonten-media-test-'));
    try {
      for (const [name, duration, codec] of [
        ['long', '61', 'libx264'],
        ['codec', '0.5', 'mpeg4'],
      ] as const) {
        const path = join(dir, `${name}.mp4`);
        execFileSync(
          'ffmpeg',
          [
            '-v',
            'error',
            '-f',
            'lavfi',
            '-i',
            `color=c=red:s=16x16:d=${duration}`,
            '-r',
            '1',
            '-an',
            '-c:v',
            codec,
            '-threads',
            '1',
            '-pix_fmt',
            'yuv420p',
            path,
          ],
          { timeout: 15_000 },
        );
        await assert.rejects(
          validateInventoryMedia(
            { buffer: readFileSync(path), mimetype: 'video/mp4', originalname: `${name}.mp4` },
            true,
          ),
          BadRequestException,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function admissionRequest() {
  const req = Object.assign(new EventEmitter(), {
    path: '/inventory/sites/id/board-videos',
    headers: {},
    socket: new EventEmitter(),
    destroy: () => {
      res.emit('close');
      destroyed++;
    },
  });
  const res = new EventEmitter();
  let destroyed = 0;
  const context = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
  return { req, res, context, destroyed: () => destroyed };
}
describe('bounded media admission and slow upload recovery', () => {
  it('permits two uploads and releases aborted slots without reading the body itself', () => {
    const guard = new InventoryMediaAdmissionGuard(),
      a = admissionRequest(),
      b = admissionRequest(),
      c = admissionRequest();
    try {
      assert.equal(guard.canActivate(a.context), true);
      assert.equal(guard.canActivate(b.context), true);
      assert.throws(() => guard.canActivate(c.context), /busy/);
      assert.equal(a.req.listenerCount('data'), 0);
      a.req.emit('aborted');
      assert.equal(guard.canActivate(c.context), true);
    } finally {
      a.res.emit('close');
      b.res.emit('close');
      c.res.emit('close');
    }
  });
  it('allows progressing mobile uploads past 30s but closes stalled and over-deadline bodies', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const guard = new InventoryMediaAdmissionGuard(),
      slow = admissionRequest();
    guard.canActivate(slow.context);
    for (let i = 0; i < 5; i++) {
      t.mock.timers.tick(20_000);
      slow.req.socket.emit('data', Buffer.alloc(1));
    }
    assert.equal(slow.destroyed(), 0);
    t.mock.timers.tick(20_001);
    assert.equal(slow.destroyed(), 1);
    const stalled = admissionRequest();
    guard.canActivate(stalled.context);
    t.mock.timers.tick(30_001);
    assert.equal(stalled.destroyed(), 1);
    assert.equal(stalled.req.socket.listenerCount('data'), 0);
    const finished = admissionRequest();
    guard.canActivate(finished.context);
    finished.req.emit('end');
    t.mock.timers.tick(200_000);
    assert.equal(finished.destroyed(), 0);
    finished.res.emit('finish');
  });
});

describe('current photo-to-pin evidence read projection', () => {
  it('recomputes a moved pin without rewriting original evidence and removes warnings when corrected', () => {
    const original = {
      metadata: {
        verification: 'unverified',
        location: { source: 'exif', latitude: 5.6037, longitude: -0.187 },
        evidenceDistanceMeters: 0,
        warningCodes: ['exif_timezone_missing'],
        warnings: ['EXIF capture time has no timezone; confirm the capture date.'],
      },
    };
    const before = structuredClone(original);
    const moved = projectMediaAssetEvidence(original, { latitude: 5.6137, longitude: -0.187 });
    assert.equal(moved.metadata.evidenceDistanceMeters, 1112);
    assert.equal((moved.metadata as Record<string, unknown>).comparisonScope, 'current_site_pin');
    assert.deepEqual(moved.metadata.warningCodes, ['exif_timezone_missing', 'photo_pin_distance']);
    assert.match(moved.metadata.warnings[1]!, /current site pin/);
    assert.deepEqual(original, before);
    const corrected = projectMediaAssetEvidence(moved, site);
    assert.equal(corrected.metadata.evidenceDistanceMeters, 0);
    assert.deepEqual(corrected.metadata.warningCodes, ['exif_timezone_missing']);
    assert.equal(corrected.metadata.warnings.length, 1);
    assert.deepEqual(original, before);
  });
  it('retains uncertainty for missing/invalid coordinates and honors declared GPS accuracy', () => {
    const asset = {
      metadata: {
        location: {
          source: 'device_gps',
          latitude: 5.6037,
          longitude: -0.187,
          accuracyMeters: 1500,
        },
        evidenceDistanceMeters: 0,
        warnings: [],
        warningCodes: [],
      },
    };
    const moved = projectMediaAssetEvidence(asset, { latitude: '5.6137', longitude: '-0.187' });
    assert.equal(moved.metadata.evidenceDistanceMeters, 1112);
    assert.deepEqual(moved.metadata.warningCodes, []);
    for (const bad of [null, '', false, 'not-a-coordinate', 181]) {
      assert.equal(
        projectMediaAssetEvidence(asset, { latitude: 5.6137, longitude: bad }).metadata
          .evidenceDistanceMeters,
        null,
      );
    }
    const absent = {
      metadata: {
        evidenceDistanceMeters: 0,
        warningCodes: ['photo_pin_distance'],
        warnings: ['Photo location differs from the site pin'],
      },
    };
    assert.equal(projectMediaAssetEvidence(absent, site).metadata.evidenceDistanceMeters, null);
    assert.deepEqual(projectMediaAssetEvidence(absent, site).metadata.warningCodes, []);
  });
});

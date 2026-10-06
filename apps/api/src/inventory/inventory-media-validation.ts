import {
  BadRequestException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractPhotoExif, type ExtractedPhotoExif } from './photo-exif';

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const MEDIA_MAX_ACTIVE = 2;
export interface MediaFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}
export interface ValidatedMedia {
  mediaType: 'image' | 'video';
  contentType: string;
  extension: string;
  width: number;
  height: number;
  byteSize: number;
  durationSeconds?: number;
  exif: ExtractedPhotoExif;
}
let parsing = 0;

/** Both admission and parser work are independently bounded: cancellation of an
 * HTTP request does not permit unbounded concurrent native decodes. */
export async function validateInventoryMedia(
  file: MediaFile,
  video: boolean,
): Promise<ValidatedMedia> {
  if (parsing >= MEDIA_MAX_ACTIVE)
    throw new ServiceUnavailableException(
      'Media processing is busy. Keep your file and retry shortly.',
    );
  if (!file.buffer.length) throw new BadRequestException('The uploaded file is empty.');
  if (file.buffer.length > (video ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES)) {
    throw new PayloadTooLargeException(
      video ? 'Board videos are limited to 50 MB.' : 'Reference photos are limited to 10 MB.',
    );
  }
  parsing++;
  try {
    return video ? await validateVideo(file) : await validateImage(file);
  } finally {
    parsing--;
  }
}

async function validateImage(file: MediaFile): Promise<ValidatedMedia> {
  const formats: Record<string, { format: string; extension: string }> = {
    'image/jpeg': { format: 'jpeg', extension: 'jpg' },
    'image/png': { format: 'png', extension: 'png' },
    'image/webp': { format: 'webp', extension: 'webp' },
  };
  const requested = formats[file.mimetype];
  if (!requested || !imageSignature(file.buffer, file.mimetype))
    throw new BadRequestException('Only JPEG, PNG, or WebP images are accepted.');
  try {
    if (file.mimetype === 'image/png' && pngIsAnimated(file.buffer))
      throw new Error('Animated PNG');
    const input = sharp(file.buffer, {
      failOn: 'warning',
      limitInputPixels: 40_000_000,
      animated: true,
    }).timeout({ seconds: 8 });
    const meta = await input.metadata();
    if (
      meta.format !== requested.format ||
      !meta.width ||
      !meta.height ||
      meta.width > 10_000 ||
      meta.height > 10_000 ||
      (meta.pages ?? 1) > 1
    ) {
      throw new Error('Unsupported image bounds or format');
    }
    // Metadata alone can accept a truncated payload. Full native decode is
    // mandatory, with bounded pixels, frames and execution time. Original
    // upload bytes, including EXIF, are stored rather than this decoded buffer.
    await input.raw().toBuffer();
    return {
      mediaType: 'image',
      contentType: file.mimetype,
      extension: requested.extension,
      width: meta.width,
      height: meta.height,
      byteSize: file.buffer.length,
      exif: extractPhotoExif(meta.exif),
    };
  } catch {
    throw new BadRequestException(
      'This image could not be decoded safely. Use a complete, still JPEG, PNG or WebP image up to 40 megapixels.',
    );
  }
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
}
interface ProbeResult {
  streams?: ProbeStream[];
  format?: { duration?: string; format_name?: string };
}

/** No shell, no URLs, file-only protocol allowlist, private temporary directory,
 * bounded output/time, and a complete decode. Probe errors are never exposed. */
async function validateVideo(file: MediaFile): Promise<ValidatedMedia> {
  const mp4 = file.mimetype === 'video/mp4';
  const webm = file.mimetype === 'video/webm';
  if (
    (!mp4 && !webm) ||
    file.buffer.length < 16 ||
    (mp4 && file.buffer.toString('ascii', 4, 8) !== 'ftyp') ||
    (webm && !file.buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
  ) {
    throw new BadRequestException('Use an actual MP4 or WebM recording of the LED board.');
  }
  const dir = await mkdtemp(join(tmpdir(), 'abonten-board-video-'));
  const path = join(dir, mp4 ? 'board.mp4' : 'board.webm');
  try {
    await writeFile(path, file.buffer, { mode: 0o600 });
    const output = await runMediaTool(
      'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file',
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        path,
      ],
      10_000,
    );
    const probe = JSON.parse(output) as ProbeResult;
    const streams = probe.streams ?? [];
    const videos = streams.filter((s) => s.codec_type === 'video');
    const v = videos[0];
    const duration = Number(probe.format?.duration ?? v?.duration);
    const width = v?.width ?? 0,
      height = v?.height ?? 0;
    const container = probe.format?.format_name ?? '';
    if (
      videos.length !== 1 ||
      streams.length > 2 ||
      streams.some((s) => !['video', 'audio'].includes(s.codec_type ?? '')) ||
      streams.some(
        (s) =>
          s.codec_type === 'audio' &&
          !(mp4 ? ['aac'] : ['opus', 'vorbis']).includes(s.codec_name ?? ''),
      ) ||
      !(mp4 ? ['h264'] : ['vp8', 'vp9']).includes(v?.codec_name ?? '') ||
      !(mp4 ? container.includes('mp4') : container.includes('webm')) ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 60 ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > 1920 ||
      height > 1920 ||
      width * height > 1920 * 1080
    ) {
      throw new BadRequestException(
        'Use one H.264 MP4 or VP8/VP9 WebM board recording, up to 60 seconds and 1920 × 1080 pixels (portrait also supported).',
      );
    }
    const progress = await runMediaTool(
      'ffmpeg',
      [
        '-progress',
        'pipe:1',
        '-v',
        'error',
        '-nostdin',
        '-xerror',
        '-threads',
        '2',
        '-protocol_whitelist',
        'file',
        '-err_detect',
        'explode',
        '-i',
        path,
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-threads',
        '2',
        '-f',
        'null',
        '-',
      ],
      30_000,
    );
    const decodedTimes = [...progress.matchAll(/^out_time_us=(\d+)$/gm)].map(
      (match) => Number(match[1]) / 1_000_000,
    );
    if (!decodedTimes.length || decodedTimes.some((seconds) => seconds > 60)) {
      throw new BadRequestException(
        'The decoded board recording must be no longer than 60 seconds.',
      );
    }
    return {
      mediaType: 'video',
      contentType: file.mimetype,
      extension: mp4 ? 'mp4' : 'webm',
      width,
      height,
      durationSeconds: duration,
      byteSize: file.buffer.length,
      exif: { warnings: [] },
    };
  } catch (err) {
    if (err instanceof BadRequestException || err instanceof ServiceUnavailableException) throw err;
    throw new BadRequestException(
      'This video could not be decoded safely. Export a complete H.264 MP4 or VP8/VP9 WebM recording and retry.',
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runMediaTool(command: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { timeout, maxBuffer: 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err && 'code' in err && err.code === 'ENOENT') {
          reject(
            new ServiceUnavailableException(
              'Board video validation is unavailable. Keep your file and retry after service recovery.',
            ),
          );
        } else if (err) reject(err);
        else resolve(stdout);
      },
    );
  });
}

function pngIsAnimated(buffer: Buffer): boolean {
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    if (length > buffer.length - offset - 12) throw new Error('Invalid PNG chunk');
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'acTL') return true;
    offset += length + 12;
    if (type === 'IEND') break;
  }
  return false;
}

function imageSignature(buffer: Buffer, mime: string): boolean {
  if (buffer.length < 12) return false;
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png')
    return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/webp')
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

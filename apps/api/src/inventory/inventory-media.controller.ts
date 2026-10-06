import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type {} from 'multer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CapabilitiesGuard } from '../capabilities/capabilities.guard';
import { Capability } from '../capabilities/capability.enum';
import {
  RequireAnyCapabilities,
  RequireCapabilities,
} from '../capabilities/require-capabilities.decorator';
import { InventoryMediaService } from './inventory-media.service';
import { UploadInventoryMediaDto } from './dto/inventory-media.dto';
import { IMAGE_MAX_BYTES, MEDIA_MAX_ACTIVE, VIDEO_MAX_BYTES } from './inventory-media-validation';

type AuthReq = Request & { user?: AuthenticatedUser };
const orgContext = (req: AuthReq) =>
  (req.headers['x-org-id'] as string | undefined) ?? req.user?.activeOrgId;
let receiving = 0;

/** Before Multer buffers bytes: two uploads per process, bounded field/body sizes
 * and a 30-second idle timeout and a 120-second total read deadline. Abort releases admission, while decoder capacity
 * remains held separately until native/subprocess work has actually completed. */
@Injectable()
export class InventoryMediaAdmissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (receiving >= MEDIA_MAX_ACTIVE)
      throw new ServiceUnavailableException(
        'Media upload is busy. Keep your file and retry shortly.',
      );
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const max = req.path.endsWith('/board-videos') ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
    const length = req.headers['content-length'];
    if (length && (!/^\d+$/.test(length) || Number(length) > max + 64 * 1024)) {
      throw new BadRequestException('The media upload is larger than the allowed limit.');
    }
    receiving++;
    let done = false;
    let idle = setTimeout(() => req.destroy(), 30_000);
    idle.unref();
    const total = setTimeout(() => req.destroy(), 120_000);
    total.unref();
    // Observe socket progress without starting the request body's flowing mode
    // before Multer attaches its listeners (which would lose initial chunks).
    const progress = () => {
      clearTimeout(idle);
      idle = setTimeout(() => req.destroy(), 30_000);
      idle.unref();
    };
    const stopReading = () => {
      clearTimeout(idle);
      clearTimeout(total);
      req.socket.removeListener('data', progress);
    };
    req.socket.on('data', progress);
    req.once('end', stopReading);
    const release = () => {
      if (done) return;
      done = true;
      stopReading();
      receiving--;
    };
    res.once('finish', release);
    res.once('close', release);
    req.once('aborted', release);
    return true;
  }
}

const upload = (video: boolean) =>
  FileInterceptor('file', {
    limits: {
      fileSize: video ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES,
      files: 1,
      fields: 12,
      fieldSize: 2048,
      parts: 14,
    },
    fileFilter: (_req, file, cb) => {
      const allowed = video
        ? ['video/mp4', 'video/webm']
        : ['image/jpeg', 'image/png', 'image/webp'];
      cb(
        allowed.includes(file.mimetype)
          ? null
          : new BadRequestException(
              video
                ? 'Only MP4 or WebM board recordings are accepted.'
                : 'Only JPEG, PNG, or WebP images are accepted.',
            ),
        allowed.includes(file.mimetype),
      );
    },
  });

@ApiTags('inventory')
@Controller('inventory')
export class InventoryMediaController {
  constructor(private readonly media: InventoryMediaService) {}

  @Post('sites/:siteId/assets')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard, InventoryMediaAdmissionGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @UseInterceptors(upload(false))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a decoded reference photo with honest EXIF/device/declared provenance',
  })
  async uploadPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadInventoryMediaDto,
  ) {
    if (!file) throw new BadRequestException('Choose a reference photo to upload.');
    return this.media.upload(user, orgContext(req), siteId, file, dto);
  }

  @Post('sites/:siteId/board-videos')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard, InventoryMediaAdmissionGuard)
  @RequireCapabilities(Capability.INVENTORY_EDIT)
  @UseInterceptors(upload(true))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a validated recording of an actual digital LED board, separate from ad creative',
  })
  async uploadBoardVideo(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadInventoryMediaDto,
  ) {
    if (!file) throw new BadRequestException('Choose a recording of the actual LED board.');
    return this.media.upload(user, orgContext(req), siteId, file, dto, true);
  }

  @Get('sites/:siteId/assets/:assetId/file')
  @UseGuards(JwtAuthGuard, CapabilitiesGuard)
  @RequireAnyCapabilities(
    Capability.INVENTORY_VIEW,
    Capability.MARKETPLACE_VIEW,
    Capability.PLATFORM_ADMIN,
  )
  @ApiOperation({
    summary: 'Read authorized inventory evidence, with video range playback and exact MIME',
  })
  async read(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: AuthReq,
    @Res({ passthrough: true }) res: Response,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    const media = await this.media.read(user, orgContext(req), siteId, assetId);
    if ('redirect' in media) return res.redirect(302, media.redirect!);
    res.setHeader('Content-Type', media.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Accept-Ranges', 'bytes');
    const range = parseMediaRange(req.headers.range, media.buffer.length);
    if (range === 'invalid') {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${media.buffer.length}`);
      res.setHeader('Content-Length', '0');
      return new StreamableFile(Buffer.alloc(0), { type: media.contentType });
    }
    const buffer = range ? media.buffer.subarray(range.start, range.end + 1) : media.buffer;
    if (range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${media.buffer.length}`);
    }
    res.setHeader('Content-Length', String(buffer.length));
    return new StreamableFile(buffer, { type: media.contentType });
  }
}

export function parseMediaRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size <= 0) return 'invalid';
  if (!match[1]) {
    const suffix = Number(match[2]);
    return Number.isSafeInteger(suffix) && suffix > 0
      ? { start: Math.max(0, size - suffix), end: size - 1 }
      : 'invalid';
  }
  const start = Number(match[1]),
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start < size &&
    end >= start
    ? { start, end }
    : 'invalid';
}

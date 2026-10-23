import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  Controller,
  Injectable,
  Module,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  type CanActivate,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FileInterceptor } from '@nestjs/platform-express';
import { InventoryMediaAdmissionGuard } from './inventory-media.controller';
@Injectable()
class AdmissionDelay implements CanActivate {
  async canActivate() {
    await new Promise((r) => setTimeout(r, 10));
    return true;
  }
}
@Controller('media')
class MultipartProbe {
  @Post()
  @UseGuards(AdmissionDelay, InventoryMediaAdmissionGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File) {
    return { size: file.size, first: file.buffer[0], last: file.buffer[file.buffer.length - 1] };
  }
}
@Module({
  controllers: [MultipartProbe],
  providers: [AdmissionDelay, InventoryMediaAdmissionGuard],
})
class MediaTransportModule {}
test('multipart admission consumes a complete photo-sized body after asynchronous authorization and releases its slot', async () => {
  const app = await NestFactory.create(MediaTransportModule, { logger: false });
  await app.listen(0, '127.0.0.1');
  try {
    const url = await app.getUrl(),
      bytes = Buffer.alloc(2 * 1024 * 1024 + 173, 117);
    bytes[0] = 31;
    bytes[bytes.length - 1] = 213;
    for (let attempt = 0; attempt < 3; attempt++) {
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: 'image/png' }), 'front-elevation.png');
      const response = await fetch(url + '/media', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { size: bytes.length, first: 31, last: 213 });
    }
  } finally {
    await app.close();
  }
});

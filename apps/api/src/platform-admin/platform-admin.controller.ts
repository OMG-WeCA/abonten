import { Controller, Get } from '@nestjs/common';
import { PlatformAdminService } from './platform-admin.service';

@Controller('platform-admin')
export class PlatformAdminController {
  constructor(private readonly service: PlatformAdminService) {}

  @Get()
  findAll(): string[] {
    return this.service.findAll();
  }
}

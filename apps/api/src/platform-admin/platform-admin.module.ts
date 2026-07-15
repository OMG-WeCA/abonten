import { Module } from '@nestjs/common';
import { OrgController } from './org.controller';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  controllers: [PlatformAdminController, OrgController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}

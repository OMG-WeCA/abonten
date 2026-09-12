import { Module } from '@nestjs/common';
import { PlatformAdminController } from './platform-admin.controller';
import { AuthModule } from '../auth/auth.module';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [AuthModule],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
  exports: [PlatformAdminService],
})
export class PlatformAdminModule {}

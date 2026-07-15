import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { HealthModule } from './health.module';
import { MailModule } from './mail.module';
import { RedisModule } from './redis.module';

@Module({
  imports: [DatabaseModule, RedisModule, MailModule, HealthModule],
  exports: [DatabaseModule, RedisModule, MailModule, HealthModule],
})
export class CommonModule {}

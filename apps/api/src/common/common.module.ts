import { Module } from '@nestjs/common';
import { DatabaseModule } from './database.module';
import { HealthModule } from './health.module';
import { RedisModule } from './redis.module';

@Module({
  imports: [DatabaseModule, RedisModule, HealthModule],
  exports: [DatabaseModule, RedisModule, HealthModule],
})
export class CommonModule {}

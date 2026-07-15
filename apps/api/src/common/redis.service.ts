import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

// ioredis reconnects without throwing; we swallow errors so dev boot works without Redis.
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    this.client.on('error', (err) => {
      Logger.warn(`Redis error (may be down): ${String(err.message ?? err)}`, 'RedisService');
    });
  }

  async onModuleInit() {
    await this.client.connect().catch(() => undefined);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  get instance(): Redis {
    return this.client;
  }
}

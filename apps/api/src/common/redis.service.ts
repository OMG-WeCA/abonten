import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

// Auth state is safety-critical: never queue or replay a command after a Redis outage.
const REDIS_COMMAND_TIMEOUT_MS = 2_000;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: true,
      connectTimeout: REDIS_COMMAND_TIMEOUT_MS,
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      autoResendUnfulfilledCommands: false,
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

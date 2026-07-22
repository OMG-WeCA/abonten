import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { DatabaseService } from './database.service';

// Provides a PostgreSQL/PostGIS DataSource. Lazy: a DataSource only connects on
// .initialize(), which DatabaseService does on first repository use — not at boot.
// Schema is managed by versioned migrations (see src/data-source.ts + src/migrations).
// Per SPEC §9 / the task: synchronize is enabled only in development (dev convenience)
// and disabled in production. Migrations remain the canonical schema path.
@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const nodeEnv = cfg.get<string>('nodeEnv') ?? 'development';
        const synchronize = nodeEnv === 'development';
        // Configuration-level verification: log the effective synchronize flag so the
        // dev/prod policy is observable at boot.
        Logger.log(`DataSource synchronize=${synchronize} (nodeEnv=${nodeEnv})`, 'DatabaseModule');
        return new DataSource({
          type: 'postgres',
          url: cfg.get<string>('database.url'),
          synchronize,
          entities: ENTITIES,
        });
      },
    },
    DatabaseService,
  ],
  exports: [DataSource, DatabaseService],
})
export class DatabaseModule {}
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { DatabaseService } from './database.service';

// Provides a PostgreSQL/PostGIS DataSource. Lazy: a DataSource only connects on
// .initialize(), which DatabaseService does on first repository use — not at boot.
// Schema is managed exclusively by versioned migrations in every environment.
// TypeORM synchronization would remove migration-only checks and indexes, so it
// must remain disabled even for local development.
export function createRuntimeDataSource(cfg: ConfigService): DataSource {
  const nodeEnv = cfg.get<string>('nodeEnv') ?? 'development';
  Logger.log(
    `DataSource synchronize=false; schema managed by migrations (nodeEnv=${nodeEnv})`,
    'DatabaseModule',
  );
  return new DataSource({
    type: 'postgres',
    url: cfg.get<string>('database.url'),
    synchronize: false,
    entities: ENTITIES,
  });
}

@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      inject: [ConfigService],
      useFactory: createRuntimeDataSource,
    },
    DatabaseService,
  ],
  exports: [DataSource, DatabaseService],
})
export class DatabaseModule {}

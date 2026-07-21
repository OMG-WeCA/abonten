import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { DatabaseService } from './database.service';

// Provides a PostgreSQL/PostGIS DataSource. Lazy: a DataSource only connects on
// .initialize(), which DatabaseService does on first repository use — not at boot.
// Schema is managed by versioned migrations (see src/data-source.ts + src/migrations);
// synchronize stays false in the runtime DataSource.
@Global()
@Module({
  providers: [
    {
      provide: DataSource,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) =>
        new DataSource({
          type: 'postgres',
          url: cfg.get<string>('database.url'),
          synchronize: false,
          entities: ENTITIES,
        }),
    },
    DatabaseService,
  ],
  exports: [DataSource, DatabaseService],
})
export class DatabaseModule {}
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BillboardSiteEntity } from './entities/billboard-site.entity';
import { OrganizationEntity } from './entities/organization.entity';

// Provides a PostgreSQL/PostGIS DataSource. Lazy: a DataSource only connects on
// .initialize(), which we do NOT call on boot, so the API starts in dev even without a DB.
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
          entities: [OrganizationEntity, BillboardSiteEntity],
        }),
    },
  ],
  exports: [DataSource],
})
export class DatabaseModule {}

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { BillboardSiteEntity } from './entities/billboard-site.entity';
import { OrganizationEntity } from './entities/organization.entity';
import { SiteFaceEntity } from './entities/site-face.entity';
import { SiteMetadataEntity } from './entities/site-metadata.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { RefreshTokenEntity } from '../auth/entities/refresh-token.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { DatabaseService } from './database.service';

// Provides a PostgreSQL/PostGIS DataSource. Lazy: a DataSource only connects on
// .initialize(), which DatabaseService does on first repository use — not at boot.
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
          entities: [
            OrganizationEntity,
            BillboardSiteEntity,
            SiteFaceEntity,
            SiteMetadataEntity,
            UserEntity,
            MembershipEntity,
            UserCapabilityOverrideEntity,
            RefreshTokenEntity,
          ],
        }),
    },
    DatabaseService,
  ],
  exports: [DataSource, DatabaseService],
})
export class DatabaseModule {}

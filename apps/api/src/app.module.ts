import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './common/configuration';
import validationSchema from './common/validation';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { InventoryModule } from './inventory/inventory.module';
import { PlanningModule } from './planning/planning.module';
import { BookingModule } from './booking/booking.module';
import { PopModule } from './pop/pop.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { ReportingModule } from './reporting/reporting.module';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';

const featureModules = [
  AuthModule,
  InventoryModule,
  PlanningModule,
  BookingModule,
  PopModule,
  MonitoringModule,
  MarketplaceModule,
  ReportingModule,
  PlatformAdminModule,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [configuration],
      validationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    CommonModule,
    ...featureModules,
  ],
})
export class AppModule {}

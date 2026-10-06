import { ExchangeRatesController } from './exchange-rates.controller';
import { MarketsController } from './markets.controller';
import { Module } from '@nestjs/common';
import { StorageService } from '../common/storage.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { LocationVerificationService } from './location/location-verification.service';
import {
  InventoryMediaController,
  InventoryMediaAdmissionGuard,
} from './inventory-media.controller';
import { InventoryMediaService } from './inventory-media.service';
import { GeographicContextController } from '../enrichment/geographic-context.controller';
import { GeographicContextService } from '../enrichment/geographic-context.service';

@Module({
  controllers: [
    InventoryController,
    InventoryMediaController,
    ExchangeRatesController,
    MarketsController,
    GeographicContextController,
  ],
  providers: [
    InventoryService,
    StorageService,
    GeographicContextService,
    LocationVerificationService,
    InventoryMediaService,
    InventoryMediaAdmissionGuard,
  ],
  exports: [InventoryService, GeographicContextService],
})
export class InventoryModule {}

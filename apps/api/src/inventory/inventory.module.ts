import { ExchangeRatesController } from './exchange-rates.controller';
import { MarketsController } from './markets.controller';
import { Module } from '@nestjs/common';
import { StorageService } from '../common/storage.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { GeographicContextController } from '../enrichment/geographic-context.controller';
import { GeographicContextService } from '../enrichment/geographic-context.service';

@Module({
  controllers: [InventoryController, ExchangeRatesController, MarketsController, GeographicContextController],
  providers: [InventoryService, StorageService, GeographicContextService],
  exports: [InventoryService],
})
export class InventoryModule {}

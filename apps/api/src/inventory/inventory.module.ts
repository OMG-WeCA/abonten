import { ExchangeRatesController } from './exchange-rates.controller';
import { MarketsController } from './markets.controller';
import { Module } from '@nestjs/common';
import { StorageService } from '../common/storage.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController, ExchangeRatesController, MarketsController],
  providers: [InventoryService, StorageService],
  exports: [InventoryService],
})
export class InventoryModule {}
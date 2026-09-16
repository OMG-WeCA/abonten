import { ExchangeRatesController } from './exchange-rates.controller';
import { Module } from '@nestjs/common';
import { StorageService } from '../common/storage.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController, ExchangeRatesController],
  providers: [InventoryService, StorageService],
  exports: [InventoryService],
})
export class InventoryModule {}
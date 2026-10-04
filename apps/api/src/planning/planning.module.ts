import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { BriefExtractionService } from './brief-extraction.service';

@Module({
  imports: [MarketplaceModule],
  controllers: [PlanningController],
  providers: [PlanningService, BriefExtractionService],
})
export class PlanningModule {}

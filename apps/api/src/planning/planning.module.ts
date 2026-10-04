import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';
import { InventoryModule } from '../inventory/inventory.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { BriefAdmissionInterceptor } from './brief-admission.interceptor';
import { BriefExtractionService } from './brief-extraction.service';
import { OpenAiPlannerProvider } from './openai-planner.provider';

@Module({
  imports: [MarketplaceModule, InventoryModule],
  controllers: [PlanningController],
  providers: [
    PlanningService,
    BriefExtractionService,
    BriefAdmissionInterceptor,
    OpenAiPlannerProvider,
  ],
})
export class PlanningModule {}

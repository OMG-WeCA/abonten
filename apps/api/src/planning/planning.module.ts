import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller';
import { PlanningService } from './planning.service';
import { InventoryModule } from '../inventory/inventory.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { BriefAdmissionInterceptor } from './brief-admission.interceptor';
import { BriefExtractionService } from './brief-extraction.service';
import { OpenAiPlannerProvider } from './openai-planner.provider';
import { PlanningDraftsController } from './planning-drafts.controller';
import { PlanningDraftsService } from './planning-drafts.service';
import { AgencyCampaignsController } from './agency-campaigns.controller';
import { AgencyCampaignsService } from './agency-campaigns.service';
import { StorageService } from '../common/storage.service';

@Module({
  imports: [MarketplaceModule, InventoryModule],
  controllers: [PlanningController, PlanningDraftsController, AgencyCampaignsController],
  providers: [
    PlanningService,
    PlanningDraftsService,
    AgencyCampaignsService,
    StorageService,
    BriefExtractionService,
    BriefAdmissionInterceptor,
    OpenAiPlannerProvider,
  ],
  exports: [PlanningService, PlanningDraftsService, OpenAiPlannerProvider],
})
export class PlanningModule {}

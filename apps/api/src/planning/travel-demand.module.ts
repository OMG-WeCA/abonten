import { Module } from '@nestjs/common';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { PlanningModule } from './planning.module';
import { PlanningCampaignController, PlanningStudyController } from './planning-study.controller';
import { PlanningStudyService } from './planning-study.service';
import { MapboxDirectionsProvider } from './mapbox-directions.provider';
import { TravelDemandController } from './travel-demand.controller';
import { TravelDemandService } from './travel-demand.service';
import { PlanningAgentController } from './planning-agent.controller';
import { PlanningAgentService } from './planning-agent.service';
import { PlanningAgentTools } from './planning-agent.tools';
import { PlanningAgentProvider } from './planning-agent.provider';

@Module({
  imports: [MarketplaceModule, PlanningModule],
  controllers: [
    PlanningStudyController,
    PlanningCampaignController,
    TravelDemandController,
    PlanningAgentController,
  ],
  providers: [
    PlanningStudyService,
    MapboxDirectionsProvider,
    TravelDemandService,
    PlanningAgentService,
    PlanningAgentTools,
    PlanningAgentProvider,
  ],
})
export class TravelDemandModule {}

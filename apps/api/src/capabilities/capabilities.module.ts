import { Global, Module } from '@nestjs/common';
import { CapabilitiesGuard } from './capabilities.guard';
import { CapabilityResolverService } from './capability-resolver.service';

@Global()
@Module({
  providers: [CapabilityResolverService, CapabilitiesGuard],
  exports: [CapabilityResolverService, CapabilitiesGuard],
})
export class CapabilitiesModule {}

import { SetMetadata } from '@nestjs/common';
import { Capability } from './capability.enum';

export const REQUIRE_CAPABILITIES_KEY = 'require_capabilities';
export const RequireCapabilities = (...capabilities: Capability[]) =>
  SetMetadata(REQUIRE_CAPABILITIES_KEY, capabilities);

import { SetMetadata } from '@nestjs/common';
import { Capability } from './capability.enum';

export const REQUIRE_CAPABILITIES_KEY = 'require_capabilities';
export const RequireCapabilities = (...capabilities: Capability[]) =>
  SetMetadata(REQUIRE_CAPABILITIES_KEY, capabilities);

export const REQUIRE_ANY_CAPABILITIES_KEY = 'require_any_capabilities';
/** Require AT LEAST ONE of the given capabilities (logical OR), resolved per-org
 * (or globally for global capabilities). Use for endpoints serving multiple roles. */
export const RequireAnyCapabilities = (...capabilities: Capability[]) =>
  SetMetadata(REQUIRE_ANY_CAPABILITIES_KEY, capabilities);
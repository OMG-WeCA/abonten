import { Injectable } from '@nestjs/common';
import type { OrganizationRole } from './organization-roles';
import { Capability } from './capability.enum';
import { PLATFORM_ONLY_CAPABILITIES, ROLE_DEFAULT_CAPABILITIES } from './role-capabilities';

export interface CapabilityOverride {
  capability: string;
  action: 'grant' | 'revoke';
}

@Injectable()
export class CapabilityResolverService {
  // Effective capabilities = role defaults + grants - revokes.
  resolve(role: OrganizationRole, overrides: CapabilityOverride[]): Set<Capability> {
    const caps = new Set<Capability>((ROLE_DEFAULT_CAPABILITIES[role] ?? []) as Capability[]);
    for (const o of overrides) {
      const cap = o.capability as Capability;
      if (o.action === 'grant') caps.add(cap);
      else caps.delete(cap);
    }
    return caps;
  }

  /** Resolve capabilities with org-type scoping: strips platform-only
   * capabilities when the org is not platform. Centralized so guards,
   * services, and controllers all apply the same policy. */
  resolveScoped(role: OrganizationRole, overrides: CapabilityOverride[], orgType: string | undefined): Set<Capability> {
    const caps = this.resolve(role, overrides);
    if (orgType !== 'platform') {
      for (const c of PLATFORM_ONLY_CAPABILITIES) caps.delete(c);
    }
    return caps;
  }
}

import { Injectable } from '@nestjs/common';
import type { OrganizationRole } from './organization-roles';
import { Capability } from './capability.enum';
import { ROLE_DEFAULT_CAPABILITIES } from './role-capabilities';

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
}

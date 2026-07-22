import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../common/database.service';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { Capability } from './capability.enum';
import { CapabilityResolverService } from './capability-resolver.service';
import {
  REQUIRE_ANY_CAPABILITIES_KEY,
  REQUIRE_CAPABILITIES_KEY,
} from './require-capabilities.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { OrganizationEntity } from '../common/entities/organization.entity';

// Capabilities granted to any authenticated user regardless of org context
// (self-service: creating/listing one's orgs, viewing/editing one's profile).
const GLOBAL_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  Capability.ORG_CREATE,
  Capability.ORG_VIEW,
  Capability.ME_VIEW,
  Capability.ME_EDIT,
]);

@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: CapabilityResolverService,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Capability[]>(REQUIRE_CAPABILITIES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const anyRequired = this.reflector.getAllAndOverride<Capability[]>(REQUIRE_ANY_CAPABILITIES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if ((!required || required.length === 0) && (!anyRequired || anyRequired.length === 0)) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.userId) throw new ForbiddenException('Not authenticated');

    const all = required ?? [];
    const any = anyRequired ?? [];

    // Only resolve per-org capabilities when a non-global one is required.
    const perOrgCaps = [...all, ...any].filter((c) => !GLOBAL_CAPABILITIES.has(c));
    let effective = new Set<Capability>();
    if (perOrgCaps.length > 0) {
      const headerOrg = req.headers['x-org-id'] as string | undefined;
      const orgId = headerOrg ?? user.activeOrgId;
      if (!orgId) throw new ForbiddenException('No active organization context');

      const [membership, overrides] = await Promise.all([
        this.db
          .repo(MembershipEntity)
          .then((r) => r.findOne({ where: { userId: user.userId, organizationId: orgId, status: 'active' } }))
          .catch(() => null),
        this.db
          .repo(UserCapabilityOverrideEntity)
          .then((r) => r.find({ where: { userId: user.userId, organizationId: orgId } }))
          .catch(() => []),
      ]);
      if (!membership) throw new ForbiddenException('No membership in this organization');
      const orgRepo = await this.db.repo(OrganizationEntity);
      const org = await orgRepo.findOne({ where: { id: orgId } }).catch(() => null);
      effective = this.resolver.resolveScoped(membership.role as never, overrides, org?.type);
    }

    const held = (c: Capability) => GLOBAL_CAPABILITIES.has(c) || effective.has(c);
    const allOk = all.every((c) => held(c));
    const anyOk = any.length === 0 || any.some((c) => held(c));
    if (!allOk || !anyOk) throw new ForbiddenException('Insufficient capabilities');
    return true;
  }
}
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DatabaseService } from '../common/database.service';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { Capability } from './capability.enum';
import { CapabilityResolverService } from './capability-resolver.service';
import { REQUIRE_CAPABILITIES_KEY } from './require-capabilities.decorator';
import type { AuthenticatedUser } from '../auth/authenticated-user';

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
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.userId) throw new ForbiddenException('Not authenticated');

    const headerOrg = req.headers['x-org-id'] as string | undefined;
    const orgId = headerOrg ?? user.activeOrgId;
    if (!orgId) throw new ForbiddenException('No active organization context');

    // Resolve fresh role + overrides from the DB (do not trust stale JWT role).
    const [memberships, overrides] = await Promise.all([
      this.db
        .repo(MembershipEntity)
        .then((r) => r.findOne({ where: { userId: user.userId, organizationId: orgId, status: 'active' } }))
        .catch(() => null),
      this.db
        .repo(UserCapabilityOverrideEntity)
        .then((r) => r.find({ where: { userId: user.userId, organizationId: orgId } }))
        .catch(() => []),
    ]);

    if (!memberships) throw new ForbiddenException('No membership in this organization');
    const effective = this.resolver.resolve(memberships.role as never, overrides);

    const ok = required.every((c) => effective.has(c));
    if (!ok) throw new ForbiddenException('Insufficient capabilities');
    return true;
  }
}

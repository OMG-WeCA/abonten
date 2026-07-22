import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { UserEntity } from '../auth/entities/user.entity';
import type { CapabilityOverrideDto } from './dto/capability-override.dto';
import { Capability } from '../capabilities/capability.enum';
import { PLATFORM_ONLY_CAPABILITIES } from '../capabilities/role-capabilities';

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly db: DatabaseService,
    private readonly resolver: CapabilityResolverService,
  ) {}

  async getCapabilities(userId: string, orgId: string) {
    const overrides = await this.fetchOverrides(userId, orgId);
    const membership = await this.fetchMembership(userId, orgId);
    const effective = membership
      ? [...this.resolver.resolve(membership.role as never, overrides)]
      : [];
    return { userId, organizationId: orgId, role: membership?.role ?? null, effective, overrides };
  }

  async setOverride(userId: string, orgId: string, dto: CapabilityOverrideDto, actorId: string) {
    // Defense-in-depth: platform-only capabilities can only be granted/revoked by
    // a user who has PLATFORM_ADMIN in this org context (not just USER_MANAGE).
    if (PLATFORM_ONLY_CAPABILITIES.includes(dto.capability)) {
      const m = await this.fetchMembership(actorId, orgId);
      if (!m) throw new ForbiddenException('Actor has no membership in this organization');
      const actorOverrides = await this.fetchOverrides(actorId, orgId);
      const actorCaps = this.resolver.resolve(m.role as never, actorOverrides);
      if (!actorCaps.has(Capability.PLATFORM_ADMIN)) {
        throw new ForbiddenException('Only platform admins can manage platform-only capabilities');
      }
    }
    const repo = await this.db.repo(UserCapabilityOverrideEntity);
    await repo.delete({ userId, organizationId: orgId, capability: dto.capability });
    await repo.save(
      repo.create({
        userId,
        organizationId: orgId,
        capability: dto.capability,
        action: dto.action,
        createdBy: actorId,
      }),
    );
    return this.getCapabilities(userId, orgId);
  }

  async removeOverride(userId: string, orgId: string, capability: string) {
    const repo = await this.db.repo(UserCapabilityOverrideEntity);
    await repo.delete({ userId, organizationId: orgId, capability });
    return this.getCapabilities(userId, orgId);
  }

  async listOrgUsers(orgId: string) {
    const memberships = await this.db.repo(MembershipEntity);
    const users = await this.db.repo(UserEntity);
    const rows = await memberships.find({ where: { organizationId: orgId, status: 'active' } });
    const out: Array<{ userId: string; email: string; name: string; role: string }> = [];
    for (const m of rows) {
      const u = await users.findOne({ where: { id: m.userId } });
      if (u) out.push({ userId: u.id, email: u.email, name: u.name, role: m.role });
    }
    return out;
  }

  async invite(orgId: string, dto: { email: string; name?: string; role: string }, actorId: string) {
    const users = await this.db.repo(UserEntity);
    let user = await users.findOne({ where: { email: dto.email } });
    if (!user) {
      user = await users.save(
        users.create({ email: dto.email, name: dto.name ?? dto.email, status: 'active' }),
      );
    }
    const memberships = await this.db.repo(MembershipEntity);
    const existing = await memberships.findOne({ where: { userId: user.id, organizationId: orgId } });
    if (!existing) {
      await memberships.save(
        memberships.create({
          userId: user.id,
          organizationId: orgId,
          role: dto.role,
          status: 'active',
        }),
      );
    }
    void actorId;
    return { userId: user.id, organizationId: orgId, role: dto.role };
  }

  async updateMembership(orgId: string, userId: string, role: string) {
    const memberships = await this.db.repo(MembershipEntity);
    const m = await memberships.findOne({ where: { userId, organizationId: orgId } });
    if (!m) throw new ForbiddenException('Membership not found');
    m.role = role;
    await memberships.save(m);
    return { userId, organizationId: orgId, role };
  }

  async findOrg(orgId: string): Promise<OrganizationEntity | null> {
    const orgs = await this.db.repo(OrganizationEntity);
    return orgs.findOne({ where: { id: orgId } }).catch(() => null);
  }

  private async fetchOverrides(userId: string, orgId: string) {
    return this.db
      .repo(UserCapabilityOverrideEntity)
      .then((r) => r.find({ where: { userId, organizationId: orgId } }))
      .catch(() => []);
  }

  private async fetchMembership(userId: string, orgId: string) {
    return this.db
      .repo(MembershipEntity)
      .then((r) => r.findOne({ where: { userId, organizationId: orgId } }))
      .catch(() => null);
  }
}

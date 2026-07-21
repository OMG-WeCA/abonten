import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { MagicLinkService } from '../auth/magic-link.service';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { UserEntity } from '../auth/entities/user.entity';
import type { CreateOrgDto, InviteUserDto } from './dto/orgs.dto';

@Injectable()
export class OrgsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly magic: MagicLinkService,
  ) {}

  /** Create an organization; the creator becomes its org_owner. */
  async createOrg(actorUserId: string, dto: CreateOrgDto): Promise<OrganizationEntity> {
    const orgs = await this.db.repo(OrganizationEntity);
    const org = await orgs.save(
      orgs.create({
        name: dto.name,
        type: dto.type,
        country: dto.country,
        defaultCurrency: dto.defaultCurrency ?? 'NGN',
        defaultLocale: dto.defaultLocale ?? 'en',
        status: 'active',
        allowedEmailDomains: dto.allowedEmailDomains,
      }),
    );
    const memberships = await this.db.repo(MembershipEntity);
    await memberships.save(
      memberships.create({ userId: actorUserId, organizationId: org.id, role: 'org_owner', status: 'active' }),
    );
    return org;
  }

  async listMyOrgs(userId: string) {
    const memberships = await this.db.repo(MembershipEntity);
    const rows = await memberships.find({ where: { userId, status: 'active' } });
    const orgs = await this.db.repo(OrganizationEntity);
    const out: Array<{
      organizationId: string;
      role: string;
      name: string;
      type: string;
      country: string;
      defaultCurrency: string;
    }> = [];
    for (const m of rows) {
      const org = await orgs.findOne({ where: { id: m.organizationId } });
      out.push({
        organizationId: m.organizationId,
        role: m.role,
        name: org?.name ?? '',
        type: org?.type ?? '',
        country: org?.country ?? '',
        defaultCurrency: org?.defaultCurrency ?? '',
      });
    }
    return out;
  }

  async listMembers(orgId: string) {
    const memberships = await this.db.repo(MembershipEntity);
    const users = await this.db.repo(UserEntity);
    const rows = await memberships.find({ where: { organizationId: orgId, status: 'active' } });
    const out: Array<{ userId: string; email: string; name: string; role: string; status: string }> = [];
    for (const m of rows) {
      const u = await users.findOne({ where: { id: m.userId } });
      if (u) out.push({ userId: u.id, email: u.email, name: u.name, role: m.role, status: m.status });
    }
    return out;
  }

  /** Invite a user by email: create/find the user, add an active membership, and
   * send a magic-link sign-in email so they can access the org. */
  async invite(orgId: string, dto: InviteUserDto) {
    const users = await this.db.repo(UserEntity);
    let user = await users.findOne({ where: { email: dto.email } });
    if (!user) {
      user = await users.save(
        users.create({ email: dto.email, name: dto.name ?? dto.email.split('@')[0], status: 'active' }),
      );
    }
    const memberships = await this.db.repo(MembershipEntity);
    const existing = await memberships.findOne({ where: { userId: user.id, organizationId: orgId } });
    if (!existing) {
      await memberships.save(
        memberships.create({ userId: user.id, organizationId: orgId, role: dto.role, status: 'active' }),
      );
    } else {
      existing.role = dto.role;
      existing.status = 'active';
      await memberships.save(existing);
    }
    await this.magic.request(dto.email);
    return { userId: user.id, organizationId: orgId, role: dto.role, invited: true };
  }

  async updateMembership(orgId: string, userId: string, role: string) {
    const memberships = await this.db.repo(MembershipEntity);
    const m = await memberships.findOne({ where: { userId, organizationId: orgId } });
    if (!m) throw new NotFoundException('Membership not found');
    m.role = role;
    await memberships.save(m);
    return { userId, organizationId: orgId, role };
  }

  async removeMember(orgId: string, userId: string) {
    const memberships = await this.db.repo(MembershipEntity);
    const m = await memberships.findOne({ where: { userId, organizationId: orgId } });
    if (!m) throw new NotFoundException('Membership not found');
    m.status = 'revoked';
    await memberships.save(m);
    return { userId, organizationId: orgId, status: 'revoked' };
  }
}
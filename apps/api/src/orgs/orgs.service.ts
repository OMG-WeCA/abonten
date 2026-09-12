import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { EmailCodeService } from '../auth/email-code.service';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { UserEntity } from '../auth/entities/user.entity';
import type { CreateOrgDto, InviteUserDto } from './dto/orgs.dto';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { Capability } from '../capabilities/capability.enum';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { normalizeEmailIdentity } from '../auth/email-identity';
import { UserIdentityService } from '../auth/user-identity.service';

export interface InvitationResult {
  userId: string;
  organizationId: string;
  role: string;
  membership: {
    status: 'active';
    change: 'created' | 'unchanged';
  };
  delivery:
    | { status: 'sent' }
    | {
        status: 'failed';
        reason: 'rate_limited' | 'temporarily_unavailable';
        retryable: true;
        retryPath: string;
      };
}

@Injectable()
export class OrgsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly emailCode: EmailCodeService,
    private readonly identities: UserIdentityService,
    private readonly resolver: CapabilityResolverService,
  ) {}

  /** Only a platform admin (PLATFORM_ADMIN) can assign the platform_admin role,
   * and only within a platform-type organization. */
  private async assertCanAssignPlatformRole(actorId: string, orgId: string): Promise<void> {
    // The platform_admin role is only valid in a platform-type organization.
    const orgs = await this.db.repo(OrganizationEntity);
    const org = await orgs.findOne({ where: { id: orgId } }).catch(() => null);
    if (!org || org.type !== 'platform') {
      throw new ForbiddenException(
        'platform_admin role can only be assigned in a platform-type organization',
      );
    }
    const memberships = await this.db.repo(MembershipEntity);
    const m = await memberships
      .findOne({ where: { userId: actorId, organizationId: orgId, status: 'active' } })
      .catch(() => null);
    if (!m) throw new ForbiddenException('Actor has no membership in this organization');
    const overrides = await this.db
      .repo(UserCapabilityOverrideEntity)
      .then((r) => r.find({ where: { userId: actorId, organizationId: orgId } }))
      .catch(() => []);
    const caps = this.resolver.resolve(m.role as never, overrides);
    if (!caps.has(Capability.PLATFORM_ADMIN)) {
      throw new ForbiddenException('Only platform admins can assign the platform_admin role');
    }
  }

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
      memberships.create({
        userId: actorUserId,
        organizationId: org.id,
        role: 'org_owner',
        status: 'active',
      }),
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
    const out: Array<{
      userId: string;
      email: string;
      name: string;
      role: string;
      status: string;
    }> = [];
    for (const m of rows) {
      const u = await users.findOne({ where: { id: m.userId } });
      if (u)
        out.push({ userId: u.id, email: u.email, name: u.name, role: m.role, status: m.status });
    }
    return out;
  }

  /** Persist an invitation membership, then attempt code delivery.
   * Repeating the same request is the safe delivery retry: it never changes an
   * existing role or reactivates a revoked membership. */
  async invite(orgId: string, dto: InviteUserDto, actorId: string): Promise<InvitationResult> {
    if (dto.role === 'platform_admin') {
      await this.assertCanAssignPlatformRole(actorId, orgId);
    }

    const email = normalizeEmailIdentity(dto.email);
    const user = await this.identities.findOrCreateByEmail(email, {
      name: dto.name ?? email.split('@')[0],
    });
    const memberships = await this.db.repo(MembershipEntity);
    let membership = await memberships.findOne({
      where: { userId: user.id, organizationId: orgId },
    });
    let membershipChange: 'created' | 'unchanged' = 'unchanged';

    if (!membership) {
      try {
        membership = await memberships.save(
          memberships.create({
            userId: user.id,
            organizationId: orgId,
            role: dto.role,
            status: 'active',
          }),
        );
        membershipChange = 'created';
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        membership = await memberships.findOne({
          where: { userId: user.id, organizationId: orgId },
        });
        if (!membership) throw error;
      }
    }

    this.assertInvitationMatchesMembership(membership, dto.role, orgId);

    const baseResult = {
      userId: user.id,
      organizationId: orgId,
      role: membership.role,
      membership: { status: 'active' as const, change: membershipChange },
    };

    try {
      await this.emailCode.request(email);
      return { ...baseResult, delivery: { status: 'sent' } };
    } catch (error) {
      return {
        ...baseResult,
        delivery: {
          status: 'failed',
          reason:
            error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
              ? 'rate_limited'
              : 'temporarily_unavailable',
          retryable: true,
          retryPath: `/api/orgs/${orgId}/invite`,
        },
      };
    }
  }

  private assertInvitationMatchesMembership(
    membership: MembershipEntity,
    requestedRole: string,
    orgId: string,
  ): asserts membership is MembershipEntity & { status: 'active' } {
    if (membership.status !== 'active') {
      throw new ConflictException({
        code: 'MEMBERSHIP_REVOKED',
        message:
          'This membership is not active and cannot be restored by an invitation retry. Use explicit membership administration before retrying delivery.',
        userId: membership.userId,
        organizationId: orgId,
        currentStatus: membership.status,
      });
    }
    if (membership.role !== requestedRole) {
      throw new ConflictException({
        code: 'MEMBERSHIP_ROLE_CONFLICT',
        message:
          'This user already has a different role. Change the role explicitly through the membership endpoint, then retry the invitation with that role.',
        userId: membership.userId,
        organizationId: orgId,
        currentRole: membership.role,
        requestedRole,
      });
    }
  }

  async updateMembership(orgId: string, userId: string, role: string, actorId: string) {
    if (role === 'platform_admin') {
      await this.assertCanAssignPlatformRole(actorId, orgId);
    }
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

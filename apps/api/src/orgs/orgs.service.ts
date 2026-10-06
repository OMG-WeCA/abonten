import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { findMarket } from '../common/supported-markets';
import { DatabaseService } from '../common/database.service';
import { EmailCodeService } from '../auth/email-code.service';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { UserEntity } from '../auth/entities/user.entity';
import {
  SELF_SERVICE_ORGANIZATION_TYPES,
  type CreateOrgDto,
  type InviteUserDto,
  type UpdateOrganizationSettingsDto,
} from './dto/orgs.dto';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { Capability } from '../capabilities/capability.enum';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { normalizeEmailIdentity } from '../auth/email-identity';
import { UserIdentityService } from '../auth/user-identity.service';
import type { OrganizationRole } from '../capabilities/organization-roles';
import type { EntityManager, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { preparePartnerTermsAcceptance } from './terms/partner-terms.catalog';
import { persistPartnerTermsAcceptance } from './partner-terms.service';
import { OrganizationCreationRequestEntity } from './entities/organization-creation-request.entity';

const ASSIGNABLE_ROLES_BY_ORG_TYPE: Record<string, readonly OrganizationRole[]> = {
  media_partner: ['org_owner', 'org_admin', 'inventory_manager', 'field_operator'],
  agency: ['org_owner', 'org_admin', 'planner', 'planner_admin'],
  brand: ['org_owner', 'org_admin', 'client_viewer', 'client_admin'],
  platform: ['org_owner', 'org_admin', 'platform_admin'],
};

const MANAGEABLE_ROLES_BY_ACTOR: Record<OrganizationRole, readonly OrganizationRole[]> = {
  org_owner: [
    'org_owner',
    'org_admin',
    'inventory_manager',
    'field_operator',
    'planner',
    'planner_admin',
    'client_viewer',
    'client_admin',
    'platform_admin',
  ],
  org_admin: [
    'org_admin',
    'inventory_manager',
    'field_operator',
    'planner',
    'planner_admin',
    'client_viewer',
    'client_admin',
  ],
  inventory_manager: ['inventory_manager', 'field_operator'],
  field_operator: ['field_operator'],
  planner: ['planner'],
  planner_admin: ['planner', 'planner_admin'],
  client_viewer: ['client_viewer'],
  client_admin: ['client_viewer', 'client_admin'],
  platform_admin: ['org_admin', 'platform_admin'],
};

interface MembershipActorPolicy {
  actor: MembershipEntity;
  organization: OrganizationEntity;
  capabilities: Set<Capability>;
}

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

  private repository<T extends ObjectLiteral>(
    target: EntityTarget<T>,
    manager?: EntityManager,
  ): Promise<Repository<T>> {
    return manager ? Promise.resolve(manager.getRepository(target)) : this.db.repo(target);
  }

  private async membershipActorPolicy(
    actorId: string,
    orgId: string,
    manager?: EntityManager,
  ): Promise<MembershipActorPolicy> {
    const memberships = await this.repository(MembershipEntity, manager);
    const orgs = await this.repository(OrganizationEntity, manager);
    // Every membership mutation transaction takes the same organization-row lock.
    // This serializes owner counts and owner role/status changes for one tenant.
    const organization = await orgs.findOne({
      where: { id: orgId, status: 'active' },
      lock: manager ? { mode: 'pessimistic_write' } : undefined,
    });
    const actor = await memberships.findOne({
      where: { userId: actorId, organizationId: orgId, status: 'active' },
    });
    if (!actor || !organization) {
      throw new ForbiddenException('Actor has no active membership in this organization');
    }

    const overrides = await this.repository(UserCapabilityOverrideEntity, manager)
      .then((repo) => repo.find({ where: { userId: actorId, organizationId: orgId } }))
      .catch(() => []);
    const capabilities = this.resolver.resolveScoped(
      actor.role as OrganizationRole,
      overrides,
      organization.type,
    );
    if (!capabilities.has(Capability.MEMBERSHIP_MANAGE)) {
      throw new ForbiddenException('Actor cannot manage organization memberships');
    }
    return { actor, organization, capabilities };
  }

  private assertRoleAssignment(policy: MembershipActorPolicy, role: string): void {
    const nextRole = role as OrganizationRole;
    const organizationRoles = ASSIGNABLE_ROLES_BY_ORG_TYPE[policy.organization.type] ?? [];
    if (!organizationRoles.includes(nextRole)) {
      throw new BadRequestException('Role is not valid for this organization type');
    }

    const manageable = MANAGEABLE_ROLES_BY_ACTOR[policy.actor.role as OrganizationRole] ?? [];
    if (!manageable.includes(nextRole)) {
      throw new ForbiddenException('Actor cannot assign this role');
    }
    if (nextRole === 'platform_admin' && !policy.capabilities.has(Capability.PLATFORM_ADMIN)) {
      throw new ForbiddenException('Only platform admins can assign the platform_admin role');
    }
  }

  private assertCanManageTarget(policy: MembershipActorPolicy, target: MembershipEntity): void {
    const manageable = MANAGEABLE_ROLES_BY_ACTOR[policy.actor.role as OrganizationRole] ?? [];
    const targetRole = target.role as OrganizationRole;
    if (!manageable.includes(targetRole)) {
      throw new ForbiddenException('Actor cannot change this membership');
    }
    if (targetRole === 'platform_admin' && !policy.capabilities.has(Capability.PLATFORM_ADMIN)) {
      throw new ForbiddenException('Only platform admins can change a platform admin');
    }
  }

  /** Create an organization; the creator becomes its org_owner. */
  async createOrg(actorUserId: string, dto: CreateOrgDto): Promise<OrganizationEntity> {
    // DTO validation covers HTTP input; these guards protect programmatic callers too.
    if (!(SELF_SERVICE_ORGANIZATION_TYPES as readonly string[]).includes(dto.type)) {
      throw new BadRequestException(
        'Platform organizations cannot be created through self-service onboarding',
      );
    }
    const name = dto.name.trim();
    const country = findMarket(dto.country)?.name ?? dto.country.trim();
    if (!name) throw new BadRequestException('Organization name is required');
    if (country.length < 2) throw new BadRequestException('Country is required');

    if (dto.type !== 'media_partner' && dto.partnerTerms)
      throw new BadRequestException('Partner terms apply only to media partners');

    return this.db.transaction(async (manager) => {
      const orgs = await this.repository(OrganizationEntity, manager);
      if (dto.onboardingKey) {
        const users = await this.repository(UserEntity, manager);
        const actor = await users.findOne({
          where: { id: actorUserId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!actor) throw new NotFoundException('User not found');

        const requests = await this.repository(OrganizationCreationRequestEntity, manager);
        const existingRequest = await requests.findOne({
          where: { userId: actorUserId, idempotencyKey: dto.onboardingKey },
        });
        if (existingRequest) {
          const existingOrganization = await orgs.findOne({
            where: { id: existingRequest.organizationId },
          });
          const existingMembership = await this.repository(MembershipEntity, manager).then((repo) =>
            repo.findOne({
              where: {
                userId: actorUserId,
                organizationId: existingRequest.organizationId,
                status: 'active',
              },
            }),
          );
          if (existingOrganization && existingMembership) return existingOrganization;
          throw new ConflictException('Onboarding organization is no longer available');
        }
      }

      const terms =
        dto.type === 'media_partner'
          ? preparePartnerTermsAcceptance(dto.partnerTerms, dto.defaultLocale ?? 'en')
          : undefined;
      const org = await orgs.save(
        orgs.create({
          name,
          type: dto.type,
          country,
          defaultCurrency: dto.defaultCurrency ?? findMarket(country)?.currency ?? 'NGN',
          defaultLocale: dto.defaultLocale ?? 'en',
          status: 'active',
          allowedEmailDomains: dto.allowedEmailDomains,
        }),
      );
      const memberships = await this.repository(MembershipEntity, manager);
      await memberships.save(
        memberships.create({
          userId: actorUserId,
          organizationId: org.id,
          role: 'org_owner',
          status: 'active',
        }),
      );
      await this.recordAudit(
        actorUserId,
        org.id,
        'organization.created',
        'organization',
        org.id,
        null,
        {
          name: org.name,
          type: org.type,
          country: org.country,
          defaultCurrency: org.defaultCurrency,
        },
        manager,
      );
      if (terms) await persistPartnerTermsAcceptance(manager, actorUserId, org, terms);
      if (dto.onboardingKey) {
        const requests = await this.repository(OrganizationCreationRequestEntity, manager);
        await requests.save(
          requests.create({
            userId: actorUserId,
            idempotencyKey: dto.onboardingKey,
            organizationId: org.id,
          }),
        );
      }
      return org;
    });
  }

  /** Updates current organization defaults only; historical quote/invoice values are never changed. */
  async updateSettings(
    orgId: string,
    dto: UpdateOrganizationSettingsDto,
    actorUserId: string,
  ): Promise<OrganizationEntity> {
    const name = dto.name?.trim();
    const country =
      dto.country === undefined ? undefined : (findMarket(dto.country)?.name ?? dto.country.trim());
    if (dto.name !== undefined && !name) {
      throw new BadRequestException('Organization name is required');
    }
    if (dto.country !== undefined && (!country || country.length < 2)) {
      throw new BadRequestException('Country is required');
    }

    const orgs = await this.db.repo(OrganizationEntity);
    const org = await orgs.findOne({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organization not found');
    const before = {
      name: org.name,
      country: org.country,
      defaultCurrency: org.defaultCurrency,
      defaultLocale: org.defaultLocale,
    };
    if (name !== undefined) org.name = name;
    if (country !== undefined) org.country = country;
    if (dto.defaultCurrency !== undefined) org.defaultCurrency = dto.defaultCurrency;
    if (dto.defaultLocale !== undefined) org.defaultLocale = dto.defaultLocale;
    const saved = await orgs.save(org);
    await this.recordAudit(
      actorUserId,
      orgId,
      'organization.settings.updated',
      'organization',
      orgId,
      before,
      {
        name: saved.name,
        country: saved.country,
        defaultCurrency: saved.defaultCurrency,
        defaultLocale: saved.defaultLocale,
      },
    );
    return saved;
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
    const email = normalizeEmailIdentity(dto.email);
    const user = await this.identities.findOrCreateByEmail(email, {
      name: dto.name?.trim() || email.split('@')[0],
    });
    let access: {
      membership: MembershipEntity;
      membershipChange: 'created' | 'unchanged';
    };

    try {
      access = await this.db.transaction(async (manager) => {
        const actorPolicy = await this.membershipActorPolicy(actorId, orgId, manager);
        const memberships = await this.repository(MembershipEntity, manager);
        const existing = await memberships.findOne({
          where: { userId: user.id, organizationId: orgId },
        });
        if (existing) {
          this.assertInvitationMatchesMembership(existing, dto.role, orgId);
          return { membership: existing, membershipChange: 'unchanged' as const };
        }

        this.assertRoleAssignment(actorPolicy, dto.role);
        const membership = await memberships.save(
          memberships.create({
            userId: user.id,
            organizationId: orgId,
            role: dto.role,
            status: 'active',
          }),
        );
        await this.recordAudit(
          actorId,
          orgId,
          'organization.membership.created',
          'membership',
          membership.id,
          null,
          { userId: user.id, role: membership.role, status: membership.status },
          manager,
        );
        return { membership, membershipChange: 'created' as const };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const memberships = await this.db.repo(MembershipEntity);
      const existing = await memberships.findOne({
        where: { userId: user.id, organizationId: orgId },
      });
      if (!existing) throw error;
      this.assertInvitationMatchesMembership(existing, dto.role, orgId);
      access = { membership: existing, membershipChange: 'unchanged' };
    }

    const baseResult = {
      userId: user.id,
      organizationId: orgId,
      role: access.membership.role,
      membership: { status: 'active' as const, change: access.membershipChange },
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
    return this.db.transaction(async (manager) => {
      const policy = await this.membershipActorPolicy(actorId, orgId, manager);
      const memberships = await this.repository(MembershipEntity, manager);
      const membership = await memberships.findOne({
        where: { userId, organizationId: orgId, status: 'active' },
      });
      if (!membership) throw new NotFoundException('Active membership not found');
      this.assertCanManageTarget(policy, membership);
      this.assertRoleAssignment(policy, role);
      if (membership.role === role) {
        return { userId, organizationId: orgId, role };
      }
      if (actorId === userId && policy.actor.role !== 'org_owner') {
        throw new ForbiddenException('Non-owner administrators cannot change their own role');
      }
      if (membership.role === 'org_owner') {
        const ownerCount = await memberships.count({
          where: { organizationId: orgId, role: 'org_owner', status: 'active' },
        });
        if (ownerCount <= 1) {
          throw new ForbiddenException('The organization must keep at least one active owner');
        }
      }

      const previousRole = membership.role;
      membership.role = role;
      await memberships.save(membership);
      await this.recordAudit(
        actorId,
        orgId,
        'organization.membership.role_updated',
        'membership',
        membership.id,
        { role: previousRole },
        { role },
        manager,
      );
      return { userId, organizationId: orgId, role };
    });
  }

  async removeMember(orgId: string, userId: string, actorId: string) {
    return this.db.transaction(async (manager) => {
      const policy = await this.membershipActorPolicy(actorId, orgId, manager);
      const memberships = await this.repository(MembershipEntity, manager);
      const membership = await memberships.findOne({
        where: { userId, organizationId: orgId, status: 'active' },
      });
      if (!membership) throw new NotFoundException('Active membership not found');
      this.assertCanManageTarget(policy, membership);

      if (membership.role === 'org_owner') {
        const ownerCount = await memberships.count({
          where: { organizationId: orgId, role: 'org_owner', status: 'active' },
        });
        if (ownerCount <= 1) {
          throw new ForbiddenException('The organization must keep at least one active owner');
        }
      }

      membership.status = 'revoked';
      await memberships.save(membership);
      await this.recordAudit(
        actorId,
        orgId,
        'organization.membership.revoked',
        'membership',
        membership.id,
        { status: 'active', role: membership.role },
        { status: 'revoked', role: membership.role },
        manager,
      );
      return { userId, organizationId: orgId, status: 'revoked' };
    });
  }

  private async recordAudit(
    actorUserId: string,
    actorOrgId: string,
    action: string,
    entityType: string,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<void> {
    const audit = await this.repository(AuditLogEntity, manager);
    await audit.save(
      audit.create({ actorUserId, actorOrgId, action, entityType, entityId, before, after }),
    );
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

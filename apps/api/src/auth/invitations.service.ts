import { invitationEmail } from './invitation-email';
import { ASSIGNABLE_ROLES_BY_ORG_TYPE } from '../capabilities/organization-roles';
import { createHash } from 'node:crypto';
import { ILike } from 'typeorm';
import { findMarket } from '../common/supported-markets';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EntityManager } from 'typeorm';
import { DatabaseService } from '../common/database.service';
import { MailService } from '../common/mail.service';
import { InvitationEntity } from './entities/invitation.entity';
import { UserEntity } from './entities/user.entity';
import { MembershipEntity } from './entities/membership.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { normalizeEmailIdentity } from './email-identity';
import { preparePartnerTermsAcceptance } from '../orgs/terms/partner-terms.catalog';
import { persistPartnerTermsAcceptance } from '../orgs/partner-terms.service';
import {
  ACCOUNT_TYPES,
  type CreateInvitationDto,
  type AcceptInvitationDto,
  type MemberInvitationDto,
} from './invitations.dto';
export const INVITATION_ROLES: Readonly<Record<string, readonly string[]>> =
  ASSIGNABLE_ROLES_BY_ORG_TYPE;
export function invitationState(
  invite: Pick<InvitationEntity, 'status' | 'expiresAt'>,
  now = Date.now(),
): string {
  return invite.status === 'pending' && new Date(invite.expiresAt).getTime() <= now
    ? 'expired'
    : invite.status;
}
export function invitationSignInUrl(baseUrl: string, basePath?: string): string {
  const url = new URL(baseUrl);
  const normalize = (value?: string) => {
    const p = value?.trim().replace(/^\/+|\/+$/g, '');
    return p ? '/' + p : '';
  };
  url.pathname = (normalize(basePath) || normalize(url.pathname)) + '/sign-in';
  url.search = '';
  url.hash = '';
  return url.toString();
}
@Injectable()
export class InvitationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly mail: MailService,
    private readonly cfg: ConfigService,
  ) {}
  private async audit(
    m: EntityManager,
    userId: string,
    orgId: string,
    action: string,
    id: string,
    after: Record<string, unknown>,
  ) {
    const r = m.getRepository(AuditLogEntity);
    await r.save(
      r.create({
        actorUserId: userId,
        actorOrgId: orgId,
        action,
        entityType: 'invitation',
        entityId: id,
        after,
      }),
    );
  }
  private async assertPlatform(m: EntityManager, userId: string, orgId: string) {
    const rows = await m.query(
      `SELECT 1 FROM memberships m JOIN organizations o ON o.id::text=m.organization_id WHERE m.user_id=$1 AND m.organization_id=$2 AND m.role='platform_admin' AND m.status='active' AND o.type='platform' AND o.status='active'`,
      [userId, orgId],
    );
    if (!rows.length) throw new ForbiddenException('Platform administrator access is required');
  }
  private async lockOrganization(m: EntityManager, id: string) {
    const org = await m
      .getRepository(OrganizationEntity)
      .findOne({ where: { id, status: 'active' }, lock: { mode: 'pessimistic_write' } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }
  private validRole(org: OrganizationEntity, role: string) {
    if (!INVITATION_ROLES[org.type]?.includes(role))
      throw new BadRequestException('Role is not valid for this organization');
  }
  /** Caller holds the target organization lock and has checked tenant role-assignment policy. */
  async persist(
    m: EntityManager,
    actorId: string,
    actorOrgId: string,
    org: OrganizationEntity,
    dto: Pick<MemberInvitationDto, 'email' | 'name' | 'role' | 'locale' | 'expiresInDays'>,
    reuse = false,
  ) {
    this.validRole(org, dto.role);
    const email = normalizeEmailIdentity(dto.email),
      days = dto.expiresInDays ?? 7;
    if (!Number.isInteger(days) || days < 1 || days > 30)
      throw new BadRequestException('Expiry must be between 1 and 30 days');
    const user = await m.getRepository(UserEntity).findOne({ where: { email } });
    if (user) {
      const member = await m
        .getRepository(MembershipEntity)
        .findOne({ where: { userId: user.id, organizationId: org.id } });
      if (member)
        throw new ConflictException(
          'This person already has a membership. Use member administration to change or restore access.',
        );
    }
    const repo = m.getRepository(InvitationEntity);
    const pending = await repo.findOne({
      where: { email, organizationId: org.id, status: 'pending' },
    });
    if (pending) {
      if (!reuse || pending.role !== dto.role)
        throw new ConflictException(
          'A pending or expired invitation already exists. Resend or revoke it first.',
        );
      pending.revision += 1;
      pending.expiresAt = new Date(
        new Date((await m.query('SELECT clock_timestamp() AS now'))[0].now).getTime() +
          7 * 86400000,
      );
      pending.delivery = 'not_sent';
      const renewed = await repo.save(pending);
      await this.audit(m, actorId, actorOrgId, 'invitation.resent', renewed.id, {
        organizationId: org.id,
        revision: renewed.revision,
      });
      return renewed;
    }
    const owners = await m
      .getRepository(MembershipEntity)
      .count({ where: { organizationId: org.id, role: 'org_owner', status: 'active' } });
    const clock = (await m.query('SELECT clock_timestamp() AS now'))[0].now as Date;
    const row = await repo.save(
      repo.create({
        kind: 'membership',
        accountType: null,
        email,
        name: dto.name?.trim() ?? '',
        organizationId: org.id,
        role: dto.role,
        locale: dto.locale ?? 'en',
        initialOwner: org.type === 'media_partner' && dto.role === 'org_owner' && owners === 0,
        createdByUserId: actorId,
        createdByOrgId: actorOrgId,
        status: 'pending',
        expiresAt: new Date(new Date(clock).getTime() + days * 86400000),
        delivery: 'not_sent',
        revision: 1,
      }),
    );
    await this.audit(m, actorId, actorOrgId, 'invitation.created', row.id, {
      organizationId: org.id,
      email,
      role: row.role,
      expiresAt: row.expiresAt,
    });
    return row;
  }
  async create(userId: string, actorOrgId: string, dto: CreateInvitationDto) {
    if (!ACCOUNT_TYPES.includes(dto.accountType))
      throw new BadRequestException('Choose a supported product account type');
    const email = normalizeEmailIdentity(dto.email),
      fingerprint = createHash('sha256')
        .update(JSON.stringify([email, dto.accountType]))
        .digest('hex');
    let result: { row: InvitationEntity; replay: boolean };
    try {
      result = await this.db.transaction(async (m) => {
        await this.assertPlatform(m, userId, actorOrgId);
        await m
          .getRepository(UserEntity)
          .findOneOrFail({ where: { id: userId }, lock: { mode: 'pessimistic_write' } });
        const repo = m.getRepository(InvitationEntity);
        if (dto.clientRequestId) {
          const prior = await repo.findOne({
            where: { createdByUserId: userId, clientRequestId: dto.clientRequestId },
          });
          if (prior) {
            if (prior.requestFingerprint !== fingerprint)
              throw new ConflictException(
                'This invitation request has different details. Review the existing invitation first.',
              );
            return { row: prior, replay: true };
          }
        }
        if (await repo.findOne({ where: { kind: 'account', email, status: 'pending' } }))
          throw new ConflictException(
            'A pending or expired account invitation already exists. Resend or revoke it first.',
          );
        const clock = new Date((await m.query('SELECT clock_timestamp() AS now'))[0].now);
        const row = await repo.save(
          repo.create({
            kind: 'account',
            accountType: dto.accountType,
            email,
            name: '',
            organizationId: null,
            role: 'org_owner',
            locale: dto.locale ?? 'en',
            initialOwner: dto.accountType === 'media_partner',
            createdByUserId: userId,
            createdByOrgId: actorOrgId,
            status: 'pending',
            expiresAt: new Date(clock.getTime() + 7 * 86400000),
            delivery: 'not_sent',
            revision: 1,
            clientRequestId: dto.clientRequestId ?? null,
            requestFingerprint: dto.clientRequestId ? fingerprint : null,
          }),
        );
        await this.audit(m, userId, actorOrgId, 'invitation.created', row.id, {
          email,
          accountType: row.accountType,
          expiresAt: row.expiresAt,
        });
        return { row, replay: false };
      });
    } catch (e) {
      if ((e as { code?: string })?.code === '23505')
        throw new ConflictException(
          'A pending account invitation already exists. Resend or revoke it first.',
        );
      throw e;
    }
    return result.replay ? this.present(result.row) : this.deliver(result.row);
  }
  async createMember(userId: string, actorOrgId: string, dto: MemberInvitationDto) {
    const row = await this.db.transaction(async (m) => {
      await this.assertPlatform(m, userId, actorOrgId);
      const org = await this.lockOrganization(m, dto.organizationId);
      return this.persist(m, userId, actorOrgId, org, dto);
    });
    return this.deliver(row);
  }
  private async present(invite: InvitationEntity, m?: EntityManager) {
    const org = invite.organizationId
      ? await (
          m ? m.getRepository(OrganizationEntity) : await this.db.repo(OrganizationEntity)
        ).findOne({ where: { id: invite.organizationId } })
      : null;
    const { clientRequestId: _request, requestFingerprint: _fingerprint, ...publicInvite } = invite;
    return {
      ...publicInvite,
      status: invitationState(invite),
      organizationName: org?.name ?? '',
      organizationType: org?.type ?? invite.accountType ?? '',
      country: org?.country ?? '',
      defaultCurrency: org?.defaultCurrency ?? '',
      defaultLocale: org?.defaultLocale ?? 'en',
    };
  }
  async deliver(row: InvitationEntity) {
    const org = row.organizationId
      ? await (await this.db.repo(OrganizationEntity)).findOneByOrFail({ id: row.organizationId })
      : null;
    const signIn = invitationSignInUrl(
      this.cfg.get<string>('web.baseUrl') ?? 'http://localhost:3001',
      this.cfg.get<string>('web.basePath'),
    );
    let delivery = 'sent';
    try {
      const message = invitationEmail(row, org?.name ?? null, signIn);
      await this.mail.send(row.email, message.subject, message.html, message.text);
    } catch {
      delivery = 'failed';
    }
    const repo = await this.db.repo(InvitationEntity);
    await repo
      .createQueryBuilder()
      .update()
      .set({ delivery, sentAt: delivery === 'sent' ? new Date() : null })
      .where('id=:id AND revision=:revision AND status=:status', {
        id: row.id,
        revision: row.revision,
        status: 'pending',
      })
      .execute();
    return this.present(await repo.findOneByOrFail({ id: row.id }));
  }
  async listAdmin(userId: string, orgId: string, page = 1, limit = 50) {
    return this.db.transaction(async (m) => {
      await this.assertPlatform(m, userId, orgId);
      const [rows, total] = await m.getRepository(InvitationEntity).findAndCount({
        order: { createdAt: 'DESC' },
        take: Math.min(100, limit),
        skip: (page - 1) * limit,
      });
      return { items: await Promise.all(rows.map((r) => this.present(r, m))), total, page, limit };
    });
  }
  async organizations(userId: string, orgId: string, page = 1, limit = 100, search = '') {
    return this.db.transaction(async (m) => {
      await this.assertPlatform(m, userId, orgId);
      const bounded = Math.min(100, Math.max(1, limit));
      const [items, total] = await m.getRepository(OrganizationEntity).findAndCount({
        where: {
          status: 'active',
          ...(search.trim() ? { name: ILike('%' + search.trim() + '%') } : {}),
        },
        select: {
          id: true,
          name: true,
          type: true,
          country: true,
          defaultCurrency: true,
          defaultLocale: true,
        },
        order: { name: 'ASC', id: 'ASC' },
        take: bounded,
        skip: (Math.max(1, page) - 1) * bounded,
      });
      return { items, total, page, limit: bounded };
    });
  }
  async getMine(userId: string, id: string) {
    const user = await (await this.db.repo(UserEntity)).findOneByOrFail({ id: userId });
    const row = await (
      await this.db.repo(InvitationEntity)
    ).findOne({ where: { id, email: normalizeEmailIdentity(user.email) } });
    if (!row) throw new NotFoundException('Invitation not found');
    return this.present(row);
  }
  async listMine(userId: string) {
    const user = await (await this.db.repo(UserEntity)).findOneByOrFail({ id: userId });
    const rows = await (
      await this.db.repo(InvitationEntity)
    ).find({
      where: { email: normalizeEmailIdentity(user.email), status: 'pending' },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return { items: await Promise.all(rows.map((r) => this.present(r))) };
  }
  async change(userId: string, actorOrgId: string, id: string, action: 'resend' | 'revoke') {
    const row = await this.db.transaction(async (m) => {
      await this.assertPlatform(m, userId, actorOrgId);
      const initial = await m.getRepository(InvitationEntity).findOne({ where: { id } });
      if (!initial) throw new NotFoundException('Invitation not found');
      const org =
        initial.kind === 'membership'
          ? await this.lockOrganization(m, initial.organizationId!)
          : null;
      const repo = m.getRepository(InvitationEntity),
        row = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!row) throw new NotFoundException('Invitation not found');
      if (row.status !== 'pending')
        throw new ConflictException('Only pending or expired invitations can be resent or revoked');
      if (org) this.validRole(org, row.role);
      const now = new Date((await m.query('SELECT clock_timestamp() AS now'))[0].now);
      row.revision += 1;
      if (action === 'revoke') {
        row.status = 'revoked';
        row.revokedAt = now;
      } else {
        row.expiresAt = new Date(now.getTime() + 7 * 86400000);
        row.delivery = 'not_sent';
      }
      const saved = await repo.save(row);
      await this.audit(
        m,
        userId,
        actorOrgId,
        'invitation.' + (action === 'revoke' ? 'revoked' : 'resent'),
        row.id,
        { organizationId: row.organizationId, revision: row.revision, expiresAt: row.expiresAt },
      );
      return saved;
    });
    return action === 'resend' ? this.deliver(row) : this.present(row);
  }
  async accept(userId: string, id: string, dto: AcceptInvitationDto) {
    return this.db.transaction(async (m) => {
      const user = await m
        .getRepository(UserEntity)
        .findOne({ where: { id: userId, status: 'active' } });
      if (!user) throw new ForbiddenException('Account is not active');
      const repo = m.getRepository(InvitationEntity),
        initial = await repo.findOne({ where: { id, email: normalizeEmailIdentity(user.email) } });
      if (!initial) throw new NotFoundException('Invitation not found');
      const org =
        initial.kind === 'membership'
          ? await this.lockOrganization(m, initial.organizationId!)
          : null;
      const row = await repo.findOne({
        where: { id, email: normalizeEmailIdentity(user.email) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Invitation not found');
      const now = new Date((await m.query('SELECT clock_timestamp() AS now'))[0].now);
      if (invitationState(row, now.getTime()) !== 'pending')
        throw new ConflictException('This invitation is expired, revoked or already accepted');
      let destination = org;
      if (row.kind === 'account') {
        if (
          !ACCOUNT_TYPES.includes(row.accountType as (typeof ACCOUNT_TYPES)[number]) ||
          row.role !== 'org_owner'
        )
          throw new BadRequestException('Invitation account type is invalid');
        if (
          typeof dto.profile?.name !== 'string' ||
          !dto.profile.name.trim() ||
          !dto.organization?.name?.trim() ||
          !dto.organization.country?.trim()
        )
          throw new BadRequestException(
            'Complete your name and organization details to accept this account invitation',
          );
        const country =
          findMarket(dto.organization.country)?.name ?? dto.organization.country.trim();
        const organizations = m.getRepository(OrganizationEntity);
        destination = await organizations.save(
          organizations.create({
            name: dto.organization.name.trim(),
            type: row.accountType!,
            country,
            defaultCurrency:
              dto.organization.defaultCurrency ?? findMarket(country)?.currency ?? 'NGN',
            defaultLocale: dto.organization.defaultLocale ?? dto.locale ?? 'en',
            status: 'active',
          }),
        );
        const audits = m.getRepository(AuditLogEntity);
        await audits.save(
          audits.create({
            actorUserId: userId,
            actorOrgId: destination.id,
            action: 'organization.created',
            entityType: 'organization',
            entityId: destination.id,
            after: { name: destination.name, type: destination.type, admission: 'invitation' },
          }),
        );
        row.organizationId = destination.id;
        row.name = dto.profile.name.trim();
        const before = {
          name: user.name,
          phone: user.phone ?? null,
          locale: user.locale,
          timezone: user.timezone,
        };
        const after = {
          name: row.name,
          phone:
            dto.profile.phone !== undefined
              ? dto.profile.phone.trim() || null
              : (user.phone ?? null),
          locale: dto.locale ?? dto.profile.locale ?? user.locale,
          timezone: dto.profile.timezone ?? user.timezone,
        };
        // Never save a stale full user: session revocation, identity and account status
        // can change concurrently and must not be overwritten by onboarding.
        await m.getRepository(UserEntity).update(
          { id: userId },
          {
            name: after.name,
            phone: after.phone ?? (() => 'NULL'),
            locale: after.locale,
            timezone: after.timezone,
          },
        );
        await audits.save(
          audits.create({
            actorUserId: userId,
            actorOrgId: destination.id,
            action: 'account.profile.updated',
            entityType: 'user',
            entityId: userId,
            before,
            after,
          }),
        );
        user.locale = after.locale;
      } else if (dto.organization || dto.profile)
        throw new BadRequestException('A team invitation already has its organization and role');
      if (!destination) throw new BadRequestException('Invitation organization is missing');
      this.validRole(destination, row.role);
      const members = m.getRepository(MembershipEntity),
        existing = await members.findOne({ where: { userId, organizationId: destination.id } });
      if (existing)
        throw new ConflictException(
          'Membership already exists. An invitation cannot change or restore it.',
        );
      const terms = row.initialOwner
        ? preparePartnerTermsAcceptance(
            dto.partnerTerms,
            dto.locale ?? (user.locale as 'en' | 'fr'),
          )
        : undefined;
      await members.save(
        members.create({
          userId,
          organizationId: destination.id,
          role: row.role,
          status: 'active',
        }),
      );
      if (terms) await persistPartnerTermsAcceptance(m, userId, destination, terms);
      row.status = 'accepted';
      row.acceptedAt = now;
      row.acceptedByUserId = userId;
      await repo.save(row);
      await this.audit(m, userId, destination.id, 'invitation.accepted', id, {
        organizationId: destination.id,
        role: row.role,
        membershipStatus: 'active',
      });
      return { id, status: 'accepted', organizationId: destination.id, role: row.role };
    });
  }
}

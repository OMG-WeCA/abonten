import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseService } from '../common/database.service';
import { PartnerTermsAcceptanceEntity } from '../common/entities/partner-terms-acceptance.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import {
  partnerTermsDocument,
  partnerTermsPolicy,
  preparePartnerTermsAcceptance,
  type PartnerTermsDocument,
  type PartnerTermsInput,
} from './terms/partner-terms.catalog';

/** Must run inside the organization creation/owner-authorized acceptance transaction. */
export async function persistPartnerTermsAcceptance(
  manager: EntityManager,
  userId: string,
  organization: OrganizationEntity,
  document: PartnerTermsDocument,
): Promise<PartnerTermsAcceptanceEntity> {
  const repository = manager.getRepository(PartnerTermsAcceptanceEntity);
  const existing = await repository.findOne({
    where: { organizationId: organization.id, version: document.version },
  });
  if (existing) return existing;
  const actor = await manager
    .getRepository(UserEntity)
    .findOne({ where: { id: userId, status: 'active' } });
  if (!actor) throw new NotFoundException('Active representative not found');
  const event = await repository.save(
    repository.create({
      organizationId: organization.id,
      userId,
      organizationName: organization.name,
      representativeName: actor.name,
      version: document.version,
      locale: document.locale,
      digest: document.digest,
      eventKind:
        document.acceptanceMode === 'approved' ? 'approved_acceptance' : 'preview_acknowledgement',
      authorityConfirmed: true,
      contentCopy: structuredClone(document),
      acceptedAt: new Date(),
    }),
  );
  const audit = manager.getRepository(AuditLogEntity);
  await audit.save(
    audit.create({
      actorUserId: userId,
      actorOrgId: organization.id,
      action:
        event.eventKind === 'approved_acceptance'
          ? 'partner_terms.accepted'
          : 'partner_terms.preview_acknowledged',
      entityType: 'partner_terms_acceptance',
      entityId: event.id,
      after: {
        version: event.version,
        locale: event.locale,
        digest: event.digest,
        eventKind: event.eventKind,
        authorityConfirmed: true,
        acceptedAt: event.acceptedAt.toISOString(),
      },
    }),
  );
  return event;
}

@Injectable()
export class PartnerTermsService {
  constructor(private readonly db: DatabaseService) {}

  async history(userId: string, organizationId: string) {
    const membership = await this.db
      .repo(MembershipEntity)
      .then((repo) => repo.findOne({ where: { userId, organizationId, status: 'active' } }));
    if (!membership) throw new ForbiddenException('Active organization membership required');
    return this.db
      .repo(PartnerTermsAcceptanceEntity)
      .then((repo) => repo.find({ where: { organizationId }, order: { acceptedAt: 'DESC' } }));
  }

  async accept(userId: string, organizationId: string, input: PartnerTermsInput) {
    return this.db.transaction(async (manager) => {
      // Same tenant lock used by membership changes; revoked/demoted owners cannot
      // race acceptance, and repeated requests cannot create duplicate events.
      const organization = await manager
        .getRepository(OrganizationEntity)
        .findOne({
          where: { id: organizationId, status: 'active' },
          lock: { mode: 'pessimistic_write' },
        });
      const membership = await manager
        .getRepository(MembershipEntity)
        .findOne({ where: { userId, organizationId, status: 'active', role: 'org_owner' } });
      if (!organization || organization.type !== 'media_partner' || !membership)
        throw new ForbiddenException('An active partner organization owner must accept terms');
      const document = preparePartnerTermsAcceptance(input, input.locale);
      if (!document) throw new ForbiddenException('Terms acceptance is not active');
      return persistPartnerTermsAcceptance(manager, userId, organization, document);
    });
  }

  current(locale: 'en' | 'fr') {
    return partnerTermsDocument(locale, partnerTermsPolicy().version);
  }
}

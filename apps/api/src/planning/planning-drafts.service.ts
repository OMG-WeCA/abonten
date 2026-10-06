import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { isUUID } from 'class-validator';
import type {
  PlanningDraftList,
  SavedAgencyPlanningDraft,
} from '@abonten/contracts/planning-draft';
import { DatabaseService } from '../common/database.service';
import { PlanningDraftEntity } from '../common/entities/planning-draft.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { Capability } from '../capabilities/capability.enum';
import type { OrganizationRole } from '../capabilities/organization-roles';
import { normalizeDraftWrite } from './planning-drafts.validation';

export interface PlanningDraftActor {
  userId: string;
  organizationId: string;
}
const LIMIT = 30;

@Injectable()
export class PlanningDraftsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly capabilities: CapabilityResolverService,
  ) {}

  /** Organization-first lock order also serializes quota checks and create replay.
   * All authorization reads use this manager, including with a one-connection pool. */
  private async authorize(manager: EntityManager, actor: PlanningDraftActor, write: boolean) {
    if (!isUUID(actor.userId) || !isUUID(actor.organizationId))
      throw new ForbiddenException('Active agency membership and planning capabilities required.');
    const org = await manager.getRepository(OrganizationEntity).findOne({
      where: { id: actor.organizationId },
      lock: { mode: write ? 'pessimistic_write' : 'pessimistic_read' },
    });
    if (!org || org.status !== 'active' || org.type !== 'agency')
      throw new ForbiddenException('Active agency membership and planning capabilities required.');
    const membership = await manager.getRepository(MembershipEntity).findOne({
      where: { userId: actor.userId, organizationId: actor.organizationId, status: 'active' },
    });
    const user = await manager
      .getRepository(UserEntity)
      .findOne({ where: { id: actor.userId, status: 'active' } });
    if (!membership || !user)
      throw new ForbiddenException('Active agency membership and planning capabilities required.');
    const overrides = await manager
      .getRepository(UserCapabilityOverrideEntity)
      .find({ where: { userId: actor.userId, organizationId: actor.organizationId } });
    const caps = this.capabilities.resolveScoped(
      membership.role as OrganizationRole,
      overrides,
      org.type,
    );
    if (!caps.has(Capability.MARKETPLACE_VIEW) || !caps.has(Capability.CAMPAIGN_CREATE))
      throw new ForbiddenException('Active agency membership and planning capabilities required.');
  }
  private scope(actor: PlanningDraftActor) {
    return { organizationId: actor.organizationId, userId: actor.userId };
  }
  private record(row: PlanningDraftEntity): SavedAgencyPlanningDraft {
    return {
      id: row.id,
      name: row.name,
      draft: row.draft,
      revision: row.revision,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  async list(actor: PlanningDraftActor): Promise<PlanningDraftList> {
    return this.db.transaction(async (manager) => {
      await this.authorize(manager, actor, false);
      const rows = await manager
        .getRepository(PlanningDraftEntity)
        .find({ where: this.scope(actor), order: { updatedAt: 'DESC', id: 'ASC' }, take: LIMIT });
      return { items: rows.map((row) => this.record(row)), limit: LIMIT };
    });
  }
  async get(actor: PlanningDraftActor, id: string): Promise<SavedAgencyPlanningDraft> {
    return this.db.transaction(async (manager) => {
      await this.authorize(manager, actor, false);
      if (!isUUID(id)) throw new NotFoundException('Personal planning draft not found.');
      const row = await manager
        .getRepository(PlanningDraftEntity)
        .findOne({ where: { ...this.scope(actor), id } });
      if (!row) throw new NotFoundException('Personal planning draft not found.');
      return this.record(row);
    });
  }
  async create(actor: PlanningDraftActor, body: unknown): Promise<SavedAgencyPlanningDraft> {
    const input = normalizeDraftWrite(body, 'create');
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ name: input.name, draft: input.draft }))
      .digest('hex');
    return this.db.transaction(async (manager) => {
      await this.authorize(manager, actor, true);
      const repo = manager.getRepository(PlanningDraftEntity);
      const existing = await repo.findOne({
        where: { ...this.scope(actor), clientRequestId: input.clientRequestId! },
      });
      if (existing) {
        if (existing.creationFingerprint !== fingerprint)
          throw new ConflictException({
            code: 'DRAFT_REQUEST_CONFLICT',
            message: 'This draft save request was already used for different content.',
          });
        return this.record(existing);
      }
      if ((await repo.count({ where: this.scope(actor) })) >= LIMIT)
        throw new ConflictException({
          code: 'DRAFT_LIMIT_REACHED',
          message: 'You have reached the personal planning draft limit.',
        });
      const row = await repo.save(
        repo.create({
          ...this.scope(actor),
          name: input.name,
          draft: input.draft,
          clientRequestId: input.clientRequestId!,
          creationFingerprint: fingerprint,
          revision: 1,
        }),
      );
      await manager.getRepository(AuditLogEntity).save({
        actorUserId: actor.userId,
        actorOrgId: actor.organizationId,
        action: 'planning.draft.created',
        entityType: 'personal_planning_draft',
        entityId: row.id,
        before: null,
        after: { revision: 1 },
      });
      return this.record(row);
    });
  }
  async update(
    actor: PlanningDraftActor,
    id: string,
    body: unknown,
  ): Promise<SavedAgencyPlanningDraft> {
    const input = normalizeDraftWrite(body, 'update');
    return this.db.transaction(async (manager) => {
      await this.authorize(manager, actor, true);
      if (!isUUID(id)) throw new NotFoundException('Personal planning draft not found.');
      const repo = manager.getRepository(PlanningDraftEntity);
      const row = await repo.findOne({
        where: { ...this.scope(actor), id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) throw new NotFoundException('Personal planning draft not found.');
      if (row.revision !== input.revision)
        throw new ConflictException({
          code: 'DRAFT_REVISION_CONFLICT',
          message: 'This draft changed elsewhere. Reload it before saving.',
        });
      const previous = row.revision;
      row.name = input.name;
      row.draft = input.draft;
      row.revision += 1;
      const saved = await repo.save(row);
      await manager.getRepository(AuditLogEntity).save({
        actorUserId: actor.userId,
        actorOrgId: actor.organizationId,
        action: 'planning.draft.updated',
        entityType: 'personal_planning_draft',
        entityId: id,
        before: { revision: previous },
        after: { revision: saved.revision },
      });
      return this.record(saved);
    });
  }
}

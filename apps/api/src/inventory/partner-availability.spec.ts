import { strict as assert } from 'node:assert';
import { it } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { FaceBlackoutEntity } from '../common/entities/face-blackout.entity';
import { BillboardSiteEntity } from '../common/entities/billboard-site.entity';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { StorageService } from '../common/storage.service';
import { InventoryService } from './inventory.service';

const actor = { userId: 'user-1', email: 'partner@example.test', sessionVersion: 0 };
const face = { id: 'face-1', siteId: 'site-1' };

function harness(owner = 'partner-1') {
  const blackouts: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];
  let booked = false;
  const blackoutRepo = {
    create: (value: Record<string, unknown>) => value,
    save: async (value: Record<string, unknown>) => {
      const saved = { id: `block-${blackouts.length + 1}`, ...value };
      blackouts.push(saved);
      return saved;
    },
    find: async ({ where }: { where: { faceId: string } }) => blackouts.filter((row) => row.faceId === where.faceId),
    findOne: async ({ where }: { where: { id: string } }) => blackouts.find((row) => row.id === where.id) ?? null,
    delete: async ({ id }: { id: string }) => {
      const index = blackouts.findIndex((row) => row.id === id);
      if (index >= 0) blackouts.splice(index, 1);
    },
  };
  const repos = (target: unknown): unknown => {
    if (target === FaceBlackoutEntity) return blackoutRepo;
    if (target === BillboardSiteEntity) return { query };
    if (target === SiteFaceEntity) return { findOne: async () => face };
    if (target === OrganizationEntity) return { findOne: async () => ({ type: 'media_partner' }) };
    if (target === AuditLogEntity) return {
      create: (value: Record<string, unknown>) => value,
      save: async (value: Record<string, unknown>) => { audit.push(value); return value; },
    };
    throw new Error(`Unexpected repo ${String(target)}`);
  };
  const query = async (sql: string) => {
    if (sql.includes('FROM site_faces f JOIN billboard_sites')) return [{ siteId: face.siteId, organizationId: owner }];
    if (sql.includes('FROM face_blackouts WHERE')) return [{
      blackout: blackouts.some((row) => row.startDate === '2027-01-10'), booking: booked,
    }];
    if (sql.includes('SELECT id FROM site_faces')) return [{ id: face.id }];
    if (sql.includes('FROM billboard_sites WHERE id')) return [{ organizationId: owner }];
    throw new Error(`Unexpected query ${sql}`);
  };
  const db = {
    repo: async (target: unknown) => repos(target),
    transaction: async (work: (manager: unknown) => Promise<unknown>) => work({
      query, getRepository: repos,
    }),
  } as unknown as DatabaseService;
  const service = new InventoryService(db, new CapabilityResolverService(), {} as StorageService);
  return { service, blackouts, audit, setBooked: (value: boolean) => { booked = value; } };
}

it('records Partner unavailable dates with one audit entry and removes them', async () => {
  const h = harness();
  const block = await h.service.addBlackout(actor, 'partner-1', face.id, {
    startDate: '2027-01-10', endDate: '2027-01-13', reason: 'Maintenance',
  });
  assert.equal(block.reason, 'Maintenance');
  assert.equal((await h.service.listBlackouts('partner-1', face.id)).length, 1);
  assert.equal(h.audit.length, 1);
  assert.equal(h.audit[0].action, 'inventory.blackout.created');
  await h.service.removeBlackout(actor, 'partner-1', block.id);
  assert.equal(h.blackouts.length, 0);
  assert.equal(h.audit[1].action, 'inventory.blackout.removed');
});

it('rejects invalid, overlapping, booked, and cross-tenant periods without auditing', async () => {
  const h = harness();
  await assert.rejects(() => h.service.addBlackout(actor, 'partner-1', face.id, {
    startDate: '2027-01-13', endDate: '2027-01-10', reason: 'Maintenance',
  }), BadRequestException);
  await assert.rejects(() => h.service.addBlackout(actor, 'partner-2', face.id, {
    startDate: '2027-01-10', endDate: '2027-01-13', reason: 'Maintenance',
  }), ForbiddenException);
  h.setBooked(true);
  await assert.rejects(() => h.service.addBlackout(actor, 'partner-1', face.id, {
    startDate: '2027-01-10', endDate: '2027-01-13', reason: 'Maintenance',
  }), ConflictException);
  h.setBooked(false);
  await h.service.addBlackout(actor, 'partner-1', face.id, {
    startDate: '2027-01-10', endDate: '2027-01-13', reason: 'Maintenance',
  });
  await assert.rejects(() => h.service.addBlackout(actor, 'partner-1', face.id, {
    startDate: '2027-01-10', endDate: '2027-01-13', reason: 'Overlap',
  }), ConflictException);
  assert.equal(h.audit.length, 1);
  await assert.rejects(() => h.service.listBlackouts('partner-2', face.id), ForbiddenException);
  await assert.rejects(() => h.service.removeBlackout(actor, 'partner-2', 'block-1'), ForbiddenException);
});

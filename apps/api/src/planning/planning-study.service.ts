import {
  SEC_AUDIENCE_REFERENCE_VERSION,
  SEC_AUDIENCE_PUBLICATION_VERSION,
} from './sec-audience-model';
import { HOUSEHOLD_AUDIENCE_REFERENCE_VERSION } from './household-audience-model';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  HttpException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type {
  PlanningStudyFace,
  PlanningStudyJob,
  PlanningStudyRequest,
  PlanningStudyEvaluation,
  PlanningStudyReadiness,
} from '@abonten/contracts/planning-study';
import { decodeRoutePath, displayRoute } from '@abonten/contracts/route-geometry.cjs';
import type { FacePlanningProfile } from '@abonten/contracts/planning-profile';
import { isUUID } from 'class-validator';
import { DatabaseService } from '../common/database.service';
import { RedisService } from '../common/redis.service';
import { OrganizationEntity } from '../common/entities/organization.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { MembershipEntity } from '../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../auth/entities/user-capability-override.entity';
import { AuditLogEntity } from '../common/entities/audit-log.entity';
import { CapabilityResolverService } from '../capabilities/capability-resolver.service';
import { Capability } from '../capabilities/capability.enum';
import type { OrganizationRole } from '../capabilities/organization-roles';
import { MarketplaceService } from '../marketplace/marketplace.service';
import {
  readPopulationCells,
  PopulationCellLimitError,
  PopulationRasterCapacityError,
  isPopulationRasterReadError,
  type PopulationCells,
} from '../enrichment/import/raster';
import { countryFor, type Bounds } from '../enrichment/registry';
import { PlanningService } from './planning.service';
import {
  estimateFaceCost,
  planningCoordinate,
  type PlanningRateCard,
  type PlanningFace,
} from './planning-math';
import {
  MapboxDirectionsProvider,
  ROUTING_FAILURE_GUIDANCE,
  RoutingProviderException,
} from './mapbox-directions.provider';
import { daypartAt, generatePairs } from './travel-demand-generation';
import { readDemandGeography, NATIVE_POPULATION_QUERY_TIMEOUT } from './travel-demand-geography';
import {
  composeStudy,
  targetingEvidence,
  faceReadinessIssues,
  representativePeriods,
  routeChoices,
  selectPairBlocks,
  type StudyDemographics,
  type StudyEvidence,
  type StudyPeriod,
} from './planning-study.model';
import { normalizeStudy, normalizeStudyEvaluation } from './planning-study.validation';
import type { DemandInputSource } from './travel-demand-inputs';
import { findMarket } from '../common/supported-markets';
import { PLANNING_CALIBRATION_VERSION } from './planning-calibration';
import { coordinate } from './travel-demand-model';

interface Actor {
  userId: string;
  organizationId: string;
}
interface StoredStudy {
  actor: Actor;
  job: PlanningStudyJob;
  evidence: StudyEvidence | null;
  sourceSignature: string;
  faceSignature: string;
  baseInputSignature?: string;
  execution?: { owner: string; token: string };
}
interface StudyEvaluationOverlay {
  baseInputSignature: string;
  sourceSignature: string;
  request: PlanningStudyRequest;
  faceSignature: string;
  updatedAt: string;
  result: PlanningStudyEvaluation;
}
interface StudyImport extends DemandInputSource {
  id: string;
  rasterPath: string | null;
}
interface StudySite {
  id: string;
  name: string;
  country: string;
  format: string;
  illuminationType?: string;
  illuminationHours?: string | null;
  longitude: unknown;
  latitude: unknown;
  permitExpiresAt?: Date | string | null;
  isResearchReference?: boolean;
  faces: (PlanningFace & {
    faceLabel: string;
    planningProfile?: FacePlanningProfile | null;
    updatedAt?: Date;
  })[];
  rateCards: PlanningRateCard[];
}
const TTL = 24 * 60 * 60;
const MAX_ACTIVE = 2;
const MAX_RETAINED = 8;
const MAX_STUDY_BYTES = 32 * 1024 * 1024;
const LEASE_MS = 120_000;
const HEARTBEAT_MS = 5_000;
const ACTIVE_KEY = 'planning-study:v1:active';
const RUNNERS_KEY = 'planning-study:v1:runners';
function signature(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function studyInputSignature(request: PlanningStudyRequest, sources: string) {
  const { planning: _context, ...measurement } = request;
  return signature({ request: measurement, sources });
}
function iso(value: Date | string | null | undefined) {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

@Injectable()
export class PlanningStudyService implements OnModuleDestroy {
  private readonly instanceId = randomUUID();
  private readonly studies = new Map<string, StoredStudy>();
  private readonly snapshots = new WeakMap<StoredStudy, string>();
  private readonly evaluationSnapshots = new WeakMap<StoredStudy, string | null>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly running = new Set<string>();
  private readonly preflights = new Set<string>();
  private readonly waiting: string[] = [];
  private readonly ownership = new Map<
    string,
    { token: string; timer: ReturnType<typeof setInterval> }
  >();
  private draining = false;
  constructor(
    private readonly db: DatabaseService,
    private readonly redis: RedisService,
    private readonly capabilities: CapabilityResolverService,
    private readonly marketplace: MarketplaceService,
    private readonly planning: PlanningService,
    private readonly mapbox: MapboxDirectionsProvider,
  ) {}
  onModuleDestroy() {
    for (const owner of this.ownership.values()) clearInterval(owner.timer);
    for (const controller of this.controllers.values()) controller.abort();
  }
  private async authorize(actor: Actor) {
    if (!isUUID(actor.userId) || !isUUID(actor.organizationId))
      throw new ForbiddenException('Active agency membership and planning capabilities required.');
    await this.db.transaction(async (manager) => {
      const org = await manager
        .getRepository(OrganizationEntity)
        .findOne({ where: { id: actor.organizationId, status: 'active', type: 'agency' } });
      const membership = await manager.getRepository(MembershipEntity).findOne({
        where: { userId: actor.userId, organizationId: actor.organizationId, status: 'active' },
      });
      const user = await manager
        .getRepository(UserEntity)
        .findOne({ where: { id: actor.userId, status: 'active' } });
      if (!org || !membership || !user)
        throw new ForbiddenException(
          'Active agency membership and planning capabilities required.',
        );
      const overrides = await manager
        .getRepository(UserCapabilityOverrideEntity)
        .find({ where: { userId: actor.userId, organizationId: actor.organizationId } });
      const caps = this.capabilities.resolveScoped(
        membership.role as OrganizationRole,
        overrides,
        org.type,
      );
      if (!caps.has(Capability.CAMPAIGN_CREATE) || !caps.has(Capability.MARKETPLACE_VIEW))
        throw new ForbiddenException(
          'Active agency membership and planning capabilities required.',
        );
    });
  }
  private key(actor: Actor, id: string) {
    return `planning-study:v1:${actor.organizationId}:${actor.userId}:${id}`;
  }
  private ownershipKeys(study: StoredStudy) {
    const key = this.key(study.actor, study.job.id);
    return [
      `${key}:lease`,
      `${key}:cancel`,
      ACTIVE_KEY,
      `planning-study:v1:agency:${study.actor.organizationId}:active`,
      RUNNERS_KEY,
    ];
  }
  private async claim(study: StoredStudy) {
    const token = randomUUID();
    const result = Number(
      await this.redis.instance.eval(
        `
      if redis.call('EXISTS',KEYS[1]) == 1 then return 0 end
      redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',ARGV[1])
      redis.call('ZREMRANGEBYSCORE',KEYS[4],'-inf',ARGV[1])
      if redis.call('ZCARD',KEYS[4]) >= 3 then return -1 end
      if redis.call('ZCARD',KEYS[3]) >= 12 then return -2 end
      redis.call('SET',KEYS[1],ARGV[3],'PX',ARGV[2])
      redis.call('DEL',KEYS[2])
      for i=3,4 do
        redis.call('ZADD',KEYS[i],ARGV[1]+ARGV[2],ARGV[4])
        redis.call('PEXPIRE',KEYS[i],ARGV[2]*2)
      end
      return 1`,
        4,
        ...this.ownershipKeys(study).slice(0, 4),
        Date.now(),
        LEASE_MS,
        token,
        this.key(study.actor, study.job.id),
      ),
    );
    if (result !== 1)
      throw new ConflictException(
        result === 0
          ? 'The previous study attempt is still stopping. Retry when its routing request finishes.'
          : result === -1
            ? 'This agency already has three active studies. Cancel or finish one before starting another.'
            : 'Planning studies are busy. Retry when an active study finishes.',
      );
    study.execution = { owner: this.instanceId, token };
    this.controllers.set(study.job.id, new AbortController());
    const timer = setInterval(() => {
      void this.heartbeat(study).catch(() => this.controllers.get(study.job.id)?.abort());
    }, HEARTBEAT_MS);
    timer.unref();
    this.ownership.set(study.job.id, { token, timer });
  }
  private async release(study: StoredStudy) {
    const owner = this.ownership.get(study.job.id);
    if (!owner || owner.token !== study.execution?.token) return;
    clearInterval(owner.timer);
    this.ownership.delete(study.job.id);
    await this.redis.instance.eval(
      `
      if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
      redis.call('DEL',KEYS[1],KEYS[2])
      for i=3,5 do redis.call('ZREM',KEYS[i],ARGV[2]) end
      return 1`,
      5,
      ...this.ownershipKeys(study),
      owner.token,
      this.key(study.actor, study.job.id),
    );
  }
  private async heartbeat(study: StoredStudy) {
    const owner = this.ownership.get(study.job.id);
    if (!owner || owner.token !== study.execution?.token) return;
    const state = Number(
      await this.redis.instance.eval(
        `
      if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
      if redis.call('GET',KEYS[2]) == ARGV[1] then return -1 end
      redis.call('PEXPIRE',KEYS[1],ARGV[2])
      for i=3,4 do
        redis.call('ZADD',KEYS[i],ARGV[3]+ARGV[2],ARGV[4])
        redis.call('PEXPIRE',KEYS[i],ARGV[2]*2)
      end
      if redis.call('ZSCORE',KEYS[5],ARGV[4]) then
        redis.call('ZADD',KEYS[5],ARGV[3]+ARGV[2],ARGV[4])
        redis.call('PEXPIRE',KEYS[5],ARGV[2]*2)
      end
      return 1`,
        5,
        ...this.ownershipKeys(study),
        owner.token,
        LEASE_MS,
        Date.now(),
        this.key(study.actor, study.job.id),
      ),
    );
    if (state !== 1) {
      this.controllers.get(study.job.id)?.abort();
      if (!this.running.has(study.job.id)) {
        if (state === -1) await this.cancelQueued(study);
        else {
          this.controllers.delete(study.job.id);
          await this.release(study);
        }
      }
    }
    this.drain();
  }
  private async cancelQueued(study: StoredStudy) {
    for (let index = this.waiting.length - 1; index >= 0; index--)
      if (this.waiting[index] === study.job.id) this.waiting.splice(index, 1);
    study.job.status = 'cancelled';
    study.job.progress.stage = 'Cancelled; controls are saved for retry';
    study.job.error = null;
    try {
      await this.save(study, study.execution!.token);
    } finally {
      this.controllers.delete(study.job.id);
      await this.release(study);
    }
  }
  private retain(study: StoredStudy) {
    this.studies.set(study.job.id, study);
    while (this.studies.size > MAX_RETAINED) {
      const oldest = [...this.studies].find(([id]) => !this.controllers.has(id));
      if (!oldest) break;
      this.studies.delete(oldest[0]);
    }
  }
  private async save(study: StoredStudy, ownerToken?: string) {
    study.job.updatedAt = new Date().toISOString();
    const encoded = JSON.stringify(
      study,
      function (this: { path?: unknown; segments?: unknown }, key: string, value: unknown) {
        // Full geometry is already present losslessly as polyline6; avoid storing its decoded duplicate.
        return key === 'points' && typeof this.path === 'string' && Array.isArray(this.segments)
          ? undefined
          : value;
      },
    );
    if (Buffer.byteLength(encoded) > MAX_STUDY_BYTES)
      throw new BadRequestException(
        'This route reference is too large to retain. Reduce the study area or directed-pair reference budget.',
      );
    const key = this.key(study.actor, study.job.id);
    if (ownerToken) {
      const saved = Number(
        await this.redis.instance.eval(
          `
        if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
        if redis.call('GET',KEYS[2]) == ARGV[1] and ARGV[4] ~= 'cancelled' then return 0 end
        redis.call('SET',KEYS[3],ARGV[2],'EX',ARGV[3])
        redis.call('DEL',KEYS[4])
        return 1`,
          4,
          `${key}:lease`,
          `${key}:cancel`,
          key,
          `${key}:evaluation`,
          ownerToken,
          encoded,
          TTL,
          study.job.status,
        ),
      );
      if (!saved) {
        this.controllers.get(study.job.id)?.abort();
        throw new ConflictException(
          'Study ownership changed or cancellation was requested. Retry after routing stops.',
        );
      }
    } else {
      const saved = Number(
        await this.redis.instance.eval(
          `
        if redis.call('EXISTS',KEYS[3]) == 1 or redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
        redis.call('SET',KEYS[1],ARGV[2],'EX',ARGV[3])
        redis.call('DEL',KEYS[2])
        return 1`,
          3,
          key,
          `${key}:evaluation`,
          `${key}:lease`,
          this.snapshots.get(study) ?? '',
          encoded,
          TTL,
        ),
      );
      if (!saved)
        throw new ConflictException(
          'The study changed while validating its saved inputs. Reload the current study.',
        );
    }
    this.snapshots.set(study, encoded);
    this.evaluationSnapshots.set(study, null);
    this.retain(study);
  }
  private async saveEvaluation(
    study: StoredStudy,
    signal?: AbortSignal,
  ): Promise<PlanningStudyEvaluation> {
    const evaluation = this.evaluationResult(study.job.result!);
    study.job.updatedAt = new Date().toISOString();
    const overlay: StudyEvaluationOverlay = {
      baseInputSignature: study.baseInputSignature!,
      sourceSignature: study.sourceSignature,
      request: study.job.request,
      faceSignature: study.faceSignature,
      updatedAt: study.job.updatedAt,
      result: evaluation,
    };
    const key = this.key(study.actor, study.job.id);
    const encoded = JSON.stringify(overlay);
    signal?.throwIfAborted();
    const saved = Number(
      await this.redis.instance.eval(
        `
      if redis.call('EXISTS',KEYS[3]) == 1 or redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
      if (redis.call('GET',KEYS[2]) or '') ~= ARGV[2] then return 0 end
      redis.call('SET',KEYS[2],ARGV[3],'EX',ARGV[4])
      redis.call('EXPIRE',KEYS[1],ARGV[4])
      return 1`,
        3,
        key,
        `${key}:evaluation`,
        `${key}:lease`,
        this.snapshots.get(study) ?? '',
        this.evaluationSnapshots.get(study) ?? '',
        encoded,
        TTL,
      ),
    );
    if (!saved)
      throw new ConflictException(
        'The study changed while evaluating face choices. Reload the current study.',
      );
    this.evaluationSnapshots.set(study, encoded);
    this.retain(study);
    return evaluation;
  }
  private async load(actor: Actor, id: string): Promise<StoredStudy> {
    await this.authorize(actor);
    // Another live API process may own the worker or the latest evaluation.
    const key = this.key(actor, id);
    const encoded = await this.redis.instance.get(key);
    const study = encoded ? (JSON.parse(encoded) as StoredStudy) : undefined;
    if (
      !study ||
      study.actor.userId !== actor.userId ||
      study.actor.organizationId !== actor.organizationId
    )
      throw new NotFoundException('No planning study is visible in this scope.');
    this.snapshots.set(study, encoded!);
    this.evaluationSnapshots.set(study, null);
    // Scope and membership are checked before hydrating geometry or reading any evaluation overlay.
    {
      if (study.evidence)
        for (const period of study.evidence.periods)
          for (const pair of period.pairs)
            for (const route of pair.routes) {
              if (!route.points) {
                const points = decodeRoutePath(route.path);
                if (!points)
                  throw new ConflictException(
                    'Stored route geometry is unusable. Retry the saved study.',
                  );
                route.points = points;
              }
            }
      if (study.job.status === 'ready' && study.job.result) {
        study.baseInputSignature ??= study.job.result.inputSignature;
        const encoded = await this.redis.instance.get(`${this.key(actor, id)}:evaluation`);
        this.evaluationSnapshots.set(study, encoded);
        if (encoded) {
          const overlay = JSON.parse(encoded) as StudyEvaluationOverlay;
          if (
            overlay.baseInputSignature === study.baseInputSignature &&
            overlay.sourceSignature === study.sourceSignature
          ) {
            const { routeFaceMatches, ...result } = overlay.result;
            const matches = new Map(routeFaceMatches.map((route) => [route.id, route.faceIds]));
            study.job.result = {
              ...result,
              routes: study.job.result.routes.map((route) => ({
                ...route,
                faceIds: matches.get(route.id) ?? route.faceIds,
              })),
            };
            study.job.request = overlay.request;
            study.faceSignature = overlay.faceSignature;
            study.job.updatedAt = overlay.updatedAt;
          }
        }
        for (const route of study.job.result.routes) route.points = displayRoute(route.points);
      }
      if (!this.controllers.has(id)) this.retain(study);
    }

    if (Date.now() - Date.parse(study.job.updatedAt) > TTL * 1000)
      throw new NotFoundException('This planning study has expired. Run the saved controls again.');
    if (study.job.status === 'queued' || study.job.status === 'running') {
      const [lease, cancellation] = await this.redis.instance.mget(`${key}:lease`, `${key}:cancel`);
      const cancelled = !!study.execution && cancellation === study.execution.token;
      if (cancelled) {
        study.job.status = 'cancelled';
        study.job.progress.stage = 'Cancelled; controls are saved for retry';
        study.job.error = null;
      }
      if (!lease) {
        study.job.status = cancelled ? 'cancelled' : 'failed';
        study.job.updatedAt = new Date().toISOString();
        study.job.error = cancelled
          ? null
          : {
              message: 'The study worker stopped responding. Retry with the saved controls.',
              retryable: true,
            };
        const recovered = Number(
          await this.redis.instance.eval(
            `
          if redis.call('EXISTS',KEYS[1]) == 1 or redis.call('GET',KEYS[2]) ~= ARGV[1] then return 0 end
          redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3])
          redis.call('DEL',KEYS[3])
          return 1`,
            3,
            `${key}:lease`,
            key,
            `${key}:evaluation`,
            encoded!,
            JSON.stringify(study),
            TTL,
          ),
        );
        if (!recovered) return this.load(actor, id);
      }
    }
    return study;
  }
  private async audit(actor: Actor, id: string, action: string, after: Record<string, unknown>) {
    const repo = await this.db.repo(AuditLogEntity);
    await repo.save(
      repo.create({
        actorUserId: actor.userId,
        actorOrgId: actor.organizationId,
        action,
        entityType: 'planning_study',
        entityId: id,
        after,
      }),
    );
  }
  async extractBriefFields(actor: Actor, body: unknown, signal?: AbortSignal) {
    await this.authorize(actor);
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new BadRequestException('Provide a campaign brief.');
    const row = body as Record<string, unknown>;
    if (
      Object.keys(row).some((k) => !['locale', 'countryCode', 'briefText'].includes(k)) ||
      (row.locale !== undefined && row.locale !== 'en' && row.locale !== 'fr') ||
      !findMarket(String(row.countryCode)) ||
      typeof row.briefText !== 'string' ||
      !row.briefText.trim() ||
      row.briefText.length > 60000 ||
      row.briefText.includes('\0')
    )
      throw new BadRequestException(
        'Provide up to 60,000 characters of brief text and a supported market.',
      );
    return this.planning.extractBriefFields(
      {
        locale: row.locale as 'en' | 'fr' | undefined,
        countryCode: String(row.countryCode),
        briefText: row.briefText,
      },
      { userId: actor.userId, orgId: actor.organizationId },
      signal,
    );
  }

  /** Read-only qualification/readiness: no routing or provider transfer, so no road-transfer confirmation is needed. */
  async preflight(
    actor: Actor,
    body: unknown,
    signal = new AbortController().signal,
  ): Promise<PlanningStudyReadiness> {
    await this.authorize(actor);
    const scope = `${actor.organizationId}:${actor.userId}`;
    // Repeated readiness clicks otherwise queue large native rasters and demographic reads.
    if (this.preflights.has(scope) || this.preflights.size >= 2)
      throw new HttpException(
        'Population readiness is busy. Retry when the current check finishes.',
        429,
      );
    this.preflights.add(scope);
    try {
      const request = normalizeStudy(body, { readinessOnly: true });
      const bounds = this.bounds(request);
      const inventory = await this.inventory(actor, request, signal);
      const geography = await readDemandGeography(this.db, request.countryCode, bounds, signal, 5, {
        ...request.center,
        radiusKm: request.radiusKm,
      });
      const demographics = await this.demographics(
        request,
        bounds,
        signal,
        geography.populationCells,
      );
      const evidence: StudyEvidence = {
        sources: geography.sources,
        zones: geography.zones,
        periods: [],
        generatedPairCount: 0,
        populationCoverage: geography.zones.length
          ? geography.zones.reduce((sum, z) => sum + z.populationCoverage, 0) /
            geography.zones.length
          : 0,
        warnings: geography.warnings,
        demographics,
      };
      const targeting = targetingEvidence(request, evidence);
      const secondary = request.secondaryTarget
        ? {
            target: request.secondaryTarget,
            targeting: targetingEvidence({ ...request, target: request.secondaryTarget }, evidence),
          }
        : undefined;
      const residents = geography.zones.reduce((sum, z) => sum + (z.residents ?? 0), 0);
      const missing = inventory.faces
        .map((face) => ({
          faceId: face.faceId,
          issues: faceReadinessIssues(face, request.dayparts),
        }))
        .filter((row) => row.issues.length);
      const withViewingProfile = inventory.faces.length - missing.length;
      const missingLayers = [
        { layer: 'roads', label: 'road' },
        { layer: 'pois', label: 'place' },
        { layer: 'population', label: 'population' },
      ].filter(({ layer }) => !geography.sources.some((source) => source.layer === layer));
      const missingData = missingLayers.map(({ label }) => label).join(', ');
      const issues = [
        ...(missingLayers.length
          ? [
              `This area is missing ${missingData} data. Choose another area or ask the operator to add coverage.`,
            ]
          : []),
        ...(geography.zones.length && evidence.populationCoverage < 1
          ? [
              'Population data is missing from part of the travel catchment; the estimate covers available areas.',
            ]
          : []),
        ...targeting.reasons,
        ...(withViewingProfile < inventory.faces.length
          ? ['Add the missing viewing details before estimating ad exposure.']
          : []),
        ...(!inventory.faces.length ? ['Choose candidate faces to assess viewing readiness.'] : []),
      ];
      return {
        status:
          !residents || targeting.status === 'unavailable'
            ? 'unavailable'
            : issues.length
              ? 'partial'
              : 'ready',
        referenceVersion: `${PLANNING_CALIBRATION_VERSION}:${HOUSEHOLD_AUDIENCE_REFERENCE_VERSION}:${SEC_AUDIENCE_REFERENCE_VERSION}:${SEC_AUDIENCE_PUBLICATION_VERSION}`,
        footprint: {
          center: request.center,
          radiusKm: request.radiusKm,
          schoolBasis:
            'Mapped schools within the selected radius; resident origins include the wider travel catchment.',
        },
        targeting,
        ...(secondary ? { secondary } : {}),
        population: {
          residents: residents || null,
          coverage: evidence.zones.length ? evidence.populationCoverage : null,
        },
        faces: { total: inventory.faces.length, withViewingProfile, missing },
        sources: [
          ...new Map(
            [
              ...geography.sources,
              ...targeting.sources,
              ...(secondary?.targeting.sources ?? []),
            ].map((source) => [`${source.sourceKey}:${source.version}`, source]),
          ).values(),
        ],
        issues,
      };
    } finally {
      this.preflights.delete(scope);
    }
  }

  async create(actor: Actor, body: unknown) {
    await this.authorize(actor);
    const request = normalizeStudy(body);
    // Do not accept arbitrary face positions or profiles from the planner request.
    const { faces, faceSignature } = await this.inventory(actor, request);
    const id = randomUUID();
    const now = new Date().toISOString();
    const study: StoredStudy = {
      actor,
      job: {
        id,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        progress: { completed: 0, total: 0, stage: 'Waiting to read public reference inputs' },
        request,
        error: null,
        result: null,
      },
      evidence: null,
      sourceSignature: '',
      faceSignature,
    };
    // Shared admission and ownership are reserved atomically across API processes.
    await this.claim(study);
    this.studies.set(id, study);
    try {
      await this.audit(actor, id, 'planning.study.created', {
        countryCode: request.countryCode,
        faceCount: faces.length,
        flight: request.flight,
        sampling: request.sampling,
      });
      await this.save(study, study.execution!.token);
    } catch (error) {
      this.controllers.delete(id);
      this.studies.delete(id);
      await this.release(study).catch(() => undefined);
      throw error;
    }
    this.waiting.push(id);
    this.drain();
    return study.job;
  }
  async get(actor: Actor, id: string) {
    const study = await this.load(actor, id);
    if (study.job.status === 'ready') await this.checkCompatibility(study);
    return study.job;
  }
  async cancel(actor: Actor, id: string) {
    const study = await this.load(actor, id);
    if (study.job.status === 'queued' || study.job.status === 'running') {
      const key = this.key(actor, id);
      const token = await this.redis.instance.eval(
        `
        local token=redis.call('GET',KEYS[1])
        if not token then return '' end
        redis.call('SET',KEYS[2],token,'PX',ARGV[1])
        return token`,
        2,
        `${key}:lease`,
        `${key}:cancel`,
        LEASE_MS * 2,
      );
      if (token) {
        if (this.ownership.get(id)?.token === token) {
          this.controllers.get(id)?.abort();
          if (!this.running.has(id)) await this.cancelQueued(study);
        }
        await this.audit(actor, id, 'planning.study.cancelled', {});
      }
    }
    return (await this.load(actor, id)).job;
  }
  async retry(actor: Actor, id: string) {
    const study = await this.load(actor, id);
    if (study.job.status === 'queued' || study.job.status === 'running') return study.job;
    if (this.running.has(id) || (await this.redis.instance.exists(`${this.key(actor, id)}:lease`)))
      throw new ConflictException(
        'Cancellation is finishing. Retry again when the current routing request stops.',
      );
    if (study.job.error?.code === 'STUDY_REFERENCE_TOO_LARGE')
      throw new BadRequestException(study.job.error.message);
    study.job.request = normalizeStudy(study.job.request);
    await this.inventory(actor, study.job.request);
    await this.claim(study);
    study.job.status = 'queued';
    study.job.error = null;
    study.job.result = null;
    study.evidence = null;
    study.baseInputSignature = undefined;
    study.job.progress = { completed: 0, total: 0, stage: 'Retry queued' };
    this.studies.set(id, study);
    try {
      await this.save(study, study.execution!.token);
    } catch (error) {
      this.controllers.delete(id);
      await this.release(study).catch(() => undefined);
      study.job.status = 'failed';
      study.job.error = {
        message: 'Study progress could not be saved. Retry when study storage is available.',
        retryable: true,
      };
      throw error;
    }
    this.waiting.push(id);
    this.drain();
    return study.job;
  }
  async evaluate(actor: Actor, id: string, body: unknown, signal?: AbortSignal) {
    return this.evaluateChoices(actor, id, body, true, signal);
  }
  async compare(actor: Actor, id: string, body: unknown) {
    return this.evaluateChoices(actor, id, body, false);
  }
  private evaluationResult(
    result: NonNullable<PlanningStudyJob['result']>,
  ): PlanningStudyEvaluation {
    const { routes, ...metrics } = result;
    return {
      ...metrics,
      routeFaceMatches: routes.map((route) => ({ id: route.id, faceIds: route.faceIds })),
    };
  }
  private async evaluateChoices(
    actor: Actor,
    id: string,
    body: unknown,
    persist: boolean,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const study = await this.load(actor, id);
    signal?.throwIfAborted();
    if (study.job.status !== 'ready' || !study.evidence)
      throw new ConflictException('Finish or retry the study before evaluating face choices.');
    const input = normalizeStudyEvaluation(body);
    if (persist) await this.checkCompatibility(study, false, signal);
    else if (
      study.sourceSignature !==
      (await this.sourceSignature(study.job.request.countryCode, this.bounds(study.job.request)))
    )
      throw new ConflictException(
        'Public source versions changed. Retry the current study before comparing alternatives.',
      );
    if (study.job.status !== 'ready')
      throw new ConflictException(
        study.job.error?.message ?? 'Study inputs changed; retry the study.',
      );
    const request = {
      ...study.job.request,
      selectedFaceIds: input.faceIds,
      minimumOpportunities: input.minimumOpportunities,
      ...(input.objective ? { objective: input.objective } : {}),
      ...(input.budget ? { budget: input.budget } : {}),
      ...(input.digitalAllocations !== undefined
        ? { digitalAllocations: input.digitalAllocations }
        : {}),
    };
    if (input.faces) {
      const refs = new Map(request.faces.map((face) => [face.faceId, face]));
      for (const face of input.faces) {
        const existing = refs.get(face.faceId);
        if (existing && existing.siteId !== face.siteId)
          throw new BadRequestException('A face belongs to a different site.');
        refs.set(face.faceId, face);
      }
      if (refs.size > 100)
        throw new BadRequestException('A study supports up to 100 candidate faces.');
      request.faces = [...refs.values()];
    }
    if (input.faceIds.some((faceId) => !request.faces.some((face) => face.faceId === faceId)))
      throw new BadRequestException('Selected faces must be authorized study candidates.');
    const inventory = await this.inventory(actor, request, signal);
    signal?.throwIfAborted();
    const retainedRoutes = study.job.result!.routes;
    const result = composeStudy(
      id,
      studyInputSignature(request, study.sourceSignature),
      request,
      inventory.faces,
      study.evidence,
      retainedRoutes,
    );
    if (!persist) return this.evaluationResult(result);
    study.baseInputSignature ??= study.job.result!.inputSignature;
    study.job.request = request;
    study.faceSignature = inventory.faceSignature;
    study.job.result = result;
    return this.saveEvaluation(study, signal);
  }
  private drain() {
    if (this.draining) return;
    this.draining = true;
    void (async () => {
      while (this.running.size < MAX_ACTIVE && this.waiting.length) {
        const id = this.waiting[0];
        const study = this.studies.get(id);
        if (!study || study.job.status !== 'queued') {
          this.waiting.shift();
          if (!this.running.has(id)) this.controllers.delete(id);
          continue;
        }
        const slot = Number(
          await this.redis.instance.eval(
            `
        if redis.call('GET',KEYS[1]) ~= ARGV[1] or redis.call('GET',KEYS[2]) == ARGV[1] then return -1 end
        redis.call('ZREMRANGEBYSCORE',KEYS[3],'-inf',ARGV[2])
        if redis.call('ZCARD',KEYS[3]) >= 2 then return 0 end
        redis.call('ZADD',KEYS[3],ARGV[2]+ARGV[3],ARGV[4])
        redis.call('PEXPIRE',KEYS[3],ARGV[3]*2)
        return 1`,
            3,
            ...this.ownershipKeys(study).slice(0, 2),
            RUNNERS_KEY,
            study.execution!.token,
            Date.now(),
            LEASE_MS,
            this.key(study.actor, id),
          ),
        );
        if (slot === 0) {
          break;
        }
        this.waiting.shift();
        if (slot === -1) {
          await this.heartbeat(study);
          continue;
        }
        this.running.add(id);
        void this.run(study)
          .finally(async () => {
            this.running.delete(id);
            this.controllers.delete(id);
            await this.release(study).catch(() => undefined);
            this.drain();
          })
          .catch(() => undefined);
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        this.draining = false;
      });
  }
  private async progress(
    study: StoredStudy,
    stage: string,
    completed = study.job.progress.completed,
    total = study.job.progress.total,
  ) {
    study.job.progress = { stage, completed, total };
    await this.save(study, study.execution!.token);
  }
  private bounds(request: PlanningStudyRequest): Bounds {
    const radius = (request.radiusKm * 5) / 3;
    const y = radius / 111.195;
    const x = y / Math.cos((request.center.latitude * Math.PI) / 180);
    const bounds: Bounds = [
      request.center.longitude - x,
      request.center.latitude - y,
      request.center.longitude + x,
      request.center.latitude + y,
    ];
    const country = countryFor(request.countryCode);
    if (!country)
      throw new BadRequestException('No public reference source is registered for this market.');
    if (
      bounds[0] < country.bounds[0] ||
      bounds[1] < country.bounds[1] ||
      bounds[2] > country.bounds[2] ||
      bounds[3] > country.bounds[3]
    )
      throw new BadRequestException(
        'Choose a local study and through-trip catchment inside the selected country.',
      );
    return bounds;
  }
  private async sourceSignature(countryCode: string, bounds: Bounds) {
    const rows = await this.db.transaction((manager) =>
      manager.query(
        `SELECT id,layer,source_key,version,checksum,reference_year FROM enrichment_imports WHERE active AND data_class='production' AND country_code=$1 AND layer IN ('roads','pois','population','population_demographics') AND ST_Covers(coverage,ST_MakeEnvelope($2,$3,$4,$5,4326)) ORDER BY layer,source_key,reference_year DESC,id`,
        [countryCode, ...bounds],
      ),
    );
    return signature({
      rows,
      calibration: PLANNING_CALIBRATION_VERSION,
      household: HOUSEHOLD_AUDIENCE_REFERENCE_VERSION,
      sec: SEC_AUDIENCE_REFERENCE_VERSION,
      secPublication: SEC_AUDIENCE_PUBLICATION_VERSION,
    });
  }
  private async checkCompatibility(study: StoredStudy, checkFaces = true, signal?: AbortSignal) {
    const current = await this.sourceSignature(
      study.job.request.countryCode,
      this.bounds(study.job.request),
    );
    signal?.throwIfAborted();
    const stale = current !== study.sourceSignature;
    if (stale) {
      study.job.status = 'failed';
      study.job.result = null;
      study.job.error = {
        message: 'Public source versions changed. Retry to use current authorized inputs.',
        retryable: true,
      };
      await this.save(study);
      return;
    }
    if (checkFaces && study.job.status === 'ready' && study.evidence && study.job.result) {
      const inventory = await this.inventory(study.actor, study.job.request);
      if (inventory.faceSignature !== study.faceSignature) {
        study.baseInputSignature ??= study.job.result.inputSignature;
        const routes = study.job.result.routes;
        study.faceSignature = inventory.faceSignature;
        study.job.result = composeStudy(
          study.job.id,
          studyInputSignature(study.job.request, study.sourceSignature),
          study.job.request,
          inventory.faces,
          study.evidence,
          routes,
        );
        await this.saveEvaluation(study);
      }
    }
  }
  private async run(study: StoredStudy) {
    const signal = this.controllers.get(study.job.id)!.signal;
    try {
      study.job.status = 'running';
      await this.progress(study, 'Reading production roads, places and population');
      const request = study.job.request;
      const bounds = this.bounds(request);
      await this.authorize(study.actor);
      const inventory = await this.inventory(study.actor, request, signal);
      study.faceSignature = inventory.faceSignature;
      study.sourceSignature = await this.sourceSignature(request.countryCode, bounds);
      const geography = await readDemandGeography(this.db, request.countryCode, bounds, signal, 5, {
        ...request.center,
        radiusKm: request.radiusKm,
      });
      if (study.sourceSignature !== (await this.sourceSignature(request.countryCode, bounds)))
        throw new ConflictException(
          'Public source versions changed while reading the study. Retry with current imports.',
        );
      const definitions = representativePeriods(request);
      const weighted = definitions.map((period) => ({
        ...period,
        pairs: generatePairs(geography.zones, period.daypart),
      }));
      const canonicalPairs = new Map(
        weighted.flatMap((period) => period.pairs.map((pair) => [pair.id, pair] as const)),
      );
      const pairIds = selectPairBlocks(
        weighted,
        inventory.faces,
        request.sampling.referencePairs ?? 72,
      );
      const evidence: StudyEvidence = {
        sources: geography.sources,
        zones: geography.zones,
        periods: [],
        generatedPairCount: weighted[0]?.pairs.length ?? 0,
        populationCoverage: geography.zones.length
          ? geography.zones.reduce((sum, zone) => sum + zone.populationCoverage, 0) /
            geography.zones.length
          : 0,
        warnings: [...geography.warnings],
        demographics: { sources: [], supportedAgeBands: [], sexSupported: false, cells: [] },
        benchmarkApproaches: [],
      };
      for (let start = 0; start < geography.zones.length; start += 4) {
        const approaches = await Promise.all(
          geography.zones
            .slice(start, start + 4)
            .map((zone) =>
              zone.roadPoint ? this.approach(request.countryCode, zone.roadPoint) : null,
            ),
        );
        evidence.benchmarkApproaches!.push(
          ...approaches.filter(
            (approach): approach is NonNullable<typeof approach> => approach !== null,
          ),
        );
      }
      evidence.demographics = await this.demographics(
        request,
        bounds,
        signal,
        geography.populationCells,
      );
      delete geography.populationCells;
      if (!geography.zones.length)
        evidence.warnings.push(
          'Import production roads, mapped destinations and population covering the local and through-trip catchment before routing.',
        );
      if (geography.zones.some((zone) => zone.residents === null || zone.populationCoverage < 0.95))
        evidence.warnings.push(
          'Population coverage is incomplete; estimates describe only the known resident population, without replacing missing residents with zero.',
        );
      if (!definitions.length)
        evidence.warnings.push(
          'None of the requested local dayparts occurs in the selected flight.',
        );
      const total = pairIds.length * weighted.length;
      await this.progress(study, 'Routing fixed local and through-trip pairs', 0, total);
      let completed = 0;
      for (const definition of weighted) {
        const byId = new Map(definition.pairs.map((pair) => [pair.id, pair]));
        const period: StudyPeriod = {
          id: definition.id,
          departureAt: definition.departureAt,
          daypart: daypartAt(new Date(definition.departureAt), request.timeZone),
          pairs: [],
          generatedWeight: definition.pairs.reduce((sum, pair) => sum + pair.demandWeight, 0),
        };
        for (let start = 0; start < pairIds.length;) {
          const batchSize = this.running.size > 1 ? 1 : 2;
          const batch = pairIds.slice(start, start + batchSize);
          start += batch.length;
          const entries = await Promise.all(
            batch.map(async (id) => {
              signal.throwIfAborted();
              const canonical = canonicalPairs.get(id)!;
              const pair = byId.get(id) ?? {
                ...canonical,
                demandWeight: 0,
                contributions: canonical.contributions.map((contribution) => ({
                  ...contribution,
                  weight: 0,
                  localTimeFactor: 0,
                })),
              };
              const [choice] = await this.mapbox.discoverStudyRoutes(
                [[coordinate(pair.origin), coordinate(pair.destination)]],
                definition.departureAt,
                signal,
                study.sourceSignature,
              );
              signal.throwIfAborted();
              if ('reason' in choice && ROUTING_FAILURE_GUIDANCE[choice.reason].global)
                throw new RoutingProviderException(choice.reason);
              const routes = 'routes' in choice ? routeChoices(pair, choice.routes, period.id) : [];
              const entry = {
                pair,
                routes,
                unavailableReason:
                  'reason' in choice
                    ? choice.reason
                    : routes.length
                      ? null
                      : 'route_geometry_unavailable',
              };
              if (study.job.status !== 'running') return entry;
              completed++;
              await this.progress(
                study,
                `Routing ${definition.id}: ${completed} of ${total} directed pair departures`,
                completed,
                total,
              );
              return entry;
            }),
          );
          period.pairs.push(...entries);
        }
        evidence.periods.push(period);
      }
      signal.throwIfAborted();
      await this.progress(
        study,
        'Calculating face scores, fixed-population audience and face mix',
        completed,
        total,
      );
      await this.authorize(study.actor);
      if (study.sourceSignature !== (await this.sourceSignature(request.countryCode, bounds)))
        throw new ConflictException(
          'Public source versions changed during routing. Retry with current imports.',
        );
      const currentInventory = await this.inventory(study.actor, request, signal);
      if (currentInventory.faceSignature !== study.faceSignature)
        throw new ConflictException(
          'Inventory, availability or face viewing inputs changed during routing. Retry to use current facts.',
        );
      study.evidence = evidence;
      study.job.result = composeStudy(
        study.job.id,
        studyInputSignature(request, study.sourceSignature),
        request,
        inventory.faces,
        evidence,
      );
      study.baseInputSignature = study.job.result.inputSignature;
      study.job.status = 'ready';
      study.job.error = null;
      study.job.progress.stage = 'Study ready';
      await this.save(study, study.execution!.token);
    } catch (error) {
      if (signal.aborted) {
        study.job.status = 'cancelled';
        study.job.error = null;
        study.job.progress.stage = 'Cancelled; controls are saved for retry';
      } else {
        study.job.status = 'failed';
        const message =
          error instanceof ServiceUnavailableException ||
          error instanceof BadRequestException ||
          error instanceof ConflictException ||
          error instanceof ForbiddenException
            ? error.message
            : 'The planning study could not finish. Retry with the saved controls.';
        study.job.error = {
          message,
          retryable:
            error instanceof RoutingProviderException
              ? error.retryable
              : !(error instanceof ForbiddenException),
          ...(error instanceof RoutingProviderException
            ? { code: error.code, action: error.action }
            : {}),
        };
        if (error instanceof BadRequestException && error.message.includes('too large to retain'))
          study.job.error = {
            code: 'STUDY_REFERENCE_TOO_LARGE',
            message:
              'This route reference is too large to retain. Reduce the study area or directed-pair reference and start a new study; source-compatible routes already obtained remain cached.',
            action: 'Reduce the study area or reference budget and run a new study.',
            retryable: false,
          };
        study.job.progress.stage = 'Study stopped';
      }
      if (error instanceof BadRequestException) {
        study.evidence = null;
        study.job.result = null;
      }
      await this.save(study, study.execution!.token).catch(() => undefined);
    }
  }
  private async inventory(actor: Actor, request: PlanningStudyRequest, signal?: AbortSignal) {
    const sites = new Map<string, StudySite>();
    for (const ref of request.faces) {
      if (!sites.has(ref.siteId))
        sites.set(
          ref.siteId,
          (await this.marketplace.getMarketplaceSite(
            ref.siteId,
            signal,
            actor.organizationId,
          )) as unknown as StudySite,
        );
    }
    const faces: PlanningStudyFace[] = [];
    const signatureRows: unknown[] = [];
    for (const [siteId, site] of sites) {
      const options = await this.planning.siteOptions(siteId, request.flight, actor.organizationId);
      const longitude = planningCoordinate(site.longitude, 'longitude');
      const latitude = planningCoordinate(site.latitude, 'latitude');
      if (longitude === null || latitude === null)
        throw new BadRequestException('A selected inventory site has no valid map position.');
      const boardApproach = await this.approach(request.countryCode, { longitude, latitude });
      const selected = request.faces.filter((ref) => ref.siteId === siteId);
      for (const ref of selected) {
        const face = site.faces.find((face) => face.id === ref.faceId);
        if (!face)
          throw new NotFoundException('A requested face is not visible on this authorized site.');
        if (
          Math.abs(latitude - request.center.latitude) * 111.195 > (request.radiusKm * 5) / 3 ||
          Math.abs(longitude - request.center.longitude) *
            111.195 *
            Math.cos((request.center.latitude * Math.PI) / 180) >
            (request.radiusKm * 5) / 3
        )
          throw new BadRequestException(
            'Choose candidate faces inside the declared study catchment.',
          );
        const availability = options.faces.find((row) => row.faceId === face.id)?.available;
        const status =
          availability === true ? 'available' : availability === false ? 'unavailable' : 'unknown';
        const cost = estimateFaceCost(
          {
            ...site,
            permitExpiresAt: iso(site.permitExpiresAt),
            rateCards: site.rateCards.map((card) => ({
              ...card,
              effectiveFrom: iso(card.effectiveFrom)!,
              effectiveTo: iso(card.effectiveTo),
            })),
          },
          face,
          request.flight,
          request.budget.currency,
          { status, window: request.flight, checkedAt: options.checkedAt },
        );
        const allocation = request.digitalAllocations?.find(
          (allocation) => allocation.faceId === face.id,
        );
        if (
          allocation &&
          (site.format !== 'digital_led' ||
            !face.spotsPerLoop ||
            allocation.advertiserSpotsPerLoop > face.spotsPerLoop)
        )
          throw new BadRequestException(
            'Planned advertiser plays must belong to a digital face and stay within its recorded loop capacity.',
          );
        const digital =
          site.format === 'digital_led'
            ? {
                spotLengthSeconds: face.spotLengthSeconds ?? null,
                loopLengthSeconds: face.loopLengthSeconds ?? null,
                capacitySpotsPerLoop: face.spotsPerLoop ?? null,
                advertiserSpotsPerLoop: allocation?.advertiserSpotsPerLoop ?? null,
              }
            : undefined;
        const profile = face.planningProfile ?? null;
        const approach = profile?.roadApproach
          ? await this.approach(request.countryCode, { longitude, latitude }, profile.roadApproach)
          : boardApproach;
        faces.push({
          siteId,
          faceId: face.id,
          siteName: site.name,
          faceLabel: face.faceLabel,
          longitude,
          latitude,
          selected: request.selectedFaceIds?.includes(face.id) ?? true,
          researchReference: site.isResearchReference === true,
          commerciallyEligible: cost.status === 'ready' && status === 'available',
          commercialReason:
            cost.status === 'unavailable'
              ? cost.reason
              : status !== 'available'
                ? 'Current full-flight availability is unconfirmed.'
                : null,
          flightCost: cost.status === 'ready' ? cost.amount : null,
          currency: request.budget.currency,
          availability: status,
          approach,
          profile: profile as unknown as Record<string, unknown> | null,
          illumination: {
            type: site.illuminationType ?? null,
            hours: site.illuminationHours ?? null,
          },
          ...(digital ? { digital } : {}),
          periods: [],
        });
        signatureRows.push({
          siteId,
          faceId: face.id,
          profile,
          illumination: {
            type: site.illuminationType ?? null,
            hours: site.illuminationHours ?? null,
          },
          digital,
          availability: status,
          cost:
            cost.status === 'ready'
              ? { amount: cost.amount, currency: cost.currency, rateCardId: cost.rateCardId }
              : cost,
          approach,
        });
      }
    }
    if (
      request.digitalAllocations?.some(
        (allocation) => !faces.some((face) => face.faceId === allocation.faceId),
      )
    )
      throw new BadRequestException('Planned allocations must belong to authorized study faces.');
    return { faces, faceSignature: signature(signatureRows) };
  }
  private async approach(
    countryCode: string,
    point: { longitude: number; latitude: number },
    roadSelection?: { longitude: number; latitude: number },
  ) {
    const rows = await this.db.transaction(async (manager) => {
      await manager.query("SET LOCAL statement_timeout='4s'");
      return manager.query<
        { longitude: number; latitude: number; bearingDeg: number; source: string }[]
      >(
        `WITH nearest AS (
      SELECT ST_GeometryN(ST_LineMerge(f.geom),1) AS line,i.attribution||'; '||i.version AS source
      FROM enrichment_features f JOIN enrichment_imports i ON i.id=f.import_id
      WHERE i.active AND i.data_class='production' AND i.layer='roads' AND i.country_code=$1
        AND f.properties->>'roadClass' IN ('primary','secondary','tertiary','trunk','residential','unclassified')
        AND COALESCE(f.properties->>'access','yes') IN ('yes','permissive','designated') AND COALESCE(f.properties->>'motorVehicle','yes') IN ('yes','permissive','designated')
        AND ST_DWithin(f.geom::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,250)
        AND ($4::float8 IS NULL OR ST_DWithin(f.geom::geography,ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,75))
      ORDER BY CASE WHEN $4::float8 IS NULL THEN ST_Distance(f.geom::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography) ELSE ST_Distance(f.geom::geography,ST_SetSRID(ST_MakePoint($4,$5),4326)::geography) END,ST_Distance(f.geom::geography,ST_SetSRID(ST_MakePoint($2,$3),4326)::geography),f.external_id LIMIT 1
    ), located AS (SELECT *,ST_LineLocatePoint(line,ST_SetSRID(ST_MakePoint($2,$3),4326)) AS t FROM nearest)
    SELECT ST_X(ST_LineInterpolatePoint(line,t)) AS longitude,ST_Y(ST_LineInterpolatePoint(line,t)) AS latitude,
      degrees(ST_Azimuth(ST_LineInterpolatePoint(line,GREATEST(0,t-.001)),ST_LineInterpolatePoint(line,LEAST(1,t+.001)))) AS "bearingDeg",source FROM located`,
        [
          countryCode,
          point.longitude,
          point.latitude,
          roadSelection?.longitude ?? null,
          roadSelection?.latitude ?? null,
        ],
      );
    });
    return rows[0] && rows[0].bearingDeg !== null ? { ...rows[0], halfWidthMetres: 25 } : null;
  }
  private async demographics(
    request: PlanningStudyRequest,
    bounds: Bounds,
    signal: AbortSignal,
    populationCells?: PopulationCells['cells'],
  ): Promise<StudyDemographics> {
    const imports = await this.db.transaction((manager) =>
      manager.query<StudyImport[]>(
        `SELECT DISTINCT ON(source_key) id,layer,source_key AS "sourceKey",version,reference_year AS "referenceYear",attribution,licence_url AS "licenceUrl",raster_path AS "rasterPath" FROM enrichment_imports WHERE country_code=$1 AND active AND data_class='production' AND layer='population_demographics' AND ST_Covers(coverage,ST_MakeEnvelope($2,$3,$4,$5,4326)) ORDER BY source_key,reference_year DESC,fetched_at DESC,id`,
        [request.countryCode, ...bounds],
      ),
    );
    const parsed = imports.flatMap((source) => {
      const match = /^worldpop-age-sex:(f|m):(.+)$/.exec(source.sourceKey);
      return match
        ? [
            {
              source,
              sex: match[1] === 'f' ? ('female' as const) : ('male' as const),
              ageBand: match[2],
            },
          ]
        : [];
    });
    const supportedAgeBands = [...new Set(parsed.map((row) => row.ageBand))]
      .filter(
        (age) =>
          parsed.some((row) => row.ageBand === age && row.sex === 'female') &&
          parsed.some((row) => row.ageBand === age && row.sex === 'male'),
      )
      .sort((a, b) => parseInt(a) - parseInt(b));
    const result: StudyDemographics = {
      sources: imports.map(({ id: _id, rasterPath: _path, ...source }) => source),
      supportedAgeBands,
      sexSupported: supportedAgeBands.length === 17,
      cells: [],
    };
    if (
      ![request.target, request.secondaryTarget].some(
        (target) =>
          target &&
          (target.ageBands?.length ||
            target.sex ||
            target.sec?.groups.length ||
            target.household?.parentsOfSchoolChildren),
      )
    )
      return result;
    if (!populationCells) return result;
    // Parse the fixed native resident cells once. The temporary fragments retain
    // exact geodesic edge cuts and disappear with this read-only transaction.
    await this.db
      .transaction(async (manager) => {
        await manager.query(`SET LOCAL statement_timeout='${NATIVE_POPULATION_QUERY_TIMEOUT}'`);
        await manager.query(
          `CREATE TEMP TABLE planning_demographic_base ON COMMIT DROP AS
        WITH zones AS (
          SELECT y*5+x+1 AS id,ST_MakeEnvelope($1::float8+x*($3::float8-$1::float8)/5,$2::float8+y*($4::float8-$2::float8)/5,$1::float8+(x+1)*($3::float8-$1::float8)/5,$2::float8+(y+1)*($4::float8-$2::float8)/5,4326) AS geom
          FROM generate_series(0,4)x CROSS JOIN generate_series(0,4)y
        ),raw_cells AS MATERIALIZED (
          SELECT (value->>'value')::float8 AS residents,ST_SetSRID(ST_GeomFromGeoJSON((value->'geometry')::text),4326) AS geom
          FROM jsonb_array_elements($5::jsonb) WHERE (value->>'value')::float8>0
        ),cells AS MATERIALIZED (
          SELECT *,ST_Area(geom::geography) AS native_area FROM raw_cells
        ),fragments AS MATERIALIZED (
          SELECT z.id,c.residents,c.native_area,
            CASE WHEN ST_Covers(z.geom,c.geom) THEN c.geom ELSE ST_Intersection(z.geom,c.geom) END AS geom
          FROM zones z JOIN cells c ON z.geom&&c.geom
        ),areas AS MATERIALIZED (
          SELECT *,ST_Area(geom::geography) AS area FROM fragments
        ) SELECT id AS zone_id,residents*area/NULLIF(native_area,0) AS residents,geom,area
          FROM areas WHERE area>0`,
          [...bounds, JSON.stringify(populationCells)],
        );
        await manager.query("SET LOCAL statement_timeout='5s'");
        await manager.query('CREATE INDEX ON planning_demographic_base USING GIST(geom)');
        const totals = await manager.query<{ zoneId: number; residents: number }[]>(
          'SELECT zone_id AS "zoneId",sum(residents) AS residents FROM planning_demographic_base GROUP BY zone_id',
        );
        const baseTotals = new Map(totals.map((row) => [row.zoneId, row.residents]));
        const coverages = new Map<string, Promise<Map<number, number>>>();
        // Identical native demographic grids often share one validity mask. Values
        // still aggregate separately; only their identical resident-coverage work is reused.
        for (let start = 0; start < parsed.length; start += 2) {
          const rows = await Promise.all(
            parsed.slice(start, start + 2).map(async (input) => {
              signal.throwIfAborted();
              if (!input.source.rasterPath) return [];
              const raster = await readPopulationCells(input.source.rasterPath, bounds, {
                maxCells: 200000,
                timeoutMs: 10000,
                signal,
              }).catch((error: unknown) => {
                signal.throwIfAborted();
                if (error instanceof PopulationCellLimitError)
                  throw new BadRequestException(error.message);
                if (error instanceof PopulationRasterCapacityError)
                  throw new ServiceUnavailableException(error.message);
                if (isPopulationRasterReadError(error))
                  throw new ServiceUnavailableException(
                    'The imported demographic raster could not be read for this area. Ask the operator to repair or reimport the demographic reference, then retry.',
                  );
                throw error;
              });
              if (raster.pixelSizeMetres)
                result.pixelSizeMetres = Math.max(
                  result.pixelSizeMetres ?? 0,
                  raster.pixelSizeMetres,
                );
              const valid = raster.cells.filter((cell) => cell.value !== null);
              const mask = signature(valid.map((cell) => cell.geometry));
              let coverage = coverages.get(mask);
              if (!coverage) {
                coverage = manager
                  .query<{ zoneId: number; residents: number }[]>(
                    `WITH cells AS MATERIALIZED (
              SELECT ST_SetSRID(ST_GeomFromGeoJSON(value::text),4326) AS geom FROM jsonb_array_elements($1::jsonb)
            ) SELECT b.zone_id AS "zoneId",sum(CASE WHEN ST_Covers(c.geom,b.geom) THEN b.residents
                ELSE b.residents*ST_Area(ST_Intersection(b.geom,c.geom)::geography)/NULLIF(b.area,0) END) AS residents
              FROM cells c JOIN planning_demographic_base b ON b.geom&&c.geom GROUP BY b.zone_id`,
                    [JSON.stringify(valid.map((cell) => cell.geometry))],
                  )
                  .then(
                    (rows) =>
                      new Map(
                        rows.map((row) => [
                          row.zoneId,
                          Math.min(1, row.residents / (baseTotals.get(row.zoneId) || Infinity)),
                        ]),
                      ),
                  );
                coverages.set(mask, coverage);
              }
              // This connection serializes queries. Handle coverage failure before
              // issuing counts so an aborted transaction cannot orphan its rejection.
              const known = await coverage;
              const counts = await manager.query<{ zoneId: number; residents: number }[]>(
                `WITH zones AS (
            SELECT y*5+x+1 AS id,ST_MakeEnvelope($1::float8+x*($3::float8-$1::float8)/5,$2::float8+y*($4::float8-$2::float8)/5,$1::float8+(x+1)*($3::float8-$1::float8)/5,$2::float8+(y+1)*($4::float8-$2::float8)/5,4326) AS geom
            FROM generate_series(0,4)x CROSS JOIN generate_series(0,4)y
          ),raw_cells AS MATERIALIZED (
            SELECT(value->>'value')::float8 AS residents,ST_SetSRID(ST_GeomFromGeoJSON((value->'geometry')::text),4326) AS geom
            FROM jsonb_array_elements($5::jsonb) WHERE value->>'value' IS NOT NULL
          ),cells AS MATERIALIZED (
            SELECT *,ST_Area(geom::geography) AS area FROM raw_cells
          ) SELECT z.id AS "zoneId",COALESCE(sum(c.residents*CASE WHEN ST_Covers(z.geom,c.geom) THEN 1
              ELSE ST_Area(ST_Intersection(c.geom,z.geom)::geography)/NULLIF(c.area,0) END),0) AS residents
            FROM zones z LEFT JOIN cells c ON c.geom&&z.geom GROUP BY z.id ORDER BY z.id`,
                [...bounds, JSON.stringify(raster.cells)],
              );
              signal.throwIfAborted();
              return counts.map((cell) => ({
                ...cell,
                coverage: known.get(cell.zoneId) ?? 0,
                ageBand: input.ageBand,
                sex: input.sex,
              }));
            }),
          );
          result.cells.push(...rows.flat());
        }
      })
      .catch((error: unknown) => {
        signal.throwIfAborted();
        if (error && typeof error === 'object' && 'code' in error && error.code === '57014')
          throw new ServiceUnavailableException(
            'Demographic qualification timed out for this study area. Retry when the service is less busy or choose a smaller area.',
          );
        throw error;
      });
    return result;
  }
}

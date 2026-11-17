import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import type {
  AgencyPlanningDraftV1,
  SavedAgencyPlanningDraft,
} from '@abonten/contracts/planning-draft';
import type {
  PlanningAgentEvent,
  PlanningAgentFace,
  PlanningAgentStudy,
  PlanningAgentTurnRequest,
} from '@abonten/contracts/planning-agent';
import type { PlanningStudyJob, PlanningStudyResult } from '@abonten/contracts/planning-study';
import { MarketplaceService } from '../marketplace/marketplace.service';
import type { SiteFaceEntity, RateCardEntity } from '../common/entities';
import { findMarket } from '../common/supported-markets';
import { PlanningDraftsService, type PlanningDraftActor } from './planning-drafts.service';
import { normalizePlanningDraft } from './planning-drafts.validation';
import { PlanningStudyService } from './planning-study.service';
import { PlanningService } from './planning.service';
import {
  estimateFaceCost,
  parsePlanningAmount,
  planningStudyBasis,
  planningCoordinate,
  straightLineDistanceKm,
  type PlanningFace,
  type PlanningRateCard,
} from './planning-math';
import { normalizeStudy } from './planning-study.validation';
import { BUSINESS_CAMPAIGN_PERIODS, planningAudienceCapabilities } from './planning-brief-fields';
import type { PlanningAgentFunction } from './planning-agent.provider';

const string = { type: 'string' };
const nullableString = { type: ['string', 'null'] };
const refs = {
  type: 'array',
  maxItems: 100,
  items: {
    type: 'object',
    properties: { siteId: string, faceId: string },
    required: ['siteId', 'faceId'],
    additionalProperties: false,
  },
};
function tool(
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
): PlanningAgentFunction {
  return {
    type: 'function',
    name,
    description,
    strict: true,
    parameters: {
      type: 'object',
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}
export const PLANNING_AGENT_TOOLS = [
  tool(
    'inspect_plan',
    'Read the current working campaign, saved revision, audience capabilities and selected face facts.',
  ),
  tool('list_saved_plans', 'List the signed-in planner’s personal saved plans and alternatives.'),
  tool(
    'inspect_saved_plan',
    'Read one personal saved plan without changing the current working plan.',
    { draftId: string },
  ),
  tool(
    'edit_current_plan',
    'Apply a JSON merge patch to the working draft. Null removes an optional field; arrays replace. Use existing draft fields, including planning.brief.summary, planning.targetGroup (primary), planning.secondaryTargetGroup, planning.strategy, window, budget, currency, country, faces and modelControls. Model area, periods, objective and N use planning.strategy when present; modelControls holds routing sampling/display controls and audiencePlan carries display preferences. Preserve unspecified criteria. This does not save to the library.',
    { changesJson: string, name: nullableString },
  ),
  tool(
    'find_faces',
    'Search authorized marketplace faces for the current flight. Use study_area for the current campaign area. Use market only when the planner requests a wider search or area adjustment. Actual coordinates, distance and area membership are returned; never infer them from names. Counts and coverage are bounded to this page, not the whole market.',
    {
      search: nullableString,
      city: nullableString,
      format: nullableString,
      scope: { type: 'string', enum: ['study_area', 'market'] },
      page: { type: 'integer', minimum: 1, maximum: 10 },
    },
  ),
  tool(
    'inspect_faces',
    'Read authorized face availability, canonical flight cost and saved viewing facts. At most eight faces per call.',
    { faces: { ...refs, maxItems: 8 } },
  ),
  tool(
    'check_readiness',
    'Check audience qualification and missing face facts for the working plan without routing or changing it.',
  ),
  tool(
    'run_models',
    'Start the requested ADTM/AAM/Composite study from current campaign controls. Public road points and departure times are sent to Mapbox. Returns actual queued/running status; not completed metrics.',
  ),
  tool(
    'inspect_study',
    'Read actual status/results for an owned study; note whether its campaign basis matches the current working plan.',
    { studyId: nullableString },
  ),
  tool('cancel_study', 'Cancel an owned routing study, retaining its retry controls.', {
    studyId: nullableString,
  }),
  tool(
    'compare_faces',
    'Evaluate a face mix against retained journeys without changing the study or working plan. Audience, area, flight and periods must match the current plan.',
    {
      studyId: nullableString,
      faces: refs,
      minimumOpportunities: { type: ['integer', 'null'], minimum: 1 },
      objective: { type: ['string', 'null'], enum: ['reach', 'frequency', null] },
      budgetAmount: { type: ['number', 'null'], minimum: 0 },
    },
  ),
  tool(
    'save_current_plan',
    'Save the working plan using its owned saved revision, or create it once if it has never been saved.',
    { name: nullableString },
  ),
  tool(
    'save_alternative',
    'Save a separate alternative without replacing the current plan. Optional JSON merge patch uses the same draft fields as edit_current_plan.',
    { name: string, changesJson: nullableString },
  ),
];

export interface PlanningAgentState {
  request: PlanningAgentTurnRequest;
  actor: PlanningDraftActor;
  draft: AgencyPlanningDraftV1;
  draftName: string;
  savedDraft?: SavedAgencyPlanningDraft;
  study?: PlanningStudyJob;
  faces: Map<string, PlanningAgentFace>;
  alternatives: SavedAgencyPlanningDraft[];
  events: PlanningAgentEvent[];
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Provide tool arguments as an object.');
  return value as Record<string, unknown>;
}
function id(value: unknown) {
  if (typeof value !== 'string' || !isUUID(value))
    throw new BadRequestException('Choose a valid plan, study or face identifier.');
  return value.toLowerCase();
}
function text(value: unknown, limit: number, empty = false) {
  if (typeof value !== 'string' || value.length > limit || (!empty && !value.trim()))
    throw new BadRequestException('Provide a valid tool value.');
  return value.trim();
}
function faceRefs(value: unknown, limit = 100) {
  if (!Array.isArray(value) || value.length > limit)
    throw new BadRequestException(`Choose up to ${limit} faces.`);
  const result = value.map((item) => {
    const row = object(item);
    return { siteId: id(row.siteId), faceId: id(row.faceId) };
  });
  if (new Set(result.map((face) => face.faceId)).size !== result.length)
    throw new BadRequestException('Choose each face once.');
  return result;
}
function patch(base: unknown, changes: unknown, depth = 0): unknown {
  if (depth > 12) throw new BadRequestException('The plan patch is too deeply nested.');
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return changes;
  const result: Record<string, unknown> = {
    ...(base && typeof base === 'object' && !Array.isArray(base) ? base : {}),
  };
  for (const [key, value] of Object.entries(changes)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key))
      throw new BadRequestException('Invalid plan patch key.');
    if (value === null) delete result[key];
    else result[key] = patch(result[key], value, depth + 1);
  }
  return result;
}
function patchedDraft(draft: AgencyPlanningDraftV1, json: unknown) {
  const source = text(json, 64 * 1024);
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new BadRequestException('Provide a valid JSON object for the plan changes.');
  }
  const changes = object(value);
  const result = normalizePlanningDraft(patch(draft, changes));
  const planning = changes.planning;
  const primary =
    planning && typeof planning === 'object' && !Array.isArray(planning)
      ? (planning as Record<string, unknown>).targetGroup
      : null;
  const criteria =
    primary && typeof primary === 'object' && !Array.isArray(primary)
      ? (primary as Record<string, unknown>).criteria
      : undefined;
  // Empty objects are merge-patch no-ops; arrays/nulls are explicit choices, including Any.
  const hasChoice = (row: unknown): boolean =>
    row === null ||
    Array.isArray(row) ||
    (typeof row !== 'object' ? row !== undefined : Object.values(row).some(hasChoice));
  const replacesPrimary = criteria !== undefined && hasChoice(criteria);
  if (replacesPrimary && result.audiencePlan)
    result.audiencePlan = { ...result.audiencePlan, targetAudience: '' };
  return result;
}
const legacyTarget = (draft: AgencyPlanningDraftV1) =>
  draft.audiencePlan?.targetAudience.trim() ?? '';
function requirePrimaryTarget(draft: AgencyPlanningDraftV1) {
  const description = legacyTarget(draft);
  if (description)
    throw new BadRequestException({
      code: 'PRIMARY_TARGET_UNRESOLVED',
      message: `Define the primary audience before calculating. The earlier audience description is still active: “${description}”.`,
    });
}
function createId(requestId: string, action: string, content: unknown) {
  const bytes = createHash('sha256')
    .update(JSON.stringify([requestId, action, content]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, row: unknown) =>
    row && typeof row === 'object' && !Array.isArray(row)
      ? Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)))
      : row,
  );
}
interface AgentSite {
  id: string;
  name: string;
  format: string;
  latitude: unknown;
  longitude: unknown;
  isDemo?: boolean;
  isResearchReference?: boolean;
  faces: SiteFaceEntity[];
  rateCards: RateCardEntity[];
}
function coverage(targeting: PlanningStudyResult['targeting']) {
  const sec = targeting.sec;
  return {
    criterionCoverage: [
      ...(targeting.household ? ['Parent estimates cover co-resident biological parents.'] : []),
      ...(sec?.status === 'modeled'
        ? ['SEC is modeled from country-level adult survey profiles.']
        : []),
    ],
    ...(sec
      ? {
          sec: {
            status: sec.status,
            referenceVersion: sec.referenceVersion,
            geographicGrain: sec.geographicGrain,
            classifiedShare: sec.classifiedShare,
            unknownShare: sec.unknownShare,
            reasons: sec.reasons.slice(0, 4),
          },
        }
      : {}),
  };
}
export function compactAgentStudy(job: PlanningStudyJob): PlanningAgentStudy {
  const result = job.result;
  const base = result?.audience.scenarios.find((row) => row.id === 'base');
  const secondary = result?.secondary;
  const secondaryBase = secondary?.audience.scenarios.find((row) => row.id === 'base');
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    error: job.error,
    ...(result
      ? {
          resultStatus: result.status,
          targetingStatus: result.targeting.status,
          audienceStatus: result.audience.status,
          targetPopulation: result.targeting.population,
          reach1Plus: base?.reach1Plus ?? null,
          reachNPlus: base?.reachNPlus ?? null,
          averageFrequency: base?.averageOtsFrequency ?? null,
          recommendedFaceIds: result.composite.selectedFaceIds,
          recommendedCost: result.composite.totalCost,
          currency: result.composite.currency,
          reasons: [...new Set([...result.targeting.reasons, ...result.audience.reasons])].slice(
            0,
            8,
          ),
          ...coverage(result.targeting),
          ...(secondary
            ? {
                secondary: {
                  targetingStatus: secondary.targeting.status,
                  audienceStatus: secondary.audience.status,
                  targetPopulation: secondary.targeting.population,
                  reach1Plus: secondaryBase?.reach1Plus ?? null,
                  reachNPlus: secondaryBase?.reachNPlus ?? null,
                  averageFrequency: secondaryBase?.averageOtsFrequency ?? null,
                  reasons: [
                    ...new Set([...secondary.targeting.reasons, ...secondary.audience.reasons]),
                  ].slice(0, 8),
                  ...coverage(secondary.targeting),
                },
              }
            : {}),
        }
      : {}),
  };
}

@Injectable()
export class PlanningAgentTools {
  constructor(
    private readonly drafts: PlanningDraftsService,
    private readonly marketplace: MarketplaceService,
    private readonly planning: PlanningService,
    private readonly studies: PlanningStudyService,
  ) {}

  async authorize(actor: PlanningDraftActor) {
    // Recheck active agency membership before any provider transfer or receipt access.
    await this.drafts.list(actor);
  }

  async initialize(
    request: PlanningAgentTurnRequest,
    actor: PlanningDraftActor,
  ): Promise<PlanningAgentState> {
    const savedDraft = request.savedDraft
      ? await this.drafts.get(actor, request.savedDraft.id)
      : undefined;
    if (savedDraft && savedDraft.revision !== request.savedDraft!.revision)
      throw new ConflictException({
        code: 'DRAFT_REVISION_CONFLICT',
        message: 'This saved plan changed elsewhere. Reload it before asking the agent to edit it.',
      });
    const study = request.studyId ? await this.studies.get(actor, request.studyId) : undefined;
    const state: PlanningAgentState = {
      request,
      actor,
      draft: request.draft,
      draftName: request.draftName,
      savedDraft,
      study,
      faces: new Map(),
      alternatives: [],
      events: [],
    };
    if (
      study &&
      (legacyTarget(state.draft) ||
        !findMarket(state.draft.country) ||
        planningStudyBasis(study.request) !== planningStudyBasis(this.studyContext(state)))
    )
      state.study = undefined;
    return state;
  }
  context(state: PlanningAgentState) {
    return {
      draft: state.draft,
      draftName: state.draftName,
      savedDraft: state.savedDraft
        ? { id: state.savedDraft.id, revision: state.savedDraft.revision }
        : null,
      study: state.study ? compactAgentStudy(state.study) : null,
      studyArea: this.studyArea(state),
      retainedStudyId:
        state.study?.id ?? state.request.studyId ?? state.draft.modelControls?.studyId ?? null,
      audienceCapabilities: planningAudienceCapabilities(
        findMarket(state.draft.country)?.code ?? state.draft.country,
      ),
      campaignPeriods: BUSINESS_CAMPAIGN_PERIODS,
      editMeaning: 'Working-plan changes are returned to the form; only save tools persist them.',
    };
  }
  private studyContext(state: PlanningAgentState) {
    const draft = state.draft;
    const market = findMarket(draft.country);
    if (!market) throw new BadRequestException('Choose a supported market before running models.');
    const strategy = draft.planning?.strategy,
      controls = draft.modelControls;
    const geography = strategy?.geography;
    return {
      countryCode: market.code,
      center: geography?.center ??
        controls?.center ?? { latitude: market.center[1], longitude: market.center[0] },
      radiusKm: geography?.radiusKm ?? controls?.radiusKm ?? 2,
      timeZone: market.timezone,
      flight: draft.window,
      dayparts: [...(strategy?.dayparts ?? BUSINESS_CAMPAIGN_PERIODS)],
      sampling: controls?.sampling ?? { mode: 'recommended' },
      target: draft.planning?.targetGroup.criteria ?? controls?.target ?? {},
      ...(draft.planning?.secondaryTargetGroup
        ? { secondaryTarget: draft.planning.secondaryTargetGroup.criteria }
        : {}),
      digitalAllocations: controls?.digitalAllocations ?? [],
    };
  }
  private studyArea(state: PlanningAgentState) {
    if (!findMarket(state.draft.country)) return null;
    const { center, radiusKm } = this.studyContext(state);
    return { center, radiusKm };
  }
  private faceGeography(
    state: PlanningAgentState,
    site: Pick<AgentSite, 'latitude' | 'longitude'>,
  ) {
    const coordinates = {
      latitude: planningCoordinate(site.latitude, 'latitude'),
      longitude: planningCoordinate(site.longitude, 'longitude'),
    };
    const area = this.studyArea(state);
    const distance = area ? straightLineDistanceKm(area.center, coordinates) : null;
    const { latitude, longitude } = coordinates;
    return {
      coordinates,
      distanceFromStudyCenterKm: distance,
      insideStudyArea: area && distance !== null ? distance <= area.radiusKm : null,
      // Match the study service's expanded rectangular travel-catchment check.
      insideStudyCatchment:
        area && latitude !== null && longitude !== null
          ? Math.abs(latitude - area.center.latitude) * 111.195 <= (area.radiusKm * 5) / 3 &&
            Math.abs(longitude - area.center.longitude) *
              111.195 *
              Math.cos((area.center.latitude * Math.PI) / 180) <=
              (area.radiusKm * 5) / 3
          : null,
    };
  }
  private studyRequest(state: PlanningAgentState, readinessOnly = false) {
    const draft = state.draft;
    requirePrimaryTarget(draft);
    const strategy = draft.planning?.strategy;
    const amount = parsePlanningAmount(draft.budget);
    if (amount === null)
      throw new BadRequestException('Enter a valid campaign budget before running models.');
    return normalizeStudy(
      {
        ...this.studyContext(state),
        budget: { amount, currency: draft.currency },
        objective: strategy?.objective ?? draft.audiencePlan?.objective ?? 'reach',
        minimumOpportunities:
          strategy?.minimumOpportunities ?? Number(draft.audiencePlan?.minimumOpportunities ?? 4),
        faces: draft.faces.map(({ siteId, faceId }) => ({ siteId, faceId })),
        selectedFaceIds: draft.faces.map((face) => face.faceId),
        ...(draft.planning ? { planning: draft.planning } : {}),
        confirmPublicRoadTransfer: true,
      },
      { readinessOnly },
    );
  }
  private async ownedStudy(state: PlanningAgentState, value: unknown) {
    const studyId =
      value === null || value === undefined
        ? (state.study?.id ?? state.draft.modelControls?.studyId ?? state.request.studyId)
        : id(value);
    if (!studyId)
      throw new BadRequestException('Choose an existing study or run the current plan first.');
    return this.studies.get(state.actor, studyId);
  }
  private async faceFacts(
    state: PlanningAgentState,
    references: { siteId: string; faceId: string }[],
    signal: AbortSignal,
    cache = new Map<string, AgentSite>(),
  ) {
    const result: (PlanningAgentFace & { viewingFacts: unknown })[] = [];
    const availabilityCache = new Map<
      string,
      Awaited<ReturnType<PlanningService['siteOptions']>>
    >();
    for (const ref of references) {
      signal.throwIfAborted();
      let site = cache.get(ref.siteId);
      if (!site) {
        site = (await this.marketplace.getMarketplaceSite(
          ref.siteId,
          signal,
          state.actor.organizationId,
        )) as AgentSite;
        cache.set(ref.siteId, site);
      }
      if (site.isDemo) continue;
      const face = site.faces.find((row) => row.id === ref.faceId);
      if (!face)
        throw new BadRequestException('A requested face is not visible on the authorized site.');
      let options = availabilityCache.get(ref.siteId);
      if (!options) {
        options = await this.planning.siteOptions(
          ref.siteId,
          state.draft.window,
          state.actor.organizationId,
        );
        availabilityCache.set(ref.siteId, options);
      }
      const available = options.faces.find((row) => row.faceId === ref.faceId)?.available;
      const availability =
        available === true
          ? ('available' as const)
          : available === false
            ? ('unavailable' as const)
            : ('unknown' as const);
      const cost = estimateFaceCost(
        {
          ...site,
          rateCards: site.rateCards.map((row) => ({
            ...row,
            siteId: ref.siteId,
            effectiveFrom: new Date(row.effectiveFrom).toISOString(),
            effectiveTo: row.effectiveTo ? new Date(row.effectiveTo).toISOString() : null,
          })) as PlanningRateCard[],
        },
        face as PlanningFace,
        state.draft.window,
        state.draft.currency,
        { status: availability, window: state.draft.window, checkedAt: options.checkedAt },
      );
      const summary: PlanningAgentFace = {
        ...ref,
        siteName: String(site.name),
        faceLabel: face.faceLabel,
        format: String(site.format),
        researchReference: !!site.isResearchReference,
        ...this.faceGeography(state, site),
        availability,
        cost: cost.status === 'ready' ? cost.amount : null,
        currency: cost.status === 'ready' ? cost.currency : state.draft.currency,
        ...(cost.status === 'unavailable' ? { costReason: cost.reason } : {}),
      };
      state.faces.set(ref.faceId, summary);
      result.push({ ...summary, viewingFacts: face.planningProfile ?? null });
    }
    return result;
  }
  private async validateChangedSelection(
    state: PlanningAgentState,
    draft: AgencyPlanningDraftV1,
    signal: AbortSignal,
  ) {
    if (
      stableJson([draft.faces, draft.window]) ===
      stableJson([state.draft.faces, state.draft.window])
    )
      return;
    const facts = await this.faceFacts({ ...state, draft, faces: new Map() }, draft.faces, signal);
    if (
      facts.length !== draft.faces.length ||
      facts.some((face) => face.availability === 'unavailable')
    )
      throw new BadRequestException(
        'A selected face is unavailable or outside authorized planning inventory.',
      );
  }
  async execute(
    state: PlanningAgentState,
    name: string,
    value: unknown,
    signal: AbortSignal,
  ): Promise<{
    output: unknown;
    label: string;
    applied?: boolean;
    facts?: PlanningAgentEvent['facts'];
  }> {
    signal.throwIfAborted();
    const args = object(value);
    switch (name) {
      case 'inspect_plan':
        return {
          label: 'Current plan',
          output: {
            ...this.context(state),
            selectedFaces: await this.faceFacts(state, state.draft.faces.slice(0, 8), signal),
            omittedFaces: Math.max(0, state.draft.faces.length - 8),
          },
        };
      case 'list_saved_plans': {
        const plans = await this.drafts.list(state.actor);
        return {
          label: 'Saved plans',
          facts: { plans: plans.items.length },
          output: {
            ...plans,
            items: plans.items.map(({ id, name, revision, updatedAt }) => ({
              id,
              name,
              revision,
              updatedAt,
            })),
          },
        };
      }
      case 'inspect_saved_plan':
        return {
          label: 'Saved plan',
          output: await this.drafts.get(state.actor, id(args.draftId)),
        };
      case 'edit_current_plan': {
        const draft = patchedDraft(state.draft, args.changesJson);
        const name = args.name === null ? state.draftName : text(args.name, 80);
        await this.validateChangedSelection(state, draft, signal);
        signal.throwIfAborted();
        state.draft = draft;
        state.draftName = name;
        for (const face of state.faces.values())
          state.faces.set(face.faceId, { ...face, ...this.faceGeography(state, face.coordinates) });
        if (
          state.study &&
          (legacyTarget(draft) ||
            !findMarket(draft.country) ||
            planningStudyBasis(state.study.request) !==
              planningStudyBasis(this.studyContext(state)))
        )
          state.study = undefined;
        return {
          label: 'Working plan updated',
          applied: true,
          facts: { faces: draft.faces.length, saved: false },
          output: { draft, name: state.draftName, saved: false },
        };
      }
      case 'find_faces': {
        if (args.scope !== 'study_area' && args.scope !== 'market')
          throw new BadRequestException('Choose a search in the study area or the wider market.');
        const area = this.studyArea(state);
        if (args.scope === 'study_area' && !area)
          throw new BadRequestException(
            'Choose a planning area before searching for nearby faces.',
          );
        const search = args.search === null ? undefined : text(args.search, 160, true);
        const city = args.city === null ? undefined : text(args.city, 80, true);
        const format =
          args.format === null ? state.draft.format || undefined : text(args.format, 40, true);
        if (!Number.isInteger(args.page) || Number(args.page) < 1 || Number(args.page) > 10)
          throw new BadRequestException('Choose a marketplace page from 1 to 10.');
        const found = await this.marketplace.search(
          {
            search,
            city,
            format,
            country: state.draft.country || undefined,
            startDate: state.draft.window.startDate,
            endDate: state.draft.window.endDate,
            page: Number(args.page),
            limit: 8,
            ...(args.scope === 'study_area' && area
              ? {
                  lat: area.center.latitude,
                  lng: area.center.longitude,
                  radius: area.radiusKm,
                }
              : {}),
          },
          signal,
          state.actor.organizationId,
        );
        const faces: { siteId: string; faceId: string }[] = [];
        const cache = new Map<string, AgentSite>();
        let outsideAreaSites = 0,
          unlocatedSites = 0;
        for (const item of found.items) {
          if (item.isDemo) continue;
          const site = (await this.marketplace.getMarketplaceSite(
            String(item.id),
            signal,
            state.actor.organizationId,
          )) as AgentSite;
          if (args.scope === 'study_area') {
            const geography = this.faceGeography(state, site);
            if (geography.insideStudyArea === null) {
              unlocatedSites++;
              continue;
            }
            if (!geography.insideStudyArea) {
              outsideAreaSites++;
              continue;
            }
          }
          cache.set(site.id, site);
          for (const face of site.faces.filter((face) => face.bookable || site.isResearchReference))
            if (faces.length < 12) faces.push({ siteId: String(site.id), faceId: face.id });
        }
        const facts = await this.faceFacts(state, faces, signal, cache);
        return {
          label: 'Faces found',
          facts: {
            faces: facts.length,
            sitesInPage: found.items.length,
            sourceMatchingSites: found.total,
            scope: args.scope,
          },
          output: {
            faces: facts,
            page: found.page,
            sourceMatchingSites: found.total,
            scope: args.scope,
            studyArea: area,
            omittedOutsideAreaSites: outsideAreaSites,
            omittedUnlocatedSites: unlocatedSites,
            boundedSearch: true,
          },
        };
      }
      case 'inspect_faces': {
        const faces = await this.faceFacts(state, faceRefs(args.faces, 8), signal);
        return { label: 'Face facts', facts: { faces: faces.length }, output: faces };
      }
      case 'check_readiness': {
        const readiness = await this.studies.preflight(
          state.actor,
          this.studyRequest(state, true),
          signal,
        );
        return {
          label: 'Planning readiness',
          facts: { status: readiness.status, targetPopulation: readiness.targeting.population },
          output: readiness,
        };
      }
      case 'run_models': {
        const request = this.studyRequest(state);
        const draft = normalizePlanningDraft({
          ...state.draft,
          modelControls: {
            version: 1,
            ...(state.draft.modelControls ?? {}),
            center: request.center,
            radiusKm: request.radiusKm,
            sampling: request.sampling,
            target: request.target,
            secondaryTarget: request.secondaryTarget,
          },
        });
        const job = await this.studies.create(state.actor, request);
        state.study = job;
        state.draft = { ...draft, modelControls: { ...draft.modelControls!, studyId: job.id } };
        return {
          label: 'Study started',
          applied: true,
          facts: { studyId: job.id, status: job.status },
          output: compactAgentStudy(job),
        };
      }
      case 'inspect_study': {
        const job = await this.ownedStudy(state, args.studyId);
        return {
          label: 'Study results',
          facts: { studyId: job.id, status: job.status },
          output: {
            ...compactAgentStudy(job),
            appliesToCurrentPlan:
              !legacyTarget(state.draft) &&
              planningStudyBasis(job.request) === planningStudyBasis(this.studyContext(state)),
          },
        };
      }
      case 'cancel_study': {
        const current = await this.ownedStudy(state, args.studyId);
        const job = await this.studies.cancel(state.actor, current.id);
        if (state.study?.id === job.id) state.study = job;
        return {
          label: 'Study cancellation',
          applied: job.status === 'cancelled',
          facts: { studyId: job.id, status: job.status },
          output: compactAgentStudy(job),
        };
      }
      case 'compare_faces': {
        requirePrimaryTarget(state.draft);
        const job = await this.ownedStudy(state, args.studyId);
        if (planningStudyBasis(job.request) !== planningStudyBasis(this.studyContext(state)))
          throw new ConflictException(
            'The current audiences, area, periods or flight differ. Run this plan before comparing faces.',
          );
        const faces = faceRefs(args.faces);
        const amount = args.budgetAmount ?? parsePlanningAmount(state.draft.budget);
        if (amount === null)
          throw new BadRequestException(
            'Enter a valid campaign budget before comparing face costs.',
          );
        const result = await this.studies.compare(state.actor, job.id, {
          faces,
          digitalAllocations: state.draft.modelControls?.digitalAllocations ?? [],
          faceIds: faces.map((face) => face.faceId),
          minimumOpportunities: args.minimumOpportunities ?? job.request.minimumOpportunities,
          objective: args.objective ?? job.request.objective,
          budget: {
            amount,
            currency: state.draft.currency,
          },
        });
        const base = result.audience.scenarios.find((row) => row.id === 'base');
        return {
          label: 'Face mix compared',
          facts: {
            faces: faces.length,
            reach1Plus: base?.reach1Plus ?? null,
            reachNPlus: base?.reachNPlus ?? null,
            status: result.audience.status,
          },
          output: {
            ...compactAgentStudy({ ...job, result: { ...result, routes: [] } }),
            comparedFaces: faces.map((face) => face.faceId),
            currentStudyUnchanged: true,
          },
        };
      }
      case 'save_current_plan': {
        const name = args.name === null ? state.draftName : text(args.name, 80);
        const unchanged =
          state.savedDraft &&
          state.savedDraft.name === name &&
          stableJson(state.savedDraft.draft) === stableJson(state.draft);
        const saved = unchanged
          ? state.savedDraft!
          : state.savedDraft
            ? await this.drafts.update(state.actor, state.savedDraft.id, {
                name,
                draft: state.draft,
                revision: state.savedDraft.revision,
              })
            : await this.drafts.create(state.actor, {
                name,
                draft: state.draft,
                clientRequestId: createId(state.request.requestId, 'save_current_plan', [
                  name,
                  state.draft,
                ]),
              });
        state.savedDraft = saved;
        state.draftName = saved.name;
        return {
          label: 'Current plan saved',
          applied: true,
          facts: { savedDraftId: saved.id, revision: saved.revision },
          output: saved,
        };
      }
      case 'save_alternative': {
        const name = text(args.name, 80);
        const draft =
          args.changesJson === null ? state.draft : patchedDraft(state.draft, args.changesJson);
        await this.validateChangedSelection(state, draft, signal);
        signal.throwIfAborted();
        const saved = await this.drafts.create(state.actor, {
          name,
          draft,
          clientRequestId: createId(state.request.requestId, 'save_alternative', [name, draft]),
        });
        if (!state.alternatives.some((row) => row.id === saved.id)) state.alternatives.push(saved);
        return {
          label: 'Alternative saved',
          applied: true,
          facts: { alternativeId: saved.id, revision: saved.revision },
          output: saved,
        };
      }
      default:
        throw new BadRequestException('This platform tool is not available.');
    }
  }
}

import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Inject,
  Optional,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { demoVisibilitySql, demoDisclosure } from '../common/demo-inventory';
import { researchDisclosure, type ResearchProvenance } from '../common/research-inventory';
import { GeographicContextService } from '../enrichment/geographic-context.service';
import { compactPlanningSnapshot, PlanningSnapshotTooLargeError } from './planning-snapshot';
import { canonicalRecommendationOutput, canonicalPlanningControls } from './planning-output';
import { planningScoringCandidates } from './planning-scoring-adapter';
import {
  effectiveBriefFitConfig,
  scorePlanningFace,
  comparePlanningAssessments,
  selectPlanningPortfolio,
  type PlanningScoringBrief,
  type PlanningFaceAssessment,
} from './planning-scoring';
import { normalizeFitPreferences } from './planning-drafts.validation';
import { derivePlanningRetrieval, consentSafeProviderRequest } from './planning-retrieval';
import {
  projectPlanningEnrichment,
  type PlanningEnrichmentMetadata,
  type PlanningEnrichmentProjection,
} from './planning-enrichment';
import { DatabaseService } from '../common/database.service';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { extractConstraints } from './brief-constraints';
import {
  emitPlanningTelemetry,
  planningRequestId,
  PLANNING_TELEMETRY_SINK,
  safeProviderCode,
  type PlanningOutcome,
  type PlanningTelemetrySink,
} from './planning-telemetry';
import { AssistantMessageDto, PlannerAssessmentDto, SiteOptionsQueryDto } from './dto/planning.dto';
import {
  OpenAiPlannerProvider,
  PLANNER_MODEL,
  type PlannerAdmission,
} from './openai-planner.provider';
import {
  estimateFaceCost,
  faceFlightEligibility,
  planningDays,
  planningCoordinate,
  selectionDistances,
  summarizeBudget,
  summarizeResearchPrices,
  type FaceCostEstimate,
  type PlanningFace,
  type PlanningRateCard,
  type PlanningWindow,
} from './planning-math';

@Injectable()
export class PlanningService {
  constructor(
    private readonly db: DatabaseService,
    private readonly marketplace: MarketplaceService,
    @Optional() private readonly provider?: OpenAiPlannerProvider,
    @Optional() @Inject(PLANNING_TELEMETRY_SINK) private readonly telemetry?: PlanningTelemetrySink,
    @Optional() private readonly geographic?: GeographicContextService,
  ) {}

  assistantStatus() {
    return {
      mode: this.provider?.configured ? ('openai' as const) : ('local' as const),
      provider: this.provider?.configured ? ('openai' as const) : null,
      model: this.provider?.configured ? PLANNER_MODEL : null,
      aiAvailable: Boolean(this.provider?.configured),
      message: this.provider?.configured
        ? 'OpenAI planning is configured. Briefs remain local unless you explicitly consent to share confirmed text.'
        : 'AI is not connected. Local planning help and document text extraction are available.',
      documentFormats: ['pdf', 'pptx', 'xlsx', 'docx', 'txt', 'csv', 'tsv', 'md'],
      maxUploadBytes: 10 * 1024 * 1024,
      documentsRetained: false,
      externalTransfer: Boolean(this.provider?.configured),
    };
  }

  assist(dto: AssistantMessageDto) {
    const constraints = extractConstraints(`${dto.message}\n${dto.briefText ?? ''}`);
    const french = dto.locale === 'fr';
    const missing: string[] = [];
    if (constraints.budget === null) missing.push('budget');
    if (constraints.currency === null) missing.push(french ? 'devise' : 'currency');
    if (!constraints.startDate || !constraints.endDate)
      missing.push(french ? 'dates de diffusion' : 'flight dates');
    if (!constraints.cities.length) missing.push(french ? 'marché ou ville' : 'market or city');
    let message = french
      ? 'Aide locale à la planification : confirmez le marché, le budget, la devise et les dates de diffusion, puis sélectionnez des faces sur la carte pour comparer les tarifs publiés et les distances à vol d’oiseau.'
      : 'Local planning help: confirm your market, budget, currency and flight dates, then shortlist faces on the map to compare available rate cards and straight-line distances.';
    if (/distance|apart|route|travel|trajet|voyage|écart/i.test(dto.message))
      message = french
        ? 'Ajoutez au moins deux panneaux à votre sélection pour comparer les distances à vol d’oiseau en kilomètres. Ces estimations sont géodésiques ; la distance routière et le temps de trajet nécessitent un service de calcul d’itinéraire.'
        : 'Add at least two boards to your shortlist to compare straight-line distances in kilometres. These are geodesic estimates; driving distance and travel time require a routing provider.';
    else if (/reach|population|traffic|trafic|impression|portée|\bots\b/i.test(dto.message))
      message = french
        ? 'Les estimations d’opportunités de voir nécessitent des observations de trafic de production utilisables, des hypothèses de visibilité et une période de diffusion confirmée. La population résidentielle est un contexte géographique. Les impressions brutes peuvent inclure des expositions répétées ; la couverture dédupliquée nécessite un modèle d’audience.'
        : 'Opportunity-to-see estimates require usable production traffic observations, visibility assumptions and a confirmed flight. Residential population is geographic context. Gross impressions are potential repeat exposures; deduplicated reach needs an audience model.';
    else if (/budget|recommend|recommand|afford|cost|price|prix|coût|cout/i.test(dto.message))
      message = french
        ? 'Confirmez le budget, la devise et les dates de diffusion, puis utilisez l’adéquation au budget pour trouver des faces disponibles selon les tarifs publiés. Les estimations du coût média excluent les taxes, l’impression et la production. Les conversions de devises nécessitent une référence de change approuvée.'
        : 'Confirm budget, currency and flight dates, then use Budget fit to find available faces priced from published rate cards. Media cost estimates exclude tax, print and production. Cross-currency rates require an approved FX reference.';
    return {
      mode: 'local' as const,
      provider: null,
      model: null,
      aiAvailable: false,
      briefShared: false,
      recommendations: [],
      questions: [],
      message,
      constraints,
      missing,
      requiresConfirmation: true as const,
    };
  }

  private activeAssessments = 0;
  private readonly assessmentRequests = new Map<string, { started: number; count: number }>();

  async assess(
    dto: PlannerAssessmentDto,
    scope: { userId: string; orgId: string; user?: AuthenticatedUser },
    signal?: AbortSignal,
  ) {
    if (!scope.userId || !scope.orgId)
      throw new ForbiddenException('An authorized organization context is required.');
    checkCancelled(signal);
    const now = Date.now();
    const key = `${scope.orgId}:${scope.userId}`;
    for (const [key, entry] of this.assessmentRequests)
      if (now - entry.started >= 60000) this.assessmentRequests.delete(key);
    const entry = this.assessmentRequests.get(key) ?? { started: now, count: 0 };
    if (this.activeAssessments >= 4 || entry.count >= 30)
      throw new HttpException('Planning assessment capacity reached. Please retry manually.', 429);
    if (this.assessmentRequests.size >= 2048 && !this.assessmentRequests.has(key))
      throw new HttpException('Planning assessment capacity reached. Please retry manually.', 429);
    entry.count++;
    this.assessmentRequests.set(key, entry);
    this.activeAssessments++;
    const abort = new AbortController();
    let timedOut = false;
    const cancel = () => abort.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 30000);
    let stop: () => void = () => {};
    const interrupted = new Promise<never>((_resolve, reject) => {
      stop = () =>
        reject(
          new HttpException(
            timedOut
              ? 'Planning assessment timed out. Please retry manually.'
              : 'The planner request was cancelled.',
            timedOut ? 504 : 499,
          ),
        );
      abort.signal.addEventListener('abort', stop, { once: true });
      if (abort.signal.aborted) stop();
    });
    const running = this.performAssessment(dto, scope, abort.signal).finally(() => {
      this.activeAssessments--;
    });
    try {
      return await Promise.race([running, interrupted]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      abort.signal.removeEventListener('abort', stop);
    }
  }

  private async performAssessment(
    dto: PlannerAssessmentDto,
    scope: { userId: string; orgId: string; user?: AuthenticatedUser },
    signal = new AbortController().signal,
  ) {
    if (!scope.userId || !scope.orgId)
      throw new ForbiddenException('An authorized organization context is required.');
    checkCancelled(signal);
    if (dto.context?.fitPreferences) normalizeFitPreferences(dto.context.fitPreferences);
    const request: AssistantMessageDto = {
      locale: dto.locale,
      context: dto.context,
      message: 'Assess confirmed planning controls.',
    };
    const facts = await this.ground(request, scope, signal, true);
    checkCancelled(signal);
    return {
      ...this.assist(request),
      ...canonicalRecommendationOutput(deterministicChoice(facts), facts, dto.locale ?? 'en'),
      ...canonicalPlanningControls(facts, dto.locale ?? 'en'),
      assessment: facts.assessment,
      facts,
    };
  }

  async plan(
    dto: AssistantMessageDto,
    scope: { userId: string; orgId: string; user?: AuthenticatedUser },
    signal?: AbortSignal,
  ) {
    const requestId = planningRequestId();
    const startedAt = performance.now();
    const configured = Boolean(this.provider?.configured);
    let phase: string = 'admission';
    let outcome: PlanningOutcome = configured ? 'success' : 'local_success';
    let status = 201;
    let providerCode: unknown;
    let grounding: unknown;
    try {
      return await this.executePlan(dto, scope, signal, requestId, (value, facts) => {
        phase = value;
        if (facts) grounding = facts;
      });
    } catch (error) {
      status = error instanceof HttpException ? error.getStatus() : 500;
      if (error instanceof HttpException) {
        const response = error.getResponse();
        providerCode = safeProviderCode(
          typeof response === 'object' && response !== null && 'providerCode' in response
            ? response.providerCode
            : undefined,
        );
      }
      outcome =
        status === 499
          ? 'cancelled'
          : status === 504
            ? 'timeout'
            : status === 429
              ? 'rate_limited'
              : status === 400 || status === 403 || status === 413
                ? 'validation_error'
                : phase === 'reference'
                  ? 'invalid_reference'
                  : phase === 'provider'
                    ? 'provider_error'
                    : 'grounding_error';
      throw error;
    } finally {
      emitPlanningTelemetry(
        {
          event: 'agency_planner.plan',
          requestId,
          model: configured ? PLANNER_MODEL : null,
          mode: configured ? 'openai' : 'local',
          outcome,
          status,
          latencyMs: performance.now() - startedAt,
          providerCode,
          grounding,
        },
        this.telemetry,
      );
    }
  }

  private async executePlan(
    dto: AssistantMessageDto,
    scope: { userId: string; orgId: string; user?: AuthenticatedUser },
    signal: AbortSignal | undefined,
    requestId: string,
    progress: (phase: 'grounding' | 'provider' | 'reference', grounding?: unknown) => void,
  ) {
    if (!scope.userId || !scope.orgId)
      throw new ForbiddenException('An authorized organization context is required.');
    checkCancelled(signal);
    // Reject excess requests before any marketplace search or database grounding.
    const admission = this.provider?.configured
      ? this.provider.admit(scope, signal, requestId)
      : undefined;
    const abort = new AbortController();
    let timedOut = false;
    const cancel = () => abort.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 30000);
    let rejectAbort: (error: HttpException) => void = () => {};
    const interrupted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const stop = () =>
      rejectAbort(
        new HttpException(
          timedOut
            ? 'The AI planner timed out. Please retry manually.'
            : 'The planner request was cancelled.',
          timedOut ? 504 : 499,
        ),
      );
    abort.signal.addEventListener('abort', stop, { once: true });
    if (abort.signal.aborted) stop();
    try {
      // An interrupted database query may still be running. Keep admission until
      // it settles, rather than admitting another expensive request immediately.
      const running = this.runPlan(dto, scope, abort.signal, admission, progress).finally(() =>
        admission?.release(),
      );
      return await Promise.race([running, interrupted]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      abort.signal.removeEventListener('abort', stop);
    }
  }

  private async runPlan(
    dto: AssistantMessageDto,
    scope: { userId: string; orgId: string; user?: AuthenticatedUser },
    signal: AbortSignal,
    admission?: PlannerAdmission,
    progress?: (phase: 'grounding' | 'provider' | 'reference', grounding?: unknown) => void,
  ) {
    checkCancelled(signal);
    progress?.('grounding');
    const local = this.assist(dto);
    const providerRequest = this.provider?.configured ? consentSafeProviderRequest(dto) : dto;
    const facts = await this.ground(providerRequest, scope, signal);
    checkCancelled(signal);
    progress?.('grounding', facts.retrieval);
    if (!this.provider?.configured)
      return {
        ...local,
        ...canonicalRecommendationOutput(deterministicChoice(facts), facts, dto.locale ?? 'en'),
        ...canonicalPlanningControls(facts, dto.locale ?? 'en'),
        assessment: facts.assessment,
        facts,
      };
    const briefShared = dto.shareBriefWithProvider === true && Boolean(dto.briefText?.trim());
    progress?.('provider');
    let snapshot: ReturnType<typeof compactPlanningSnapshot<typeof facts>>;
    try {
      snapshot = compactPlanningSnapshot(facts);
    } catch (error) {
      if (error instanceof PlanningSnapshotTooLargeError)
        throw new PayloadTooLargeException(error.message);
      throw error;
    }
    const model = await this.provider.complete(
      {
        locale: dto.locale ?? 'en',
        message: dto.message,
        briefText: briefShared ? dto.briefText : undefined,
        // A previous response can paraphrase a brief. Drop history without consent.
        history: dto.briefText !== undefined && !briefShared ? [] : (providerRequest.history ?? []),
        snapshot,
      },
      scope,
      signal,
      admission,
    );
    progress?.('reference');
    const allowed = new Set(
      snapshot.sites
        .filter((site) => !site.isDemo)
        .flatMap((site) =>
          site.faces
            .filter((face) => face.availability !== 'unavailable')
            .map((face) => `${site.siteId}:${face.faceId}`),
        ),
    );
    const recommendations = new Set<string>();
    const groundedRecommendations = model.recommendations.map((rec) => ({
      siteId: rec.siteId.toLowerCase(),
      faceId: rec.faceId.toLowerCase(),
    }));
    for (const rec of groundedRecommendations) {
      const key = `${rec.siteId}:${rec.faceId}`;
      if (!allowed.has(key) || recommendations.has(key))
        throw new BadGatewayException(
          'The planner referenced unavailable or unverified inventory. Please retry manually.',
        );
      recommendations.add(key);
    }
    return {
      ...local,
      mode: 'openai' as const,
      provider: 'openai' as const,
      model: PLANNER_MODEL,
      aiAvailable: true,
      ...canonicalRecommendationOutput(
        { ...model, recommendations: deterministicChoice(facts).recommendations },
        facts,
        dto.locale ?? 'en',
      ),
      assessment: facts.assessment,
      ...canonicalPlanningControls(facts, dto.locale ?? 'en'),
      briefShared,
      facts,
    };
  }

  private async ground(
    dto: AssistantMessageDto,
    scope: { userId: string; orgId: string; user?: AuthenticatedUser },
    signal: AbortSignal,
    localOnly = false,
  ) {
    const context =
      this.provider?.configured && !localOnly
        ? consentSafeProviderRequest(dto).context
        : dto.context;
    if (context?.fitPreferences) normalizeFitPreferences(context.fitPreferences);
    const retrieval = derivePlanningRetrieval(dto);
    // Only the consent-safe intent may influence any facts or choices sent externally.
    const intent = this.provider?.configured && !localOnly ? retrieval.provider : retrieval.local;
    const window = intent.window;
    if (
      context?.window &&
      (planningDays(context.window) === null || planningDays(context.window)! > 366)
    )
      throw new BadRequestException(
        'Choose a valid inclusive start and exclusive end date within 366 days.',
      );
    if (window && (planningDays(window) === null || planningDays(window)! > 366))
      throw new BadRequestException(
        'Choose a valid inclusive start and exclusive end date within 366 days.',
      );
    const selectedSites = canonicalIds(context?.selectedSiteIds ?? []);
    const selectedFaces = canonicalIds(context?.selectedFaceIds ?? []);
    const faceCurrencies = new Map<string, string>();
    for (const item of context?.faceCurrencies ?? []) {
      const id = item.faceId.toLowerCase();
      if (faceCurrencies.has(id))
        throw new BadRequestException('Choose one pricing currency per selected face.');
      faceCurrencies.set(id, item.currency);
    }
    if ([...faceCurrencies.keys()].some((id) => !selectedFaces.has(id)))
      throw new BadRequestException('Choose pricing currencies only for selected faces.');
    if (selectedFaces.size) {
      const repo = await this.db.repo(SiteFaceEntity);
      checkCancelled(signal);
      const rows = (await repo.query(
        `SELECT f.id, f.site_id AS "siteId" FROM site_faces f JOIN billboard_sites s ON s.id::text = f.site_id::text WHERE f.id::text = ANY($1::text[]) AND ${demoVisibilitySql('s', '$2')}`,
        [[...selectedFaces], scope.orgId],
      )) as { id: string; siteId: string }[];
      if (rows.length !== selectedFaces.size)
        throw new BadRequestException('A selected face is unavailable to this planner.');
      checkCancelled(signal);
      for (const row of rows) selectedSites.add(row.siteId.toLowerCase());
    }
    if (selectedSites.size > 12)
      throw new BadRequestException('Select faces from at most 12 boards.');
    const ids = new Set(selectedSites);
    const discovered = new Set<string>();
    let pagesRead = 0;
    let searchHasMore: boolean;
    const queue = intent.queries.map((filters) => ({ filters, page: 1 }));
    {
      // Round-robin unions share one strict read budget, never three pages per city.
      while (queue.length && pagesRead < intent.maxPages) {
        checkCancelled(signal);
        const next = queue.shift()!;
        const search = await this.marketplace.search(
          { ...next.filters, ...window, limit: intent.pageSize, page: next.page },
          signal,
          scope.orgId,
        );
        checkCancelled(signal);
        pagesRead++;
        for (const item of search.items.slice(0, intent.pageSize)) {
          const id = String(item.id).toLowerCase();
          if (discovered.size < intent.maxDiscoveries) discovered.add(id);
        }
        if (next.page * intent.pageSize < search.total)
          queue.push({ ...next, page: next.page + 1 });
      }
      searchHasMore = queue.length > 0 || intent.queriesTruncated;
      for (const id of discovered) ids.add(id);
    }
    const checkedAt = new Date().toISOString();
    let sites: GroundedSite[] = [];
    const details = new Map<string, MarketplacePlanningSite>();
    const selectedEstimates: FaceCostEstimate[] = [];
    for (const id of ids) {
      checkCancelled(signal);
      const detail = (await this.marketplace.getMarketplaceSite(
        id,
        signal,
        scope.orgId,
      )) as MarketplacePlanningSite;
      checkCancelled(signal);
      details.set(id, detail);
      const available =
        window && !detail.isResearchReference ? await this.availability(id, window, signal) : null;
      checkCancelled(signal);
      const planningSite = {
        id: detail.id,
        format: detail.format,
        permitExpiresAt: iso(detail.permitExpiresAt),
        rateCards: detail.rateCards.map((card) => ({
          ...card,
          siteId: card.siteId ?? detail.id,
          effectiveFrom: iso(card.effectiveFrom) ?? '',
          effectiveTo: iso(card.effectiveTo),
        })),
      };
      const faces = [
        ...detail.faces.filter((face) => selectedFaces.has(face.id)),
        ...detail.faces.filter((face) => !selectedFaces.has(face.id)).slice(0, 256),
      ];
      const grounded = faces.map((face) => {
        const availability = available
          ? available.find((item) => item.faceId === face.id)?.available
          : undefined;
        const eligibility = window ? faceFlightEligibility(planningSite, face, window) : null;
        const status = detail.isResearchReference
          ? ('unknown' as const)
          : !face.bookable || eligibility?.eligible === false
            ? ('unavailable' as const)
            : availability === true
              ? ('available' as const)
              : availability === false
                ? ('unavailable' as const)
                : ('unknown' as const);
        const estimate: FaceCostEstimate = detail.isResearchReference
          ? {
              status: 'unavailable',
              siteId: detail.id,
              faceId: face.id,
              reason:
                'Research reference: published monthly asking price is indicative; a confirmed full-flight quote is unavailable.',
            }
          : window
            ? estimateFaceCost(
                planningSite,
                face,
                window,
                faceCurrencies.get(face.id) ??
                  (selectedFaces.has(face.id) ? undefined : intent.budget?.currency),
                {
                  status,
                  window,
                  checkedAt,
                },
              )
            : {
                status: 'unavailable',
                siteId: detail.id,
                faceId: face.id,
                reason: 'Confirm flight dates before estimating media cost.',
              };
        if (selectedFaces.has(face.id)) selectedEstimates.push(estimate);
        return {
          faceId: face.id,
          faceLabel: typeof face.faceLabel === 'string' ? face.faceLabel.slice(0, 80) : null,
          flightEligible: detail.isResearchReference ? null : (eligibility?.eligible ?? null),
          eligibilityReason: detail.isResearchReference
            ? 'Research interest only; commercial specifications and availability require operator confirmation.'
            : (eligibility?.reason ?? null),
          selected: selectedFaces.has(face.id),
          availability: detail.isResearchReference
            ? ('unknown' as const)
            : face.bookable
              ? status
              : ('unavailable' as const),
          estimate,
        };
      });
      // Score the complete bounded face read before cutting presentation detail.
      // No affordability prefilter can discard a higher-fit expensive face.
      const includedFaces = grounded;
      const evaluatedAllFaces = grounded.length === detail.faces.length;
      const budgetMatch = candidateBudgetMatch(grounded, intent.budget);
      sites.push({
        ...demoDisclosure(detail.isDemo === true),
        ...researchDisclosure(detail.isResearchReference === true, detail.researchProvenance),
        siteId: detail.id,
        name: String(detail.name ?? '').slice(0, 160),
        city: String(detail.city ?? '').slice(0, 80),
        country: String(detail.country ?? '').slice(0, 80),
        latitude: planningCoordinate(detail.latitude, 'latitude'),
        longitude: planningCoordinate(detail.longitude, 'longitude'),
        format: detail.format,
        specs: {
          elevation: finite(detail.elevation),
          orientationDeg: finite(detail.orientationDeg),
          units: typeof detail.units === 'string' ? detail.units.slice(0, 20) : null,
          elevationUnit: 'm' as const,
          orientationUnit: 'degrees' as const,
          width: finite(detail.width),
          height: finite(detail.height),
        },
        faces: includedFaces,
        facesEvaluated: grounded.length,
        facesOmitted: detail.faces.length - includedFaces.length,
        faceCoverageComplete: evaluatedAllFaces,
        budgetMatch: budgetMatch === 'over' && !evaluatedAllFaces ? 'unknown' : budgetMatch,
        enrichment: projectPlanningEnrichment(
          detail.isDemo ? { ...detail, metadata: [] } : detail,
          null,
        ),
        geographicContextState: 'unavailable',
      });
    }
    const found = new Set(sites.flatMap((site) => site.faces.map((face) => face.faceId)));
    if ([...selectedFaces].some((id) => !found.has(id)))
      throw new BadRequestException('A selected face is unavailable to this planner.');
    const scoringBrief: PlanningScoringBrief = {
      window: window ?? { startDate: '', endDate: '' },
      ...(intent.budget ? { budget: intent.budget } : {}),
      ...(intent.filters.country ? { targetCountry: intent.filters.country } : {}),
      ...(intent.filters.city ? { targetCity: intent.filters.city } : {}),
      ...(intent.filters.format ? { formats: [intent.filters.format] } : {}),
      ...(context?.fitPreferences ? { fitPreferences: context.fitPreferences } : {}),
      maxFaces: 12,
      lockedFaceIds: [...selectedFaces],
    };
    const initialRanks = new Map<string, PlanningFaceAssessment>();
    for (const site of sites) {
      for (const candidate of planningScoringCandidates(
        site,
        details.get(site.siteId)!,
        window,
        checkedAt,
      )) {
        initialRanks.set(candidate.faceId, scorePlanningFace(candidate, scoringBrief));
      }
      site.faces = [
        ...site.faces.filter((face) => face.selected),
        ...site.faces
          .filter((face) => !face.selected)
          .sort((a, b) => assessmentRank(initialRanks.get(a.faceId), initialRanks.get(b.faceId)))
          .slice(0, 8),
      ];
      site.facesOmitted = site.facesEvaluated - site.faces.length;
    }
    const candidates = sites.filter((site) => !selectedSites.has(site.siteId));
    const bestAssessment = (site: GroundedSite) =>
      site.faces
        .map((face) => initialRanks.get(face.faceId))
        .filter((value): value is PlanningFaceAssessment => Boolean(value))
        .sort(assessmentRank)[0];
    candidates.sort(
      (a, b) =>
        assessmentRank(bestAssessment(a), bestAssessment(b)) || a.siteId.localeCompare(b.siteId),
    );
    sites = [...sites.filter((site) => selectedSites.has(site.siteId)), ...candidates.slice(0, 12)];
    let enrichmentReads = 0;
    let enrichmentFailures = 0;
    // Local reference queries/raster reads are bounded independently of discovery.
    // All included boards retain production metadata even when this budget is exhausted.
    for (const site of sites) {
      checkCancelled(signal);
      if (!this.geographic || !scope.user || site.isDemo || site.isResearchReference) continue;
      if (enrichmentReads >= 6) {
        site.geographicContextState = 'read_budget_exhausted';
        continue;
      }
      enrichmentReads++;
      try {
        const geographic = await this.geographic.getSiteContext(
          scope.user,
          scope.orgId,
          site.siteId,
          signal,
        );
        checkCancelled(signal);
        site.enrichment = projectPlanningEnrichment(details.get(site.siteId)!, geographic);
        site.geographicContextState = 'loaded';
      } catch (error) {
        checkCancelled(signal);
        if (error instanceof HttpException && [403, 404, 499].includes(error.getStatus()))
          throw error;
        enrichmentFailures++;
        site.geographicContextState = 'temporarily_unavailable';
      }
    }
    const scoringCandidates = sites.flatMap((site) =>
      planningScoringCandidates(site, details.get(site.siteId)!, window, checkedAt),
    );
    const portfolio = selectPlanningPortfolio(scoringCandidates, scoringBrief);
    const assessment = {
      version: portfolio.version,
      provisional: true as const,
      config: effectiveBriefFitConfig(scoringBrief),
      assessments: portfolio.assessments,
      portfolio,
      recalculated: true as const,
      evidenceScope:
        'Current authorized bounded candidate read; no stored scores, reservation, measured reach or certification.',
    };
    const budget = summarizeBudget(selectedEstimates, intent.budget ?? undefined);
    const selectionTruncated = context?.selectionTruncated === true;
    if (selectionTruncated) {
      budget.fit = 'unknown';
      budget.remaining = null;
      budget.assumptions.push(
        'This subtotal covers the included faces only; some draft selections were omitted from this bounded request. Full-plan budget fit is unknown.',
      );
    }
    return {
      checkedAt,
      window,
      sites,
      assessment,
      selectionTruncated,
      requestedBudget: intent.budget,
      filters: intent.filters,
      retrieval: {
        ...intent,
        pagesRead,
        candidatesDiscovered: discovered.size,
        candidatesIncluded: Math.min(candidates.length, 12),
        candidatesOmitted: Math.max(0, candidates.length - 12),
        hasMore: searchHasMore,
        exhaustive: false as const,
        ranking:
          'Versioned deterministic usable-exposure utility first; separately qualified provisional interest when exposure is unknown. Stable confidence/identifier ties and bounded search; not measured effectiveness or an exhaustive optimum.',
        enrichmentReadLimit: 6,
        enrichmentReads,
        enrichmentFailures,
      },
      budget,
      researchPrices: summarizeResearchPrices(
        sites.filter((site) => site.faces.some((face) => face.selected)),
        window,
        selectionTruncated ? undefined : intent.budget,
      ),
      distances: selectionDistances(
        sites
          .filter((site) => selectedSites.has(site.siteId))
          .map((site) => ({
            id: site.siteId,
            latitude: site.latitude,
            longitude: site.longitude,
            isResearchReference: site.isResearchReference,
            researchProvenance: site.researchProvenance,
          })),
      ),
      ots: null,
      reach: null,
      assumptions: [
        'Partner marketplace inventory and privately scoped research references only; brief-aware search reads at most three eight-board pages and includes twelve discovered candidates plus selected boards. Coverage is bounded, not exhaustive.',
        'Literal inferred requirements require confirmation. Confirmed controls override them. Candidate budgetMatch is descriptive individual-face affordability; deterministic brief-fit is the recommendation objective, not cheapest-first.',
        'Production metadata is projected for included sites; at most six authorized geographic contexts are read. Read-budget or processing failures mean unknown context, never zero or no real-world features.',
        'Production enrichment is descriptive, with exact units, periods, provenance and freshness. Stale, future, unverified or unknown-freshness inputs cannot establish current audience performance.',
        'UTC start inclusive, end exclusive. Published media estimates exclude tax, production and FX conversion.',
        'Availability is indicative; this request never reserves or books inventory.',
        ...(sites.some((site) => site.isResearchReference)
          ? [
              'Research records are agency-curated public-source references, not partner-verified or bookable supply. Operator-published coordinates are not field verified. Monthly asking prices are indicative, never prorated flight quotes; slots, taxes, production, permits and availability remain unknown. A preliminary monthly subtotal is not confirmed budget fit.',
            ]
          : []),
        ...(sites.some((site) => site.isDemo)
          ? [
              'DEMO boards, dimensions, prices and availability are synthetic planning samples, not verified physical inventory or commercially bookable supply. No audience/enrichment is inferred from synthetic pins.',
            ]
          : []),
        'Distances are straight-line kilometres from registered WGS84 coordinates. Elevation is metres; orientation is degrees. Width/height use each site’s recorded units; null units are unknown.',
        'Validated OTS and deduplicated reach models are unavailable; population and traffic are not summed.',
      ],
    };
  }

  private async availability(siteId: string, window: PlanningWindow, signal?: AbortSignal) {
    checkCancelled(signal);
    const repo = await this.db.repo(SiteFaceEntity);
    checkCancelled(signal);
    return (await repo.query(
      `SELECT f.id AS "faceId", (f.bookable
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.face_id = f.id::text
          AND b.status IN ('held','confirmed','live') AND b.start_date < $3::date AND b.end_date > $2::date)
        AND NOT EXISTS (SELECT 1 FROM face_blackouts x WHERE x.face_id = f.id::text
          AND x.start_date < $3::date AND x.end_date > $2::date)) AS available
       FROM site_faces f WHERE f.site_id = $1 ORDER BY f.id`,
      [siteId, window.startDate, window.endDate],
    )) as { faceId: string; available: boolean }[];
  }

  async siteOptions(siteId: string, query: SiteOptionsQueryDto, orgId?: string) {
    if (!query.startDate || !query.endDate || query.startDate >= query.endDate)
      throw new BadRequestException('Choose a valid start date and a later exclusive end date.');
    // Reuse marketplace readiness and listing policy before exposing any faces.
    siteId = siteId.toLowerCase();
    const site = await this.marketplace.getMarketplaceSite(siteId, undefined, orgId);
    const rows = await this.availability(site.id, query);
    const detail = site as MarketplacePlanningSite;
    const eligibleRows = rows.map((row) => {
      if (detail.isResearchReference) return { faceId: row.faceId, available: null };
      const face = detail.faces?.find((item) => item.id === row.faceId);
      const eligible =
        face &&
        faceFlightEligibility(
          { ...detail, permitExpiresAt: iso(detail.permitExpiresAt) },
          face,
          query,
        ).eligible;
      return { ...row, available: row.available && Boolean(eligible) };
    });
    return {
      siteId,
      ...query,
      checkedAt: new Date().toISOString(),
      faces: eligibleRows,
      reservation: false as const,
      ...demoDisclosure(detail.isDemo === true),
      ...researchDisclosure(detail.isResearchReference === true, detail.researchProvenance),
      ...(detail.isDemo ? { availabilityKind: 'synthetic_planning_sample' } : {}),
      ...(detail.isResearchReference ? { availabilityKind: 'research_unconfirmed' } : {}),
    };
  }
}

function iso(value: Date | string | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}
function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
interface MarketplacePlanningSite {
  isResearchReference?: boolean;
  researchProvenance?: ResearchProvenance;
  isDemo?: boolean;
  id: string;
  name: string;
  city: string;
  country: string;
  format: string;
  latitude: number;
  longitude: number;
  permitExpiresAt?: Date | string | null;
  units?: string | null;
  elevation?: number;
  orientationDeg?: number;
  viewingDistance?: number;
  illuminationType?: string;
  illuminationHours?: string;
  metadata?: PlanningEnrichmentMetadata[];
  width?: number;
  height?: number;
  faces: Array<PlanningFace & { faceLabel?: string | null }>;
  rateCards: Array<
    Omit<PlanningRateCard, 'effectiveFrom' | 'effectiveTo' | 'siteId'> & {
      siteId?: string;
      effectiveFrom: Date | string;
      effectiveTo?: Date | string | null;
    }
  >;
}
interface GroundedSite {
  isResearchReference?: boolean;
  researchProvenance?: ResearchProvenance | null;
  ownershipKind?: 'agency_curated_reference';
  isDemo: boolean;
  commerciallyBookable?: boolean;
  demoProvenance?: string;
  facesEvaluated: number;
  facesOmitted: number;
  faceCoverageComplete: boolean;
  siteId: string;
  name: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  format: string;
  budgetMatch: 'within' | 'over' | 'unknown';
  enrichment: PlanningEnrichmentProjection;
  geographicContextState:
    'loaded' | 'unavailable' | 'temporarily_unavailable' | 'read_budget_exhausted';
  specs: {
    units: string | null;
    elevationUnit: 'm';
    orientationUnit: 'degrees';
    elevation: number | null;
    orientationDeg: number | null;
    width: number | null;
    height: number | null;
  };
  faces: {
    faceId: string;
    faceLabel: string | null;
    flightEligible: boolean | null;
    eligibilityReason: string | null;
    selected: boolean;
    availability: 'available' | 'unavailable' | 'unknown';
    estimate: FaceCostEstimate;
  }[];
}

function checkCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new HttpException('The planner request was cancelled.', 499);
}

function canonicalIds(ids: readonly string[]): Set<string> {
  const normalized = ids.map((id) => id.toLowerCase());
  if (new Set(normalized).size !== ids.length)
    throw new BadRequestException('Selected IDs must be unique regardless of letter case.');
  return new Set(normalized);
}

function candidateBudgetMatch(
  faces: GroundedSite['faces'],
  budget: { amount: number; currency: string } | null,
): GroundedSite['budgetMatch'] {
  if (!budget) return 'unknown';
  const available = faces.filter((face) => face.availability !== 'unavailable');
  if (
    available.some(
      (face) =>
        face.estimate.status === 'ready' &&
        face.estimate.currency === budget.currency &&
        face.estimate.amount <= budget.amount,
    )
  )
    return 'within';
  if (
    !available.length ||
    available.some(
      (face) => face.estimate.status !== 'ready' || face.estimate.currency !== budget.currency,
    )
  )
    return 'unknown';
  return 'over';
}

function assessmentRank(a?: PlanningFaceAssessment, b?: PlanningFaceAssessment): number {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return comparePlanningAssessments(a, b);
}

function deterministicChoice(facts: {
  sites: GroundedSite[];
  assessment: { portfolio: { selectedFaceIds: string[]; status: string } };
}) {
  const selected =
    facts.assessment.portfolio.status === 'ready' ? facts.assessment.portfolio.selectedFaceIds : [];
  return {
    recommendations: selected.flatMap((faceId) => {
      const site = facts.sites.find((site) => site.faces.some((face) => face.faceId === faceId));
      return site ? [{ siteId: site.siteId, faceId, reasonCode: 'brief_fit' }] : [];
    }),
    adviceCodes: ['compare_sources', 'confirm_quotes', 'confirm_availability'],
    questionCodes: selected.length
      ? ['confirm_availability', 'request_operator_quote']
      : ['confirm_budget', 'confirm_dates', 'prioritize_areas'],
  };
}

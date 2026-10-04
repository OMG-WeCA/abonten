import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { extractConstraints } from './brief-constraints';
import { AssistantMessageDto, SiteOptionsQueryDto } from './dto/planning.dto';
import {
  OpenAiPlannerProvider,
  PLANNER_MODEL,
  type PlannerAdmission,
} from './openai-planner.provider';
import {
  estimateFaceCost,
  faceFlightEligibility,
  planningDays,
  selectionDistances,
  summarizeBudget,
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

  async plan(
    dto: AssistantMessageDto,
    scope: { userId: string; orgId: string },
    signal?: AbortSignal,
  ) {
    if (!scope.userId || !scope.orgId)
      throw new ForbiddenException('An authorized organization context is required.');
    checkCancelled(signal);
    // Reject excess requests before any marketplace search or database grounding.
    const admission = this.provider?.configured ? this.provider.admit(scope, signal) : undefined;
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
      const running = this.runPlan(dto, scope, abort.signal, admission).finally(() =>
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
    scope: { userId: string; orgId: string },
    signal: AbortSignal,
    admission?: PlannerAdmission,
  ) {
    checkCancelled(signal);
    const local = this.assist(dto);
    const facts = await this.ground(dto, signal);
    checkCancelled(signal);
    if (!this.provider?.configured) return { ...local, facts };
    const briefShared = dto.shareBriefWithProvider === true && Boolean(dto.briefText?.trim());
    const model = await this.provider.complete(
      {
        locale: dto.locale ?? 'en',
        message: dto.message,
        briefText: briefShared ? dto.briefText : undefined,
        // A previous response can paraphrase a brief. Drop history without consent.
        history: dto.briefText !== undefined && !briefShared ? [] : (dto.history ?? []),
        snapshot: facts,
      },
      scope,
      signal,
      admission,
    );
    const allowed = new Set(
      facts.sites.flatMap((site) =>
        site.faces
          .filter((face) => face.availability !== 'unavailable')
          .map((face) => `${site.siteId}:${face.faceId}`),
      ),
    );
    const recommendations = new Set<string>();
    const groundedRecommendations = model.recommendations.map((rec) => ({
      ...rec,
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
      message: model.message,
      recommendations: groundedRecommendations,
      questions: model.questions,
      briefShared,
      facts,
    };
  }

  private async ground(dto: AssistantMessageDto, signal: AbortSignal) {
    const context = dto.context;
    const window = context?.window ?? null;
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
        'SELECT id, site_id AS "siteId" FROM site_faces WHERE id::text = ANY($1::text[])',
        [[...selectedFaces]],
      )) as { id: string; siteId: string }[];
      if (rows.length !== selectedFaces.size)
        throw new BadRequestException('A selected face is unavailable to this planner.');
      checkCancelled(signal);
      for (const row of rows) selectedSites.add(row.siteId.toLowerCase());
    }
    if (selectedSites.size > 12)
      throw new BadRequestException('Select faces from at most 12 boards.');
    const ids = new Set(selectedSites);
    if (this.provider?.configured) {
      const search = await this.marketplace.search(
        {
          ...context?.filters,
          ...window,
          limit: 8,
          page: 1,
        },
        signal,
      );
      checkCancelled(signal);
      for (const item of search.items) ids.add(String(item.id).toLowerCase());
    }
    const checkedAt = new Date().toISOString();
    const sites: GroundedSite[] = [];
    const selectedEstimates: FaceCostEstimate[] = [];
    for (const id of ids) {
      checkCancelled(signal);
      const detail = (await this.marketplace.getMarketplaceSite(
        id,
        signal,
      )) as MarketplacePlanningSite;
      checkCancelled(signal);
      const available = window ? await this.availability(id, window, signal) : null;
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
        ...detail.faces.filter((face) => !selectedFaces.has(face.id)).slice(0, 8),
      ];
      const grounded = faces.map((face) => {
        const availability = available
          ? available.find((item) => item.faceId === face.id)?.available
          : undefined;
        const eligibility = window ? faceFlightEligibility(planningSite, face, window) : null;
        const status =
          !face.bookable || eligibility?.eligible === false
            ? ('unavailable' as const)
            : availability === true
              ? ('available' as const)
              : availability === false
                ? ('unavailable' as const)
                : ('unknown' as const);
        const estimate: FaceCostEstimate = window
          ? estimateFaceCost(planningSite, face, window, faceCurrencies.get(face.id), {
              status,
              window,
              checkedAt,
            })
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
          flightEligible: eligibility?.eligible ?? null,
          eligibilityReason: eligibility?.reason ?? null,
          selected: selectedFaces.has(face.id),
          availability: face.bookable ? status : ('unavailable' as const),
          estimate,
        };
      });
      sites.push({
        siteId: detail.id,
        name: String(detail.name ?? '').slice(0, 160),
        city: String(detail.city ?? '').slice(0, 80),
        country: String(detail.country ?? '').slice(0, 80),
        latitude: Number(detail.latitude),
        longitude: Number(detail.longitude),
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
        faces: grounded,
      });
    }
    const found = new Set(sites.flatMap((site) => site.faces.map((face) => face.faceId)));
    if ([...selectedFaces].some((id) => !found.has(id)))
      throw new BadRequestException('A selected face is unavailable to this planner.');
    const budget = summarizeBudget(selectedEstimates, context?.budget);
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
      selectionTruncated,
      requestedBudget: context?.budget ?? null,
      filters: context?.filters ?? {},
      budget,
      distances: selectionDistances(
        sites
          .filter((site) => selectedSites.has(site.siteId))
          .map((site) => ({ id: site.siteId, latitude: site.latitude, longitude: site.longitude })),
      ),
      ots: null,
      reach: null,
      assumptions: [
        'Marketplace-ready public inventory only; candidate search is limited to eight boards and is not exhaustive.',
        'UTC start inclusive, end exclusive. Published media estimates exclude tax, production and FX conversion.',
        'Availability is indicative; this request never reserves or books inventory.',
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

  async siteOptions(siteId: string, query: SiteOptionsQueryDto) {
    if (!query.startDate || !query.endDate || query.startDate >= query.endDate)
      throw new BadRequestException('Choose a valid start date and a later exclusive end date.');
    // Reuse marketplace readiness and listing policy before exposing any faces.
    siteId = siteId.toLowerCase();
    const site = await this.marketplace.getMarketplaceSite(siteId);
    const rows = await this.availability(site.id, query);
    const detail = site as MarketplacePlanningSite;
    const eligibleRows = rows.map((row) => {
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
  siteId: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  format: string;
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

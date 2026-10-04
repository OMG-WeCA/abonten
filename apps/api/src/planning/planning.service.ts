import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { SiteFaceEntity } from '../common/entities/site-face.entity';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { extractConstraints } from './brief-constraints';
import { AssistantMessageDto, SiteOptionsQueryDto } from './dto/planning.dto';

@Injectable()
export class PlanningService {
  constructor(
    private readonly db: DatabaseService,
    private readonly marketplace: MarketplaceService,
  ) {}

  assistantStatus() {
    return {
      mode: 'local' as const,
      provider: null,
      aiAvailable: false,
      message:
        'AI is not connected. Local planning help and document text extraction are available.',
      documentFormats: ['pdf', 'pptx', 'xlsx', 'docx', 'txt', 'csv', 'tsv', 'md'],
      maxUploadBytes: 10 * 1024 * 1024,
      documentsRetained: false,
      externalTransfer: false,
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
      aiAvailable: false,
      message,
      constraints,
      missing,
      requiresConfirmation: true as const,
    };
  }

  async siteOptions(siteId: string, query: SiteOptionsQueryDto) {
    if (!query.startDate || !query.endDate || query.startDate >= query.endDate)
      throw new BadRequestException('Choose a valid start date and a later exclusive end date.');
    // Reuse marketplace readiness and listing policy before exposing any faces.
    const site = await this.marketplace.getMarketplaceSite(siteId);
    const repo = await this.db.repo(SiteFaceEntity);
    const rows = (await repo.query(
      `SELECT f.id AS "faceId", (f.bookable
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.face_id = f.id::text
          AND b.status IN ('held','confirmed','live') AND b.start_date < $3::date AND b.end_date > $2::date)
        AND NOT EXISTS (SELECT 1 FROM face_blackouts x WHERE x.face_id = f.id::text
          AND x.start_date < $3::date AND x.end_date > $2::date)) AS available
       FROM site_faces f WHERE f.site_id = $1 ORDER BY f.id`,
      [site.id, query.startDate, query.endDate],
    )) as { faceId: string; available: boolean }[];
    return {
      siteId,
      ...query,
      checkedAt: new Date().toISOString(),
      faces: rows,
      reservation: false as const,
    };
  }
}

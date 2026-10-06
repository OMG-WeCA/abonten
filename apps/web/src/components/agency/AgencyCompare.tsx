'use client';

import { useId } from 'react';
import { ArrowLeft, ArrowUpRight, Columns3, Plus, Trash2 } from 'lucide-react';
import type { SiteDetail } from '../../lib/sites-api';
import type {
  FaceCostEstimate,
  PlanningAvailability,
  PlanningWindow,
} from '../../lib/agency-planning';
import { planningDays, PLANNING_CURRENCIES } from '../../lib/agency-planning';
import { draftFaceEligibility } from '../../lib/agency-draft';
import {
  projectPlanningEnrichment,
  type PlanningEnrichmentMetric,
} from '../../lib/agency-enrichment';
import { agencyEvidenceText, agencyEvidenceUnit } from '../../lib/agency-evidence-locale';
import { displayDateOnly, displayNumber, displayUtcTimestamp } from '../../lib/locale-format';
import { formatMoney } from '../../lib/number-format';
import { marketLabel } from '../../lib/markets';
import { prettyFormat, prettyIllumination } from '../sites/sites-ui';

export interface AgencyCompareProps {
  shortlist: Array<{ site: SiteDetail; faceId: string; pricingCurrency?: string }>;
  estimates: FaceCostEstimate[];
  availabilityFor: (siteId: string, faceId: string) => PlanningAvailability;
  window: PlanningWindow;
  locale: 'en' | 'fr';
  unresolvedCount?: number;
  onOpen: (siteId: string, faceId: string) => void;
  onRemove: (faceId: string) => void;
  onBrowse: () => void;
  onBack: () => void;
}

/** Compare authorized, already-loaded facts. No requests or new pricing/audience calculations. */
export function AgencyCompare(props: AgencyCompareProps) {
  const { shortlist, estimates, availabilityFor, window, locale } = props;
  const headingId = useId();
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const days = planningDays(window);
  return (
    <section className="agency-compare" aria-labelledby={headingId} data-testid="agency-compare">
      <header className="agency-compare-heading">
        <div>
          <p className="agency-eyebrow">
            {t('Your draft shortlist', 'Votre sélection provisoire')}
          </p>
          <h1 id={headingId}>{t('Compare selected faces', 'Comparer les faces sélectionnées')}</h1>
          <p className="agency-compare-intro">
            {t(
              'Review published media costs and recorded board facts side by side.',
              'Comparez les coûts média publiés et les données enregistrées des panneaux.',
            )}
          </p>
        </div>
        <div className="agency-compare-actions">
          <button type="button" className="agency-secondary-button" onClick={props.onBack}>
            <ArrowLeft size={16} />
            {t('Back to map', 'Retour à la carte')}
          </button>
          <button type="button" className="agency-primary-button" onClick={props.onBrowse}>
            <Plus size={16} />
            {t('Add faces', 'Ajouter des faces')}
          </button>
        </div>
      </header>
      <div className="agency-compare-flight">
        <span>
          {displayNumber(shortlist.length + (props.unresolvedCount ?? 0), locale)}{' '}
          {t('selected faces', 'faces sélectionnées')}
          {(props.unresolvedCount ?? 0) > 0 && (
            <>
              {' '}
              · {displayNumber(shortlist.length, locale)}{' '}
              {t('loaded', shortlist.length === 1 ? 'chargée' : 'chargées')}
            </>
          )}
        </span>
        <span>
          {days === null ? (
            t(
              'Choose valid flight dates in the planner.',
              'Choisissez des dates de diffusion valides dans le planificateur.',
            )
          ) : (
            <>
              {displayDateOnly(window.startDate, locale)} →{' '}
              {displayDateOnly(window.endDate, locale)} · {displayNumber(days, locale)}{' '}
              {t('days', 'jours')}
            </>
          )}
        </span>
        <small>
          {t(
            'UTC calendar days · start included, end excluded',
            'Jours calendaires UTC · début inclus, fin exclue',
          )}
        </small>
      </div>
      {shortlist.length === 0 && !props.unresolvedCount ? (
        <div className="agency-compare-empty">
          <Columns3 size={32} aria-hidden="true" />
          <h2>{t('Choose the faces you want to compare', 'Choisissez les faces à comparer')}</h2>
          <p>
            {t(
              'Add at least two faces from the map or inventory. Each face keeps its own currency, availability and evidence.',
              'Ajoutez au moins deux faces depuis la carte ou l’inventaire. Chaque face conserve sa devise, sa disponibilité et ses sources.',
            )}
          </p>
          <button type="button" className="agency-primary-button" onClick={props.onBrowse}>
            {t('Browse inventory', 'Parcourir l’inventaire')}
            <ArrowUpRight size={16} />
          </button>
        </div>
      ) : (
        <>
          {shortlist.length === 1 && !props.unresolvedCount && (
            <aside className="agency-compare-single">
              <p>
                {t(
                  'One face selected. Add another to compare your options.',
                  'Une face sélectionnée. Ajoutez-en une autre pour comparer vos options.',
                )}
              </p>
              <button type="button" className="agency-text-button" onClick={props.onBrowse}>
                {t('Find another face', 'Trouver une autre face')}
                <Plus size={15} />
              </button>
            </aside>
          )}
          <div className="agency-compare-grid">
            {shortlist.map((item) => (
              <CompareFace
                key={`${item.site.id}:${item.faceId}`}
                item={item}
                estimate={estimates.find(
                  (estimate) => estimate.faceId === item.faceId && estimate.siteId === item.site.id,
                )}
                availability={availabilityFor(item.site.id, item.faceId)}
                window={window}
                locale={locale}
                onOpen={props.onOpen}
                onRemove={props.onRemove}
              />
            ))}
          </div>
          <p className="agency-compare-disclaimer">
            {t(
              'These are draft comparisons, not reservations. Currencies are shown separately without conversion. Population and traffic are not added together; no audience or reach total is inferred.',
              'Ces comparaisons sont provisoires et ne constituent pas des réservations. Les devises sont affichées séparément, sans conversion. La population et le trafic ne sont pas additionnés ; aucun total d’audience ou de couverture n’est déduit.',
            )}
          </p>
        </>
      )}
    </section>
  );
}

function CompareFace({
  item,
  estimate,
  availability,
  window,
  locale,
  onOpen,
  onRemove,
}: {
  item: AgencyCompareProps['shortlist'][number];
  estimate?: FaceCostEstimate;
  availability: PlanningAvailability;
  window: PlanningWindow;
  locale: AgencyCompareProps['locale'];
  onOpen: AgencyCompareProps['onOpen'];
  onRemove: AgencyCompareProps['onRemove'];
}) {
  const { site, faceId } = item;
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const headingId = useId();
  const unknown = t('Not recorded', 'Non renseigné');
  const face = site.faces.find((face) => face.id === faceId && face.siteId === site.id);
  const eligibility = draftFaceEligibility(site, face, window, availability);
  const matchingAvailability =
    planningDays(window) !== null &&
    availability.window?.startDate === window.startDate &&
    availability.window.endDate === window.endDate;
  const availabilityStatus = matchingAvailability ? availability.status : 'unknown';
  // Reject an old flight/currency or an ineligible face even if the caller retains a previous estimate.
  const price =
    estimate?.status === 'ready' &&
    eligibility.eligible &&
    estimate.window.startDate === window.startDate &&
    estimate.window.endDate === window.endDate &&
    (!item.pricingCurrency || item.pricingCurrency === estimate.currency) &&
    Number.isFinite(estimate.amount) &&
    estimate.amount >= 0 &&
    PLANNING_CURRENCIES.some((currency) => currency === estimate.currency)
      ? estimate
      : null;
  const priceReason = !eligibility.eligible
    ? eligibility.reason
    : estimate?.status === 'unavailable'
      ? estimate.reason
      : t(
          'A current estimate for this flight and currency is unavailable. Open the board to review its rates.',
          'Une estimation actuelle pour ces dates et cette devise est indisponible. Ouvrez le panneau pour consulter ses tarifs.',
        );
  const enrichment = projectPlanningEnrichment(site);
  const dimension = (number: number | null | undefined) =>
    typeof number === 'number' && Number.isFinite(number) && number > 0
      ? displayNumber(number, locale)
      : unknown;
  const numeric = (metric: PlanningEnrichmentMetric<number>) =>
    metric.value === null
      ? unknown
      : `${displayNumber(metric.value, locale)} ${agencyEvidenceUnit(metric.unit, locale)}`;
  const illumination = enrichment.structure.illumination;
  return (
    <article className="agency-compare-card" aria-labelledby={headingId} data-face-id={faceId}>
      <header className="agency-compare-card-heading">
        <span className="agency-compare-face-tag">
          {t('Face', 'Face')} {face?.faceLabel ?? faceId}
        </span>
        <h2 id={headingId}>{site.name}</h2>
        <p>
          {[site.code, site.city, marketLabel(site.country, locale)].filter(Boolean).join(' · ')}
        </p>
        <span className="agency-compare-format">{prettyFormat(site.format, locale)}</span>
      </header>
      <div className="agency-compare-price">
        <span className="agency-compare-label">
          {t('Media cost for this flight', 'Coût média pour cette diffusion')}
        </span>
        <strong>
          {price
            ? formatMoney(price.amount, price.currency, locale)
            : t('Quote unavailable', 'Devis indisponible')}
        </strong>
        {price ? (
          <>
            <p>
              {displayNumber(price.days, locale)} {t('days', 'jours')} · {price.currency} ·{' '}
              {price.basis === 'perDay'
                ? t('daily rate', 'tarif journalier')
                : t('weekly rate', 'tarif hebdomadaire')}
            </p>
            <details className="agency-compare-evidence">
              <summary>
                {t('Rate source and assumptions', 'Source tarifaire et hypothèses')}
              </summary>
              <p>{agencyEvidenceText(price.provenance, locale)}</p>
              <p>
                {t('Rate record', 'Grille tarifaire')} <code>{price.rateCardId}</code>
              </p>
              <p>
                {formatMoney(price.unitRate, price.currency, locale)} ×{' '}
                {displayNumber(price.quantity, locale)}{' '}
                {price.basis === 'perDay' ? t('days', 'jours') : t('weeks', 'semaines')}
              </p>
              <ul>
                {price.assumptions.map((assumption, index) => (
                  <li key={index}>{agencyEvidenceText(assumption, locale)}</li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <p className="agency-compare-missing">{agencyEvidenceText(priceReason ?? '', locale)}</p>
        )}
      </div>
      <dl className="agency-compare-facts">
        <div className="agency-compare-fact">
          <dt>{t('Availability for this flight', 'Disponibilité pour cette diffusion')}</dt>
          <dd>
            <span className={`agency-compare-availability is-${availabilityStatus}`}>
              {availabilityStatus === 'available'
                ? t('Available at last check', 'Disponible au dernier contrôle')
                : availabilityStatus === 'unavailable'
                  ? t('Unavailable at last check', 'Indisponible au dernier contrôle')
                  : t('Not confirmed', 'Non confirmée')}
            </span>
            <small>
              {matchingAvailability && availability.checkedAt
                ? `${t('Checked', 'Contrôlé')} ${displayUtcTimestamp(availability.checkedAt, locale)}`
                : t(
                    'No matching flight check. Review availability in board details.',
                    'Aucun contrôle pour ces dates. Consultez la disponibilité dans les détails du panneau.',
                  )}
            </small>
            <small>
              {t('Indicative only · no reservation', 'Indicative uniquement · sans réservation')}
            </small>
          </dd>
        </div>
        <div className="agency-compare-fact">
          <dt>{t('Face dimensions', 'Dimensions de la face')}</dt>
          <dd>
            {face
              ? `${dimension(face.width)} × ${dimension(face.height)} ${face.units ? agencyEvidenceUnit(face.units, locale) : t('units unknown', 'unités inconnues')}`
              : unknown}
            <small>
              {t('Registered inventory declaration', 'Déclaration enregistrée de l’inventaire')}
            </small>
          </dd>
        </div>
        <EvidenceFact
          label={t('Facing orientation', 'Orientation de la face')}
          metric={enrichment.structure.orientation}
          value={numeric(enrichment.structure.orientation)}
          locale={locale}
        />
        <EvidenceFact
          label={t('Viewing angle', 'Angle de vue')}
          metric={enrichment.structure.viewingAngle}
          value={numeric(enrichment.structure.viewingAngle)}
          locale={locale}
        />
        <EvidenceFact
          label={t('Viewing distance', 'Distance de visibilité')}
          metric={enrichment.structure.viewingDistance}
          value={numeric(enrichment.structure.viewingDistance)}
          locale={locale}
        />
        <EvidenceFact
          label={t('Elevation above ground', 'Hauteur au-dessus du sol')}
          metric={enrichment.structure.elevation}
          value={numeric(enrichment.structure.elevation)}
          locale={locale}
        />
        <EvidenceFact
          label={t('Illumination', 'Éclairage')}
          metric={illumination}
          value={
            illumination.value
              ? `${prettyIllumination(illumination.value.type, locale)}${illumination.value.hours ? ` · ${illumination.value.hours}` : ''}`
              : unknown
          }
          locale={locale}
        />
        <EvidenceFact
          label={t('Visibility score', 'Score de visibilité')}
          metric={enrichment.visibility}
          value={numeric(enrichment.visibility)}
          locale={locale}
        />
        <EvidenceFact
          label={t('Declared traffic', 'Trafic déclaré')}
          metric={enrichment.declaredTraffic}
          value={numeric(enrichment.declaredTraffic)}
          locale={locale}
        />
      </dl>
      <div className="agency-compare-card-footer">
        <p>
          {t(
            'Inspect geographic sources, media and full specifications in board details.',
            'Consultez les sources géographiques, les médias et les caractéristiques complètes dans les détails du panneau.',
          )}
        </p>
        <button
          type="button"
          className="agency-secondary-button"
          onClick={() => onOpen(site.id, faceId)}
          aria-label={`${t('Open board', 'Ouvrir le panneau')} ${site.name}, ${t('face', 'face')} ${face?.faceLabel ?? faceId}`}
        >
          {t('Open board details', 'Ouvrir les détails')}
          <ArrowUpRight size={16} />
        </button>
        <button
          type="button"
          className="agency-compare-remove"
          onClick={() => onRemove(faceId)}
          aria-label={`${t('Remove face', 'Retirer la face')} ${face?.faceLabel ?? faceId}, ${site.name}`}
        >
          <Trash2 size={14} />
          {t('Remove from shortlist', 'Retirer de la sélection')}
        </button>
      </div>
    </article>
  );
}

function EvidenceFact({
  label,
  metric,
  value,
  locale,
}: {
  label: string;
  metric: PlanningEnrichmentMetric<unknown>;
  value: string;
  locale: 'en' | 'fr';
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  const provenance =
    metric.provenance && 'recordId' in metric.provenance ? metric.provenance : null;
  return (
    <div className="agency-compare-fact">
      <dt>{label}</dt>
      <dd>
        {value}
        <small>
          {agencyEvidenceUnit(metric.status, locale)}
          {metric.status !== 'unavailable'
            ? ` · ${agencyEvidenceUnit(metric.freshness.status, locale)}`
            : ''}
        </small>
        {metric.reason && (
          <small className="agency-compare-missing">
            {agencyEvidenceText(metric.reason, locale)}
          </small>
        )}
        {(metric.method || provenance || metric.warnings.length > 0) && (
          <details className="agency-compare-evidence">
            <summary>{t('Source and caveats', 'Source et réserves')}</summary>
            {provenance && (
              <>
                <p>
                  {t('Source', 'Source')} :{' '}
                  {provenance.source ?? t('Not recorded', 'Non renseignée')}
                </p>
                <p>
                  {t('Record', 'Enregistrement')} : <code>{provenance.recordId}</code>
                </p>
                <p>
                  {t('Verification', 'Vérification')} :{' '}
                  {provenance.verification
                    ? agencyEvidenceUnit(provenance.verification, locale)
                    : t('Unknown', 'Inconnue')}
                </p>
              </>
            )}
            {metric.method && (
              <p>
                {t('Method', 'Méthode')} : {agencyEvidenceText(metric.method, locale)}
              </p>
            )}
            {metric.freshness.collectedAt && (
              <p>
                {t('Collected', 'Collecté')} :{' '}
                {displayUtcTimestamp(metric.freshness.collectedAt, locale)}
              </p>
            )}
            {metric.freshness.expiresAt && (
              <p>
                {t('Expires', 'Expire')} : {displayUtcTimestamp(metric.freshness.expiresAt, locale)}
              </p>
            )}
            {metric.warnings.length > 0 && (
              <ul>
                {metric.warnings.map((warning, index) => (
                  <li key={index}>{agencyEvidenceText(warning, locale)}</li>
                ))}
              </ul>
            )}
          </details>
        )}
      </dd>
    </div>
  );
}

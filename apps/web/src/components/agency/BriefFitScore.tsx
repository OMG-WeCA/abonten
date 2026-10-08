import type {
  PlanningFaceAssessment,
  PlanningFitFactor,
} from '../../../../api/src/planning/planning-scoring';
import { displayNumber } from '../../lib/locale-format';

const factorLabels: Record<PlanningFitFactor['key'], [string, string]> = {
  geography: ['Geographic fit', 'Pertinence géographique'],
  audience: ['Audience fit', 'Pertinence audience'],
  visibility: ['Visibility & usable exposure', 'Visibilité et exposition utile'],
  contribution: ['Geographic contribution', 'Apport géographique'],
  value: ['Fit for media spend', 'Pertinence par coût média'],
};
const provenanceLabels = {
  verified: ['Verified', 'Vérifié'],
  owner_reported: ['Owner reported', 'Déclaré par le propriétaire'],
  modeled: ['Modeled', 'Modélisé'],
  unknown: ['Unknown', 'Inconnu'],
} as const;
/** Only known engine codes receive product prose; unknown codes never become invented explanations. */
const codeLabels: Record<string, [string, string]> = {
  country_match: ['Sourced country matches', 'Pays source correspondant'],
  country_mismatch: ['Country conflicts with the brief', 'Pays hors brief'],
  country_unknown: ['Country evidence missing', 'Pays sans données étayées'],
  city_match: ['Sourced city matches', 'Ville source correspondante'],
  city_mismatch: ['City conflicts with the brief', 'Ville hors brief'],
  city_unknown: ['City evidence missing', 'Ville sans données étayées'],
  geographic_fit: ['Sourced geography fits', 'Géographie étayée pertinente'],
  target_area_match: ['Sourced target area matches', 'Zone cible étayée correspondante'],
  target_area_mismatch: ['Source area differs from target', 'Zone source différente de la cible'],
  target_corridor_mismatch: [
    'Source corridor differs from target',
    'Axe source différent de la cible',
  ],
  audience_segment_mismatch: [
    'Sourced target-segment share is zero',
    'Part du segment cible source nulle',
  ],
  directional_approach_mismatch: [
    'Face is not aligned with the approach',
    'Face non alignée avec le sens d’approche',
  ],
  obstructed_sightline: ['Sourced sightline is obstructed', 'Ligne de vue source obstruée'],
  daypart_unserved: ['Requested daypart is not served', 'Moment demandé non couvert'],
  geography_constraints_unresolved: [
    'Target geography lacks comparable source evidence',
    'Géographie cible sans données sources comparables',
  ],
  digital_daypart_unserved: [
    'Purchased digital schedule does not serve the requested daypart',
    'Programmation numérique achetée ne couvrant pas le moment demandé',
  ],
  digital_schedule_unknown: [
    'Purchased digital schedule and flight coverage unknown',
    'Programmation numérique achetée et période couverte inconnues',
  ],
  target_area_unknown: ['Target-area match unverified', 'Correspondance des zones non vérifiée'],
  target_corridor_match: ['Sourced target corridor matches', 'Axe cible étayé correspondant'],
  target_corridor_unknown: [
    'Target-corridor match unverified',
    'Correspondance des axes non vérifiée',
  ],
  geographic_target_unspecified: [
    'Geographic priority not specified',
    'Priorité géographique non précisée',
  ],
  verified_radius_match: [
    'Verified position within target radius',
    'Position vérifiée dans le rayon cible',
  ],
  radius_geometry_unverified: [
    'Position cannot establish precise radius fit',
    'Position insuffisante pour confirmer le rayon',
  ],
  radius_mismatch: ['Outside the target radius', 'Hors du rayon cible'],
  audience_segment_fit: ['Source-backed target audience assessed', 'Audience cible étayée évaluée'],
  audience_segment_unknown: [
    'Target audience evidence missing',
    'Données d’audience cible manquantes',
  ],
  audience_target_unspecified: ['Target audience not specified', 'Audience cible non précisée'],
  traffic_unavailable: [
    'Traffic unknown; still provisional',
    'Trafic inconnu ; intérêt provisoire conservé',
  ],
  verified_directional_geometry: [
    'Verified approach and facing assessed',
    'Approche et orientation vérifiées évaluées',
  ],
  directional_geometry_unverified: [
    'Directional geometry unverified',
    'Géométrie directionnelle non vérifiée',
  ],
  unobstructed_sightline: ['Sourced sightline assessed', 'Ligne de vue étayée évaluée'],
  obstruction_unknown: ['Obstructions unknown', 'Obstacles inconnus'],
  dwell_policy: [
    'Sourced dwell assessed provisionally',
    'Temps de vue étayé évalué provisoirement',
  ],
  exposure_context_unknown: [
    'Usable exposure evidence missing',
    'Données d’exposition utile manquantes',
  ],
  daypart_lighting_policy: ['Lighting and daypart assessed', 'Éclairage et moment évalués'],
  lighting_schedule_unknown: ['Lighting schedule unknown', 'Horaires d’éclairage inconnus'],
  digital_rotation_dwell_policy: [
    'Digital schedule and dwell assessed',
    'Programmation numérique et temps de vue évalués',
  ],
  new_geographic_proxy: [
    'Adds a sourced geographic grouping',
    'Ajoute un groupe géographique étayé',
  ],
  overlapping_geographic_proxy: ['Repeats a geographic grouping', 'Répète un groupe géographique'],
  geographic_redundancy_proxy: [
    'Geographic redundancy proxy; no reach claim',
    'Indicateur de redondance géographique, sans mesure de couverture',
  ],
  geographic_proxy_unknown: ['Geographic contribution unknown', 'Apport géographique inconnu'],
  portfolio_overlap_unknown: [
    'Portfolio overlap unverified',
    'Chevauchement du portefeuille non vérifié',
  ],
  supported_fit_per_budget_share: [
    'Supported fit compared with media spend',
    'Pertinence étayée comparée au coût média',
  ],
  value_evidence_unknown: [
    'Value comparison lacks evidence',
    'Comparaison de valeur sans données suffisantes',
  ],
  availability_unknown: ['Availability needs verification', 'Disponibilité à vérifier'],
  availability_unavailable: ['Unavailable for this flight', 'Indisponible pour ces dates'],
  availability_verification_required: [
    'Availability and quote need verification',
    'Disponibilité et devis à vérifier',
  ],
  physical_ineligible: [
    'Face cannot meet physical flight requirements',
    'Face incompatible avec les exigences de diffusion',
  ],
  format_mismatch: ['Format conflicts with the brief', 'Format hors brief'],
  price_unknown: ['Price unknown; not treated as zero', 'Tarif inconnu ; jamais assimilé à zéro'],
  price_currency_mismatch: [
    'Different currency; no FX assumed',
    'Devise différente ; aucune conversion supposée',
  ],
  price_window_mismatch: ['Price does not cover this flight', 'Tarif ne couvrant pas la période'],
  research_window_incomparable: [
    'Monthly asking price cannot price this flight',
    'Tarif mensuel public insuffisant pour cette période',
  ],
  invalid_flight: ['Flight dates invalid', 'Dates de diffusion invalides'],
  research_monthly_asking_baseline_only: [
    'Monthly asking baseline; quote unconfirmed',
    'Base mensuelle publique ; devis non confirmé',
  ],
  no_supported_fit_evidence: [
    'Insufficient supported fit evidence',
    'Données de pertinence étayées insuffisantes',
  ],
  locked_budget_or_structure_infeasible: [
    'Current selection exceeds a hard constraint',
    'Sélection actuelle hors contrainte stricte',
  ],
  locked_constraints_infeasible: [
    'Current selection conflicts with the brief',
    'Sélection actuelle incompatible avec le brief',
  ],
  locked_price_unresolved: [
    'Current selection has unresolved prices',
    'Tarifs de la sélection actuelle non résolus',
  ],
  mixed_price_bases_unresolved: [
    'Price periods cannot be combined',
    'Périodes tarifaires non combinables',
  ],
  no_comparable_budget_candidates: [
    'No comparable priced candidates fit',
    'Aucune face tarifée comparable ne convient',
  ],
  search_pool_truncated: [
    'Bounded search; some candidates omitted',
    'Recherche bornée ; certaines faces omises',
  ],
  unpriced_or_incomparable_candidates_not_auto_selected: [
    'Unpriced faces kept for manual review',
    'Faces sans tarif conservées pour examen manuel',
  ],
  valid_budget_and_flight_required: [
    'Confirm budget and flight before rebuilding',
    'Confirmez budget et dates avant de recréer',
  ],
};
export function briefFitEvidenceText(code: string, locale: 'en' | 'fr', unknown = false): string {
  return (
    codeLabels[code]?.[locale === 'fr' ? 1 : 0] ??
    (locale === 'fr'
      ? unknown
        ? 'Données complémentaires à vérifier'
        : 'Critère évalué selon les sources disponibles'
      : unknown
        ? 'Additional evidence needs checking'
        : 'Assessed from available source facts')
  );
}

export function BriefFitScore({
  assessment,
  locale,
}: {
  assessment?: PlanningFaceAssessment;
  locale: 'en' | 'fr';
}) {
  const t = (en: string, fr: string) => (locale === 'fr' ? fr : en);
  if (!assessment)
    return (
      <p className="agency-fit-unavailable">
        {t('Brief fit not assessed', 'Pertinence non évaluée')}
      </p>
    );
  const n = (value: number) => displayNumber(value, locale, { maximumFractionDigits: 0 });
  const range =
    assessment.score === null
      ? t('Unknown', 'Inconnue')
      : `${n(assessment.range.lower)}–${n(assessment.range.upper)} /100`;
  const confidence =
    assessment.confidenceLabel === 'high'
      ? t('High', 'Élevée')
      : assessment.confidenceLabel === 'medium'
        ? t('Medium', 'Moyenne')
        : t('Low', 'Faible');
  const concise = [
    assessment.reasons[0] ? briefFitEvidenceText(assessment.reasons[0], locale) : '',
    assessment.unknowns[0] ? briefFitEvidenceText(assessment.unknowns[0], locale, true) : '',
  ].filter(Boolean);
  return (
    <div className="agency-fit-score" data-testid="brief-fit-score">
      <div className="agency-fit-heading">
        <strong>
          {t('Brief fit', 'Pertinence brief')} <b>{range}</b>
        </strong>
        <span className="agency-data-badge">
          {t('Confidence', 'Confiance')} {confidence.toLowerCase()} ·{' '}
          {n(assessment.evidenceConfidence)}%
        </span>
      </div>
      {!assessment.eligible && (
        <p className="text-warning">
          {t('Outside confirmed constraints', 'Hors des contraintes confirmées')}
        </p>
      )}
      {concise.length > 0 && <p className="agency-fit-reasons">{concise.join(' · ')}</p>}
      <details>
        <summary>{t('Factors & evidence', 'Critères et données')}</summary>
        <p>
          {t(
            'Provisional product index, not measured effectiveness. The range includes missing evidence; it is not a statistical confidence interval.',
            'Indice produit provisoire, sans mesure d’efficacité. La plage inclut les données manquantes ; ce n’est pas un intervalle de confiance statistique.',
          )}
        </p>
        <p>
          {t('Supported contribution', 'Contribution étayée')}{' '}
          {assessment.score === null ? '—' : n(assessment.score)} /100 ·{' '}
          {t('Evidence coverage', 'Couverture des données')} {n(assessment.evidenceCoverage)}%
        </p>
        {assessment.factors.map((factor) => (
          <div className="agency-fit-factor" key={factor.key}>
            <strong>
              {factorLabels[factor.key][locale === 'fr' ? 1 : 0]} <span>{n(factor.weight)}%</span>
            </strong>
            <p>
              {factor.score === null
                ? t('Unknown', 'Inconnu')
                : `${n(factor.range.lower)}–${n(factor.range.upper)} /100`}{' '}
              · {t('Evidence', 'Données')} {n(factor.coverage)}% · {t('Confidence', 'Confiance')}{' '}
              {n(factor.confidence)}%
            </p>
            <p>
              {factor.provenance.length
                ? factor.provenance
                    .map((item) => provenanceLabels[item][locale === 'fr' ? 1 : 0])
                    .join(' · ')
                : t('Unknown provenance', 'Provenance inconnue')}
            </p>
            {[
              ...factor.reasons.slice(0, 2).map((code) => briefFitEvidenceText(code, locale)),
              ...factor.unknowns
                .slice(0, 2)
                .map((code) => briefFitEvidenceText(code, locale, true)),
            ].map((text, index) => (
              <p key={index}>{text}</p>
            ))}
            {factor.sources.length > 0 && (
              <small>
                {t('Sources', 'Sources')} : {factor.sources.slice(0, 4).join(' · ')}
              </small>
            )}
          </div>
        ))}
        {assessment.exclusions.map((code) => (
          <p key={code}>{briefFitEvidenceText(code, locale, true)}</p>
        ))}
        <p className="agency-fit-version">
          {t('Scoring version', 'Version de notation')} : {assessment.version}
        </p>
      </details>
    </div>
  );
}

import {
  selectionDistances,
  summarizeBudget,
  summarizeResearchPrices,
  type FaceCostEstimate,
  type PlanningBudget,
  type PlanningWindow,
} from './planning-math';
import type { ResearchProvenance } from '../common/research-inventory';

export const RECOMMENDATION_REASON_CODES = [
  'planning_interest',
  'source_specs',
  'source_monthly_price',
  'compare_location',
] as const;
export const PLANNING_ADVICE_CODES = [
  'compare_sources',
  'confirm_quotes',
  'confirm_availability',
  'confirm_slots',
  'verify_locations',
  'request_measurement',
  'clarify_coverage',
] as const;
export const PLANNING_QUESTION_CODES = [
  'confirm_budget',
  'confirm_dates',
  'confirm_market',
  'prioritize_areas',
  'request_operator_quote',
  'confirm_slot',
  'confirm_availability',
  'verify_coordinates',
  'request_traffic_evidence',
] as const;
export type RecommendationReasonCode = (typeof RECOMMENDATION_REASON_CODES)[number];
export type PlanningAdviceCode = (typeof PLANNING_ADVICE_CODES)[number];
export type PlanningQuestionCode = (typeof PLANNING_QUESTION_CODES)[number];
export interface CanonicalChoice {
  recommendations: { siteId: string; faceId: string; reasonCode?: unknown; reason?: unknown }[];
  adviceCodes?: unknown;
  questionCodes?: unknown;
  message?: unknown;
  questions?: unknown;
}
export interface CanonicalSite {
  siteId: string;
  name: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  isDemo?: boolean;
  isResearchReference?: boolean;
  researchProvenance?: ResearchProvenance | null;
  specs?: { width: number | null; height: number | null; units: string | null };
  faces: {
    faceId: string;
    estimate: FaceCostEstimate;
    availability: 'available' | 'unavailable' | 'unknown';
  }[];
}
export interface CanonicalFacts {
  sites: CanonicalSite[];
  window: PlanningWindow | null;
  requestedBudget: PlanningBudget | null;
  selectionTruncated?: boolean;
  retrieval?: { queries: readonly { city?: string; country?: string }[] };
}
const LABELS = {
  en: {
    planning_interest: 'Planning interest; operator confirmation required.',
    source_specs: 'Compare the recorded display specifications.',
    source_monthly_price: 'Published monthly asking price; current operator quote required.',
    compare_location: 'Compare source coordinates; verify the physical location.',
    compare_sources: 'Compare source evidence before committing.',
    confirm_quotes: 'Request current operator quotes.',
    confirm_availability: 'Confirm date-specific availability.',
    confirm_slots: 'Confirm LED slot, loop and operating specifications.',
    verify_locations: 'Verify board locations before location scoring.',
    request_measurement: 'Request validated traffic and measurement evidence.',
    clarify_coverage: 'Confirm required subarea coverage.',
    confirm_budget: 'What is the media budget and currency?',
    confirm_dates: 'What are the start and exclusive end dates?',
    confirm_market: 'Which city and country should the plan cover?',
    prioritize_areas: 'Which areas must be covered, and what location evidence can confirm them?',
    request_operator_quote:
      'Can the operators confirm current full-flight quotes, taxes and production charges?',
    confirm_slot: 'What LED slot duration, loop and operating hours are required?',
    verify_coordinates: 'Can the operators or a field check verify these coordinates?',
    request_traffic_evidence: 'Is validated, dated traffic evidence available?',
  },
  fr: {
    planning_interest: 'Intérêt de planification ; confirmation de l’opérateur requise.',
    source_specs: 'Comparez les caractéristiques enregistrées des écrans.',
    source_monthly_price: 'Prix mensuel publié ; devis actuel de l’opérateur requis.',
    compare_location: 'Comparez les coordonnées sources ; vérifiez l’emplacement physique.',
    compare_sources: 'Comparez les sources avant tout engagement.',
    confirm_quotes: 'Demandez des devis actuels aux opérateurs.',
    confirm_availability: 'Confirmez la disponibilité pour les dates choisies.',
    confirm_slots: 'Confirmez les créneaux LED, les boucles et les horaires.',
    verify_locations: 'Vérifiez les emplacements avant toute notation géographique.',
    request_measurement: 'Demandez des observations de trafic et des mesures validées.',
    clarify_coverage: 'Confirmez la couverture des zones requises.',
    confirm_budget: 'Quel est le budget média et sa devise ?',
    confirm_dates: 'Quelles sont les dates de début et de fin exclusive ?',
    confirm_market: 'Quelle ville et quel pays faut-il couvrir ?',
    prioritize_areas:
      'Quelles zones sont obligatoires, et quelles preuves peuvent confirmer leur couverture ?',
    request_operator_quote:
      'Les opérateurs peuvent-ils confirmer les devis de diffusion, taxes et frais de production ?',
    confirm_slot: 'Quels créneaux LED, boucles et horaires sont nécessaires ?',
    verify_coordinates:
      'Les opérateurs ou un contrôle terrain peuvent-ils vérifier ces coordonnées ?',
    request_traffic_evidence:
      'Des observations de trafic validées et datées sont-elles disponibles ?',
  },
} as const;
function codes<T extends string>(input: unknown, allowed: readonly T[], maximum: number): T[] {
  return Array.isArray(input)
    ? [
        ...new Set(
          input.filter(
            (value): value is T => typeof value === 'string' && allowed.includes(value as T),
          ),
        ),
      ].slice(0, maximum)
    : [];
}
const money = (amount: number, currency: string, locale: 'en' | 'fr') =>
  `${currency} ${new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 2 }).format(amount)}`;

/** Model text is intentionally inaccessible to the presentation builder. */
export function canonicalRecommendationOutput(
  model: CanonicalChoice,
  facts: CanonicalFacts,
  locale: 'en' | 'fr' = 'en',
) {
  const labels = LABELS[locale],
    french = locale === 'fr';
  const proposed = model.recommendations
    .filter((rec) => {
      const site = facts.sites.find((site) => site.siteId === rec.siteId.toLowerCase());
      return (
        site &&
        !site.isDemo &&
        site.faces.some(
          (face) => face.faceId === rec.faceId.toLowerCase() && face.availability !== 'unavailable',
        )
      );
    })
    .map((rec) => ({
      siteId: rec.siteId.toLowerCase(),
      faceId: rec.faceId.toLowerCase(),
      reasonCode: codes([rec.reasonCode], RECOMMENDATION_REASON_CODES, 1)[0] ?? 'planning_interest',
    }));
  const proposedSites = facts.sites.filter((site) =>
    proposed.some((rec) => rec.siteId === site.siteId),
  );
  const proposedEstimates = proposed
    .map(
      (rec) =>
        proposedSites
          .find((site) => site.siteId === rec.siteId)
          ?.faces.find((face) => face.faceId === rec.faceId)?.estimate,
    )
    .filter((value): value is FaceCostEstimate => Boolean(value));
  const preliminary = summarizeResearchPrices(
    proposedSites,
    facts.window,
    facts.selectionTruncated ? undefined : facts.requestedBudget,
  );
  const ordinaryEstimates = proposed
    .filter((rec) => !proposedSites.find((site) => site.siteId === rec.siteId)?.isResearchReference)
    .map(
      (rec) =>
        proposedSites
          .find((site) => site.siteId === rec.siteId)
          ?.faces.find((face) => face.faceId === rec.faceId)?.estimate,
    )
    .filter((value): value is FaceCostEstimate => Boolean(value));
  const ordinaryBudget = summarizeBudget(ordinaryEstimates, facts.requestedBudget ?? undefined);
  const currencies = [
    ...new Set([...Object.keys(preliminary.totals), ...Object.keys(ordinaryBudget.totals)]),
  ];
  const completePricing =
    proposed.length > 0 &&
    proposedEstimates.length === proposed.length &&
    preliminary.pricedCount === preliminary.referenceCount &&
    ordinaryBudget.pricedCount === ordinaryEstimates.length;
  const comparable =
    completePricing &&
    facts.window &&
    (preliminary.referenceCount === 0 || preliminary.windowComparable) &&
    facts.requestedBudget &&
    currencies.length === 1 &&
    currencies[0] === facts.requestedBudget.currency;
  const knownMediaSubtotal = facts.requestedBudget
    ? (preliminary.totals[facts.requestedBudget.currency] ?? 0) +
      (ordinaryBudget.totals[facts.requestedBudget.currency] ?? 0)
    : null;
  const knownLowerBoundComparable =
    facts.window &&
    (preliminary.referenceCount === 0 || preliminary.windowComparable) &&
    facts.requestedBudget;
  const overBudget = Boolean(
    (comparable || knownLowerBoundComparable) &&
    knownMediaSubtotal! > facts.requestedBudget!.amount,
  );
  const accepted = overBudget ? [] : proposed;
  const sites = overBudget ? [] : proposedSites;
  const estimates = overBudget ? [] : proposedEstimates;
  const researchPrices = summarizeResearchPrices(
    sites,
    facts.window,
    facts.selectionTruncated ? undefined : facts.requestedBudget,
  );
  const budget = summarizeBudget(
    estimates,
    facts.selectionTruncated ? undefined : (facts.requestedBudget ?? undefined),
  );
  const summary = {
    status: overBudget
      ? ('budget_exceeded' as const)
      : accepted.length
        ? ('planning_interest' as const)
        : ('no_recommendations' as const),
    siteIds: sites.map((site) => site.siteId),
    faceIds: accepted.map((rec) => rec.faceId),
    sites: sites.map((site) => ({
      siteId: site.siteId,
      name: site.name,
      city: site.city || null,
      country: site.country || null,
      isResearchReference: site.isResearchReference === true,
    })),
    window: facts.window,
    requestedBudget: facts.requestedBudget,
    budget,
    researchPrices,
    distances: selectionDistances(
      sites.map((site) => ({
        id: site.siteId,
        latitude: site.latitude,
        longitude: site.longitude,
        isResearchReference: site.isResearchReference,
        researchProvenance: site.researchProvenance,
      })),
    ),
    coverage: {
      cities: [...new Set(sites.map((site) => site.city).filter(Boolean))],
      countries: [...new Set(sites.map((site) => site.country).filter(Boolean))],
      subareas: 'unknown' as const,
    },
    availability:
      accepted.length &&
      accepted.every(
        (rec) =>
          sites
            .find((site) => site.siteId === rec.siteId)
            ?.faces.find((face) => face.faceId === rec.faceId)?.availability === 'available',
      ) &&
      !sites.some((site) => site.isResearchReference || site.isDemo)
        ? ('indicative' as const)
        : ('unconfirmed' as const),
    ots: null,
    reach: null,
  };
  const names =
    sites
      .slice(0, 3)
      .map((site) => site.name.slice(0, 160))
      .join(', ') +
    (sites.length > 3
      ? french
        ? ` (+${sites.length - 3} autres)`
        : ` (+${sites.length - 3} more)`
      : '');
  let message = overBudget
    ? french
      ? 'Cette proposition dépasse le plafond média comparable. Aucune recommandation retenue ; précisez les priorités ou le budget.'
      : 'This proposal exceeds the comparable media ceiling. No recommendations accepted; clarify priorities or budget.'
    : accepted.length
      ? french
        ? `Intérêt de planification : ${names}.`
        : `Planning interest: ${names}.`
      : french
        ? 'Aucune recommandation retenue. Précisez les priorités de planification.'
        : 'No recommendations accepted. Clarify planning priorities.';
  if (accepted.length && facts.window)
    message += french
      ? ` Du ${facts.window.startDate} au ${facts.window.endDate} (fin exclusive).`
      : ` ${facts.window.startDate} to ${facts.window.endDate} (end exclusive).`;
  if (accepted.length && researchPrices.referenceCount) {
    const totals = Object.entries(researchPrices.totals)
      .map(([currency, amount]) => money(amount, currency, locale))
      .join(' + ');
    if (totals)
      message += french
        ? ` Prix demandés publiés : ${totals}/mois${researchPrices.unpricedCount ? ' (sous-total partiel)' : ''}.`
        : ` Published asking prices: ${totals}/month${researchPrices.unpricedCount ? ' (partial subtotal)' : ''}.`;
    if (researchPrices.unquotedReserve !== null && facts.requestedBudget)
      message += french
        ? ` Réserve non chiffrée : ${money(researchPrices.unquotedReserve, facts.requestedBudget.currency, locale)}.`
        : ` Unquoted reserve: ${money(researchPrices.unquotedReserve, facts.requestedBudget.currency, locale)}.`;
    if (ordinaryEstimates.length) {
      const ordinaryTotals = Object.entries(ordinaryBudget.totals)
        .map(([currency, amount]) => money(amount, currency, locale))
        .join(' + ');
      if (ordinaryTotals)
        message += french
          ? ` Autres panneaux, sous-total média publié : ${ordinaryTotals}.`
          : ` Other boards, published media subtotal: ${ordinaryTotals}.`;
      message += french
        ? ' Coût combiné et solde non confirmés.'
        : ' Combined cost and remaining balance are unconfirmed.';
    }
    message += french
      ? ' Devis de diffusion, frais et disponibilité non confirmés.'
      : ' Flight quotes, charges and availability are unconfirmed.';
  } else if (accepted.length) {
    const totals = Object.entries(budget.totals)
      .map(([currency, amount]) => money(amount, currency, locale))
      .join(' + ');
    if (totals)
      message += french
        ? ` Sous-total média publié : ${totals}${budget.unpricedCount ? ' (partiel)' : ''}.`
        : ` Published media subtotal: ${totals}${budget.unpricedCount ? ' (partial)' : ''}.`;
    if (budget.unpricedCount)
      message += french ? ' Certains devis sont inconnus.' : ' Some quotes are unknown.';
  }
  message += french
    ? ' Couverture des sous-zones inconnue ; aucune portée ou impression validée. Aucune réservation.'
    : ' Subarea coverage is unknown; validated reach and impressions are unavailable. No reservation.';
  const advice = codes(model.adviceCodes, PLANNING_ADVICE_CODES, 2).map((code) => labels[code]);
  if (advice.length) message += ` ${advice.join(' ')}`;
  const marketKnown =
    facts.retrieval?.queries.some((query) => query.city || query.country) === true;
  const questionCodes = codes(model.questionCodes, PLANNING_QUESTION_CODES, 5).filter((code) =>
    code === 'confirm_budget'
      ? !facts.requestedBudget
      : code === 'confirm_dates'
        ? !facts.window
        : code === 'confirm_market'
          ? !marketKnown
          : true,
  );
  if (!accepted.length && !questionCodes.includes('prioritize_areas'))
    questionCodes.unshift('prioritize_areas');
  if (!facts.requestedBudget && !questionCodes.includes('confirm_budget'))
    questionCodes.unshift('confirm_budget');
  if (!facts.window && !questionCodes.includes('confirm_dates'))
    questionCodes.unshift('confirm_dates');
  return {
    message,
    recommendations: accepted.map((rec) => {
      const site = sites.find((site) => site.siteId === rec.siteId)!;
      const supported =
        rec.reasonCode === 'source_monthly_price'
          ? researchPrices.sources.some((source) => source.siteId === site.siteId)
          : rec.reasonCode === 'source_specs'
            ? Boolean(site.specs?.width && site.specs?.height && site.specs?.units)
            : rec.reasonCode === 'compare_location'
              ? site.latitude !== null && site.longitude !== null
              : true;
      return {
        siteId: rec.siteId,
        faceId: rec.faceId,
        reason: labels[supported ? rec.reasonCode : 'planning_interest'],
      };
    }),
    questions: questionCodes.slice(0, 5).map((code) => labels[code]),
    recommendationSummary: summary,
  };
}

export function canonicalPlanningControls(facts: CanonicalFacts, locale: 'en' | 'fr' = 'en') {
  const cities = [
    ...new Set(
      (facts.retrieval?.queries ?? [])
        .map((query) => query.city)
        .filter((city): city is string => Boolean(city)),
    ),
  ];
  const hasMarket = facts.retrieval?.queries.some((query) => query.city || query.country) === true;
  return {
    constraints: {
      budget: facts.requestedBudget?.amount ?? null,
      currency: facts.requestedBudget?.currency ?? null,
      cities,
      startDate: facts.window?.startDate ?? null,
      endDate: facts.window?.endDate ?? null,
      evidence: [] as string[],
    },
    missing: [
      ...(!facts.requestedBudget ? ['budget', locale === 'fr' ? 'devise' : 'currency'] : []),
      ...(!facts.window ? [locale === 'fr' ? 'dates de diffusion' : 'flight dates'] : []),
      ...(!hasMarket ? [locale === 'fr' ? 'marché ou ville' : 'market or city'] : []),
    ],
  };
}

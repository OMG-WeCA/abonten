import { SUPPORTED_MARKETS } from '../common/supported-markets';
import { extractConstraints } from './brief-constraints';
import type { AssistantMessageDto } from './dto/planning.dto';
import { planningDays, type PlanningWindow } from './planning-math';

export type PlanningRetrievalFormat =
  'static' | 'digital_led' | '3d' | 'tri_vision' | 'mural' | 'transit' | 'street_furniture';
export interface PlanningRetrievalFilters {
  country?: string;
  city?: string;
  format?: PlanningRetrievalFormat;
  search?: string;
}
export type PlanningIntentSource = 'context' | 'message' | 'brief' | 'mixed' | null;
export interface PlanningRetrievalIntent {
  /** Common filters. Union geography/format lives in queries, never a guessed single target. */
  filters: PlanningRetrievalFilters;
  queries: PlanningRetrievalFilters[];
  window: PlanningWindow | null;
  budget: { amount: number; currency: string } | null;
  sources: Record<'geography' | 'format' | 'window' | 'budget' | 'search', PlanningIntentSource>;
  needsConfirmation: ('geography' | 'format' | 'window' | 'budget' | 'search')[];
  queriesTruncated: boolean;
  /** This is a TOTAL read budget across all queries, not three pages per query. */
  maxPages: 3;
  pageSize: 8;
  maxDiscoveries: 24;
}
export interface PlanningRetrieval {
  local: PlanningRetrievalIntent;
  provider: PlanningRetrievalIntent;
  briefUsedLocally: boolean;
  briefShared: boolean;
}
interface Literal {
  value: string;
  aliases: string[];
}
const cities: (Literal & { country: string })[] = [
  { value: 'Lagos', country: 'Nigeria', aliases: ['Lagos'] },
  { value: 'Accra', country: 'Ghana', aliases: ['Accra'] },
  { value: 'Douala', country: 'Cameroon', aliases: ['Douala'] },
  { value: 'Abuja', country: 'Nigeria', aliases: ['Abuja'] },
  { value: 'Benin City', country: 'Nigeria', aliases: ['Benin City'] },
  { value: 'Kumasi', country: 'Ghana', aliases: ['Kumasi'] },
  { value: 'Yaoundé', country: 'Cameroon', aliases: ['Yaoundé', 'Yaounde'] },
  { value: 'Cotonou', country: 'Benin', aliases: ['Cotonou'] },
  { value: 'Porto-Novo', country: 'Benin', aliases: ['Porto-Novo', 'Porto Novo'] },
  { value: 'Abidjan', country: "Côte d'Ivoire", aliases: ['Abidjan'] },
  { value: 'Yamoussoukro', country: "Côte d'Ivoire", aliases: ['Yamoussoukro'] },
];
const countries: Literal[] = SUPPORTED_MARKETS.map((market) => ({
  value: market.name,
  // Short ISO codes are not natural-language country mentions (e.g. "CM" can
  // describe centimetres); explicit filters still support those aliases.
  aliases: market.aliases
    .filter((alias) => alias.length > 3)
    .flatMap((alias) => [alias, alias.replace(/'/g, '’')]),
}));
const formats: Literal[] = [
  { value: 'static', aliases: ['static', 'statique', 'statiques'] },
  {
    value: 'digital_led',
    aliases: ['digital_led', 'digital', 'digitale', 'numérique', 'numériques', 'LED'],
  },
  { value: '3d', aliases: ['3d'] },
  { value: 'tri_vision', aliases: ['tri_vision', 'tri-vision', 'trivision', 'tri vision'] },
  { value: 'mural', aliases: ['mural', 'murals', 'murale', 'murales', 'wall wrap', 'wall wraps'] },
  { value: 'transit', aliases: ['transit', 'bus advertising', 'publicité sur bus'] },
  {
    value: 'street_furniture',
    aliases: [
      'street_furniture',
      'street furniture',
      'mobilier urbain',
      'bus shelter',
      'bus shelters',
    ],
  },
];
const currencies = new Set(['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR']);
function escaped(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function source(message: boolean, brief: boolean): PlanningIntentSource {
  return message && brief ? 'mixed' : message ? 'message' : brief ? 'brief' : null;
}
function literalOptions(text: string, catalog: Literal[], excludedCatalog: Literal[] = []) {
  const mentions: { value: string; index: number; end: number; negated: boolean }[] = [];
  // A country name nested inside a known city is not a second geography.
  // Preserve offsets so alternatives and negations still require confirmation.
  const excludedSpans = excludedCatalog.flatMap((entry) => {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}_])(?:${entry.aliases.map(escaped).join('|')})(?![\\p{L}\\p{N}_])`,
      'giu',
    );
    return [...text.matchAll(pattern)].map((match) => ({
      start: match.index!,
      end: match.index! + match[0].length,
    }));
  });
  for (const entry of catalog) {
    const pattern = new RegExp(
      `(?<![\\p{L}\\p{N}_])(?:${entry.aliases.map(escaped).join('|')})(?![\\p{L}\\p{N}_])`,
      'giu',
    );
    for (const match of text.matchAll(pattern)) {
      if (
        excludedSpans.some(
          (span) => match.index! >= span.start && match.index! + match[0].length <= span.end,
        )
      )
        continue;
      const prefix =
        text
          .slice(Math.max(0, match.index! - 40), match.index!)
          .split(/[.!?;\n]/)
          .at(-1) ?? '';
      mentions.push({
        value: entry.value,
        index: match.index!,
        end: match.index! + match[0].length,
        negated:
          /(?:^|\s)(?:not|no|avoid|exclude|without|except|pas|sans|éviter|exclure|hors)\b/iu.test(
            prefix,
          ),
      });
    }
  }
  mentions.sort((a, b) => a.index - b.index);
  const values = [...new Set(mentions.map((mention) => mention.value))];
  const span = mentions.length > 1 ? text.slice(mentions[0].end, mentions.at(-1)!.index) : '';
  const alternative =
    (values.length > 1 && /(?<![\p{L}_])(?:or|ou|either|soit)(?![\p{L}_])/iu.test(span)) ||
    mentions.some(
      (mention) =>
        /^\s*(?:or|ou)\s+/iu.test(text.slice(mention.end)) ||
        /(?:^|\s)(?:or|ou)\s*$/iu.test(text.slice(Math.max(0, mention.index - 12), mention.index)),
    );
  return { values, ambiguous: alternative || mentions.some((mention) => mention.negated) };
}
/** Explicit labels admit registered markets outside the small known vocabulary.
 * Values remain parameters for MarketplaceService.search, never SQL or tools. */
function labelOptions(text: string, labels: string[], limit: number) {
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${labels.map(escaped).join('|')})\\s*[:=]\\s*`,
    'giu',
  );
  const values: string[] = [];
  let present = false;
  let ambiguous = false;
  for (const match of text.matchAll(pattern)) {
    present = true;
    const remainder = text.slice(match.index! + match[0].length);
    const value = remainder
      .split(/[\r\n;.!?]/)[0]
      .split(
        /(?<![\p{L}_])(?:city|ville|market|marché|country|pays|format|corridor|road|route|axe|budget|start|end|début|fin)\s*[:=]/iu,
      )[0]
      .trim();
    if (
      !value ||
      value.length > limit ||
      !/^[\p{L}\p{N}][\p{L}\p{M}\p{N} '\u2019\-/]*$/u.test(value) ||
      /(?<![\p{L}_])(?:or|ou|either|soit|and|et|not|no|avoid|exclude|sans|pas)(?![\p{L}_])/iu.test(
        value,
      )
    ) {
      ambiguous = true;
      continue;
    }
    if (
      !values.some((existing) => existing.toLocaleLowerCase('en') === value.toLocaleLowerCase('en'))
    )
      values.push(value);
  }
  return { values, present, ambiguous };
}
const cityLabels = ['city', 'ville', 'market', 'marché'];
const countryLabels = ['country', 'pays'];
const searchLabels = ['corridor', 'road', 'route', 'axe'];
function canonicalLabel(value: string, catalog: Literal[]): string {
  return (
    catalog.find((entry) =>
      entry.aliases.some(
        (alias) => alias.toLocaleLowerCase('en') === value.toLocaleLowerCase('en'),
      ),
    )?.value ?? value
  );
}
function cityCountry(value: string): string | undefined {
  return cities.find((entry) => entry.value === value)?.country;
}
function geographyPresent(text: string): boolean {
  return (
    literalOptions(text, [...cities, ...countries]).values.length > 0 ||
    labelOptions(text, cityLabels, 80).present ||
    labelOptions(text, countryLabels, 80).present
  );
}
function validWindow(value: PlanningWindow | null): value is PlanningWindow {
  if (!value) return false;
  const days = planningDays(value);
  return days !== null && days <= 366;
}
function inferredWindow(text: string): PlanningWindow | null {
  const constraints = extractConstraints(text);
  const labeled =
    constraints.startDate && constraints.endDate
      ? { startDate: constraints.startDate, endDate: constraints.endDate }
      : null;
  if (validWindow(labeled)) return labeled;
  // An unlabelled date range has ambiguous end semantics. Only explicit
  // end-exclusive language may supply the existing UTC API flight convention.
  if (!/(?:end\s+exclusive|exclusive\s+end|fin\s+exclusive)/iu.test(text)) return null;
  const ranges = [
    ...text.matchAll(
      /(?<![\p{L}\p{N}_])(\d{4}-\d{2}-\d{2})(?![\p{L}\p{N}_])\s*(?:to|au|à|–|—|\.\.)\s*(\d{4}-\d{2}-\d{2})(?![\p{L}\p{N}_])/giu,
    ),
  ];
  if (ranges.length !== 1) return null;
  const window = { startDate: ranges[0][1], endDate: ranges[0][2] };
  return validWindow(window) ? window : null;
}
function clean(value: string | undefined, limit: number): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, limit) : undefined;
}
function derive(dto: AssistantMessageDto, brief: string): PlanningRetrievalIntent {
  const message = dto.message.slice(0, 4000);
  const text = `${message}\n${brief}`;
  const context = dto.context;
  const filters: PlanningRetrievalFilters = {};
  const sources: PlanningRetrievalIntent['sources'] = {
    geography: null,
    format: null,
    window: null,
    budget: null,
    search: null,
  };
  const needs = new Set<PlanningRetrievalIntent['needsConfirmation'][number]>();
  const country = clean(context?.filters?.country, 80);
  const city = clean(context?.filters?.city, 80);
  const chosenFormat = formats.some((format) => format.value === context?.filters?.format)
    ? (context?.filters?.format as PlanningRetrievalFormat)
    : undefined;
  const labeledCities = labelOptions(text, cityLabels, 80);
  const labeledCountries = labelOptions(text, countryLabels, 80);
  const literalCities = literalOptions(text, cities);
  const literalCountries = literalOptions(text, countries, cities);
  const cityOptions = labeledCities.present
    ? {
        values: labeledCities.values.map((value) => canonicalLabel(value, cities)),
        ambiguous: labeledCities.ambiguous,
      }
    : literalCities;
  const countryOptions = labeledCountries.present
    ? {
        values: labeledCountries.values.map((value) => canonicalLabel(value, countries)),
        ambiguous: labeledCountries.ambiguous,
      }
    : literalCountries;
  const formatOptions = literalOptions(text, formats);
  let geographicAmbiguity: boolean;
  let inferredCities = cityOptions.values;
  let inferredCountries = countryOptions.values;
  if (city || country) {
    if (city) filters.city = city;
    if (country) filters.country = country;
    sources.geography = 'context';
    // A confirmed country permits only an inferred city in that same country.
    if (country && !city) {
      inferredCities = inferredCities.filter(
        (value) => cityCountry(value) === undefined || cityCountry(value) === country,
      );
      if (inferredCities.length !== cityOptions.values.length) needs.add('geography');
    }
    if (city) inferredCities = [];
    inferredCountries = [];
    geographicAmbiguity = !city && cityOptions.ambiguous;
  } else {
    geographicAmbiguity =
      cityOptions.ambiguous ||
      countryOptions.ambiguous ||
      (!cityOptions.values.length &&
        !countryOptions.values.length &&
        /(?:city|country|market|ville|pays|marché)\s*[:=]|(?:[Ii]n|[Àà]|[Dd]ans)\s+\p{Lu}[\p{L}\p{M}'’ -]+/u.test(
          text,
        ));
    sources.geography = source(geographyPresent(message), geographyPresent(brief));
  }
  if (geographicAmbiguity) needs.add('geography');
  if (chosenFormat) {
    filters.format = chosenFormat;
    sources.format = 'context';
  } else {
    sources.format = source(
      literalOptions(message, formats).values.length > 0,
      literalOptions(brief, formats).values.length > 0,
    );
    if (formatOptions.ambiguous) needs.add('format');
  }
  const search = clean(context?.filters?.search, 160);
  if (search) {
    filters.search = search;
    sources.search = 'context';
  } else {
    const labeled = labelOptions(text, searchLabels, 160);
    if (labeled.present) {
      sources.search = source(
        labelOptions(message, searchLabels, 160).present,
        labelOptions(brief, searchLabels, 160).present,
      );
      if (!labeled.ambiguous && labeled.values.length === 1) filters.search = labeled.values[0];
      else needs.add('search');
    }
  }
  // Only explicit labeled corridor text becomes a search parameter; never
  // arbitrary prose, document instructions, model-generated SQL or tool input.
  let window: PlanningWindow | null = null;
  if (context?.window) {
    sources.window = 'context';
    if (validWindow(context.window)) window = { ...context.window };
    else needs.add('window');
  } else {
    window = inferredWindow(text);
    if (window) {
      sources.window = source(Boolean(inferredWindow(message)), Boolean(inferredWindow(brief)));
      if (!sources.window) sources.window = 'mixed';
      needs.add('window');
    } else if (/\d{4}-\d{2}-\d{2}|(?:start|end|flight|début|fin|dates)\s*[:=]/iu.test(text))
      needs.add('window');
  }
  let budget: PlanningRetrievalIntent['budget'] = null;
  if (context?.budget) {
    sources.budget = 'context';
    const supplied = context.budget;
    if (
      Number.isFinite(supplied.amount) &&
      supplied.amount >= 0 &&
      supplied.amount <= 1e12 &&
      currencies.has(supplied.currency)
    )
      budget = { ...supplied };
    else needs.add('budget');
  } else {
    const constraints = extractConstraints(text);
    if (constraints.budget !== null && constraints.currency !== null) {
      budget = { amount: constraints.budget, currency: constraints.currency };
      sources.budget = source(
        extractConstraints(message).budget !== null,
        extractConstraints(brief).budget !== null,
      );
      needs.add('budget');
    } else if (/(?<![\p{L}_])(?:budget|spend|allocation)(?![\p{L}_])/iu.test(text))
      needs.add('budget');
  }
  let geography: PlanningRetrievalFilters[] = [];
  if (!geographicAmbiguity) {
    if (filters.city) geography = [{ ...filters }];
    else if (inferredCities.length)
      geography = inferredCities.map((value) => ({
        ...filters,
        city: value,
        ...((filters.country ??
        cityCountry(value) ??
        (inferredCountries.length === 1 ? inferredCountries[0] : undefined))
          ? { country: filters.country ?? cityCountry(value) ?? inferredCountries[0] }
          : {}),
      }));
    else if (filters.country) geography = [{ ...filters }];
    else if (inferredCountries.length)
      geography = inferredCountries.map((value) => ({ ...filters, country: value }));
    else geography = [{ ...filters }];
  }
  // A literal country/city contradiction is an unresolved requirement, not a
  // license to silently choose one of those markets.
  if (
    !country &&
    !city &&
    inferredCities.length &&
    inferredCountries.length &&
    inferredCities.some(
      (value) =>
        (cityCountry(value) !== undefined && !inferredCountries.includes(cityCountry(value)!)) ||
        (cityCountry(value) === undefined && inferredCountries.length > 1),
    )
  ) {
    needs.add('geography');
    geography = [];
  }
  const allowedFormats = chosenFormat
    ? [chosenFormat]
    : formatOptions.ambiguous
      ? []
      : (formatOptions.values as PlanningRetrievalFormat[]);
  const queries =
    formatOptions.ambiguous && !chosenFormat
      ? []
      : geography.flatMap((item) =>
          allowedFormats.length ? allowedFormats.map((format) => ({ ...item, format })) : [item],
        );
  const common = queries.length
    ? (Object.fromEntries(
        (['country', 'city', 'format', 'search'] as const)
          .filter(
            (key) =>
              queries[0][key] !== undefined &&
              queries.every((query) => query[key] === queries[0][key]),
          )
          .map((key) => [key, queries[0][key]]),
      ) as PlanningRetrievalFilters)
    : filters;
  return {
    filters: common,
    queries: queries.slice(0, 3),
    window,
    budget,
    sources,
    needsConfirmation: [...needs],
    queriesTruncated: queries.length > 3,
    maxPages: 3,
    pageSize: 8,
    maxDiscoveries: 24,
  };
}

/** Pure literal retrieval; no model tools, database operations, mutation or raw evidence. */
export function derivePlanningRetrieval(dto: AssistantMessageDto): PlanningRetrieval {
  const brief = (dto.briefText ?? '').slice(0, 60000);
  const briefShared = dto.shareBriefWithProvider === true && Boolean(brief.trim());
  return {
    local: derive(dto, brief),
    provider: derive(dto, briefShared ? brief : ''),
    briefUsedLocally: Boolean(brief.trim()),
    briefShared,
  };
}

/** Canonical registration markets; geographic enrichment coverage is separate. */
export interface SupportedMarket {
  code: string;
  name: string;
  labels: { en: string; fr: string };
  currency: string;
  timezone: string;
  center: [number, number];
  bounds: { south: number; north: number; west: number; east: number };
  aliases: string[];
}

// The shared package is source-only TypeScript. Load its canonical JSON at runtime
// so the Nest CommonJS runtime needs no TypeScript loader or duplicated values.
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const SUPPORTED_MARKETS: readonly SupportedMarket[] = require('@abonten/contracts/markets.json');

export function normalizeMarketName(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function findMarket(input: string | undefined | null): SupportedMarket | undefined {
  if (!input) return undefined;
  const normalized = normalizeMarketName(input);
  return SUPPORTED_MARKETS.find((market) =>
    [market.code, market.name, market.labels.en, market.labels.fr, ...market.aliases].some(
      (name) => normalizeMarketName(name) === normalized,
    ),
  );
}

export function marketLabel(input: string, locale: 'en' | 'fr'): string {
  return findMarket(input)?.labels[locale] ?? input;
}

export function isWithinMarket(
  latitude: number,
  longitude: number,
  input: string,
): boolean | undefined {
  const market = findMarket(input);
  if (!market) return undefined;
  const { south, north, west, east } = market.bounds;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= south &&
    latitude <= north &&
    longitude >= west &&
    longitude <= east
  );
}

/** Preserve unknown legacy markets, canonicalize every supported alias. */
export function canonicalCountry(value: unknown): unknown {
  return typeof value === 'string' ? (findMarket(value)?.name ?? value) : value;
}

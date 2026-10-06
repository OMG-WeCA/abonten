/** Product markets. Bounding boxes are plausibility checks, not legal borders or enrichment coverage. */
export type MarketLocale = 'en' | 'fr';
export interface SupportedMarket {
  code: 'NG' | 'GH' | 'BJ' | 'CI' | 'CM';
  name: string;
  labels: Record<MarketLocale, string>;
  currency: 'NGN' | 'GHS' | 'XOF' | 'XAF';
  timezone: string;
  center: readonly [number, number];
  bounds: { south: number; north: number; west: number; east: number };
  aliases: readonly string[];
}
import marketData from './markets.json';
export const SUPPORTED_MARKETS: readonly SupportedMarket[] =
  marketData as unknown as SupportedMarket[];
export function normalizeMarketName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
export function findMarket(input: string | null | undefined): SupportedMarket | undefined {
  if (!input) return undefined;
  const normalized = normalizeMarketName(input);
  return SUPPORTED_MARKETS.find((market) =>
    market.aliases.some((alias) => normalizeMarketName(alias) === normalized),
  );
}
export function marketLabel(input: string, locale: MarketLocale = 'en'): string {
  return findMarket(input)?.labels[locale] ?? input;
}
export function isWithinMarket(latitude: number, longitude: number, input: string): boolean {
  const market = findMarket(input);
  if (!market || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  const { south, north, west, east } = market.bounds;
  return latitude >= south && latitude <= north && longitude >= west && longitude <= east;
}

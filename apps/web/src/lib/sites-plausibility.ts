// Client mirror of the server's entry plausibility rules
// (apps/api/src/inventory/inventory-validation.ts, SPEC §5.1 trust contract 6).
// The server enforces the same checks — the client catches them early so the
// partner can fix a typo before it ever posts.

import { parseDecimal } from './number-format';
import { SUPPORTED_MARKETS, findMarket, normalizeMarketName } from './markets';
export const COUNTRY_BOUNDS = Object.fromEntries(
  SUPPORTED_MARKETS.map((market) => [
    normalizeMarketName(market.name),
    {
      minLat: market.bounds.south,
      maxLat: market.bounds.north,
      minLng: market.bounds.west,
      maxLng: market.bounds.east,
    },
  ]),
);

export const ILLUMINATION_HOURS_PATTERN =
  /^\s*24\s*\/\s*7\s*$|^\s*([01]?\d|2[0-3]):[0-5]\d\s*[-\u2013\u2014]\s*([01]?\d|2[0-3]):[0-5]\d\s*$/;

export interface PlausibilityInput {
  latitude?: number;
  longitude?: number;
  country?: string;
  orientationDeg?: number;
  viewingDistance?: number;
  elevation?: number;
  illuminationHours?: string;
}

/**
 * Returns localized problem messages for the given input, keyed by form field.
 * Field mapping matters for first-error focus (execution plan §1.5.3).
 */
export function plausibilityErrors(input: PlausibilityInput): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  if (input.orientationDeg !== undefined) {
    if (
      !Number.isFinite(input.orientationDeg) ||
      input.orientationDeg < 0 ||
      input.orientationDeg > 359
    ) {
      errors.orientationDeg = 'errorOrientation';
    }
  }
  if (
    input.viewingDistance !== undefined &&
    (!Number.isFinite(input.viewingDistance) || input.viewingDistance <= 0)
  ) {
    errors.viewingDistance = 'errorViewingDistance';
  }
  if (input.elevation !== undefined && (!Number.isFinite(input.elevation) || input.elevation < 0)) {
    errors.elevation = 'errorElevation';
  }
  if (
    input.illuminationHours !== undefined &&
    input.illuminationHours.trim() !== '' &&
    !ILLUMINATION_HOURS_PATTERN.test(input.illuminationHours)
  ) {
    errors.illuminationHours = 'errorIlluminationHours';
  }
  const market = findMarket(input.country);
  const box = market ? COUNTRY_BOUNDS[normalizeMarketName(market.name)] : undefined;
  if (
    box &&
    input.latitude !== undefined &&
    input.longitude !== undefined &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude) &&
    (input.latitude < box.minLat ||
      input.latitude > box.maxLat ||
      input.longitude < box.minLng ||
      input.longitude > box.maxLng)
  ) {
    errors.latitude = 'errorCountryBox';
  }
  return errors;
}

/** Nonempty optional measurements must parse before absent values are omitted. */
export function optionalStructureNumberErrors(
  values: Partial<Record<StructureField, string>>,
): Partial<Record<StructureField, 'errorNumber'>> {
  const errors: Partial<Record<StructureField, 'errorNumber'>> = {};
  for (const field of STRUCTURE_FIELDS) {
    const raw = values[field];
    if (raw?.trim() && parseDecimal(raw) === null) errors[field] = 'errorNumber';
  }
  return errors;
}

/** Structure fields that must carry provenance when hand-entered. */
export const STRUCTURE_FIELDS = ['orientationDeg', 'viewingDistance', 'elevation'] as const;
export type StructureField = (typeof STRUCTURE_FIELDS)[number];

export function structureValuesEntered(values: {
  orientationDeg?: unknown;
  viewingDistance?: unknown;
  elevation?: unknown;
}): boolean {
  return STRUCTURE_FIELDS.some((field) => {
    const raw = values[field];
    return raw !== undefined && String(raw).trim() !== '';
  });
}

/** Photos older than 12 months draw a replace suggestion (SPEC §5.1 item 4). */
export function isOlderThanTwelveMonths(
  dateIso: string | null | undefined,
  now = new Date(),
): boolean {
  if (!dateIso) return false;
  const when = new Date(dateIso);
  if (Number.isNaN(when.getTime())) return false;
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  return when.getTime() < twelveMonthsAgo.getTime();
}

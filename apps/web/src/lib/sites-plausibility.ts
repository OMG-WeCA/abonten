// Client mirror of the server's entry plausibility rules
// (apps/api/src/inventory/inventory-validation.ts, SPEC §5.1 trust contract 6).
// The server enforces the same checks — the client catches them early so the
// partner can fix a typo before it ever posts.

export const COUNTRY_BOUNDS: Record<
  string,
  { minLat: number; maxLat: number; minLng: number; maxLng: number }
> = {
  nigeria: { minLat: 3.6, maxLat: 14.0, minLng: 2.2, maxLng: 15.0 },
  ghana: { minLat: 4.2, maxLat: 11.3, minLng: -3.6, maxLng: 1.5 },
  cameroon: { minLat: 1.2, maxLat: 13.3, minLng: 7.9, maxLng: 16.5 },
};

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
    if (!Number.isFinite(input.orientationDeg) || input.orientationDeg < 0 || input.orientationDeg > 359) {
      errors.orientationDeg = 'errorOrientation';
    }
  }
  if (input.viewingDistance !== undefined && (!Number.isFinite(input.viewingDistance) || input.viewingDistance <= 0)) {
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
  const country = (input.country ?? '').trim().toLowerCase();
  const box = COUNTRY_BOUNDS[country];
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

/** Structure fields that must carry provenance when hand-entered. */
export const STRUCTURE_FIELDS = ['orientationDeg', 'viewingDistance', 'elevation'] as const;
export type StructureField = (typeof STRUCTURE_FIELDS)[number];

export function structureValuesEntered(
  values: { orientationDeg?: unknown; viewingDistance?: unknown; elevation?: unknown },
): boolean {
  return STRUCTURE_FIELDS.some((field) => {
    const raw = values[field];
    return raw !== undefined && String(raw).trim() !== '';
  });
}

/** Photos older than 12 months draw a replace suggestion (SPEC §5.1 item 4). */
export function isOlderThanTwelveMonths(dateIso: string | null | undefined, now = new Date()): boolean {
  if (!dateIso) return false;
  const when = new Date(dateIso);
  if (Number.isNaN(when.getTime())) return false;
  const twelveMonthsAgo = new Date(now);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  return when.getTime() < twelveMonthsAgo.getTime();
}
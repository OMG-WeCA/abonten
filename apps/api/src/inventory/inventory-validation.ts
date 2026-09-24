/**
 * Entry plausibility checks for inventory capture (execution plan §1.4 /
 * SPEC §5.1 trust contract item 6). Pure functions so the same rules run in
 * API tests and mirror the client-side checks exactly.
 *
 * The bar is deliberately "catch the worst errors", not "judge truth": a
 * compass reading inside the country box is accepted; a 300 vs 30 typo is not.
 */

export interface PlausibilityInput {
  latitude?: number;
  longitude?: number;
  country?: string;
  orientationDeg?: number;
  viewingDistance?: number;
  elevation?: number;
  illuminationHours?: string;
}

/** Generous bounding boxes; borders are fuzzy, so these over-cover by design. */
export const COUNTRY_BOUNDS: Record<string, { minLat: number; maxLat: number; minLng: number; maxLng: number }> = {
  nigeria: { minLat: 3.6, maxLat: 14.0, minLng: 2.2, maxLng: 15.0 },
  ghana: { minLat: 4.2, maxLat: 11.3, minLng: -3.6, maxLng: 1.5 },
  cameroon: { minLat: 1.2, maxLat: 13.3, minLng: 7.9, maxLng: 16.5 },
};

/**
 * Illumination hours: either around-the-clock ('24/7') or a 24h time range
 * like '18:00-06:00' (en dash/colon spacing tolerated). Retained seed data
 * uses both shapes; anything else is asked to be corrected, not reinterpreted.
 */
export const ILLUMINATION_HOURS_PATTERN = /^\s*24\s*\/\s*7\s*$|^\s*([01]?\d|2[0-3]):[0-5]\d\s*[-\u2013\u2014]\s*([01]?\d|2[0-3]):[0-5]\d\s*$/;

export function plausibilityProblems(input: PlausibilityInput): string[] {
  const problems: string[] = [];
  if (input.latitude !== undefined && (!Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90)) {
    problems.push('latitude must be between -90 and 90');
  }
  if (input.longitude !== undefined && (!Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180)) {
    problems.push('longitude must be between -180 and 180');
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
    problems.push(`coordinates fall outside ${country}'s bounding box — check the pin`);
  }
  if (input.orientationDeg !== undefined && (!Number.isFinite(input.orientationDeg) || input.orientationDeg < 0 || input.orientationDeg > 359)) {
    problems.push('orientation must be between 0 and 359 degrees');
  }
  if (input.viewingDistance !== undefined && (!Number.isFinite(input.viewingDistance) || input.viewingDistance <= 0)) {
    problems.push('viewing distance must be greater than 0');
  }
  if (input.elevation !== undefined && (!Number.isFinite(input.elevation) || input.elevation < 0)) {
    problems.push('elevation cannot be negative');
  }
  if (input.illuminationHours !== undefined && input.illuminationHours.trim() !== '' && !ILLUMINATION_HOURS_PATTERN.test(input.illuminationHours)) {
    problems.push('illumination hours should look like 18:00-06:00 or 24/7');
  }
  return problems;
}

/** Provenance is required when a structure attribute is typed by hand. */
export interface StructureProvenance {
  source?: string;
  method?: string;
  collectedAt?: string;
}

export const STRUCTURE_FIELDS = ['orientationDeg', 'viewingDistance', 'elevation'] as const;
export type StructureField = (typeof STRUCTURE_FIELDS)[number];

/** The structure fields a create/update actually touches. */
export function structureFieldsTouched(
  dto: { orientationDeg?: number | null; viewingDistance?: number | null; elevation?: number | null },
  current?: { orientationDeg?: number | null; viewingDistance?: number | null; elevation?: number | null },
): StructureField[] {
  const touched: StructureField[] = [];
  for (const field of STRUCTURE_FIELDS) {
    const incoming = dto[field];
    if (incoming === undefined) continue;
    const current0 = current ? current[field] : undefined;
    // On create (no current) any provided value is fresh; on update only a real
    // change re-asks for provenance.
    if (current0 === undefined || Number(incoming) !== Number(current0)) touched.push(field);
  }
  return touched;
}
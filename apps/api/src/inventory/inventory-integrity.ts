import {
  siteMediaProblems,
  siteMediaEligibilitySql,
  type RequiredSiteMedia,
} from './site-media-requirements';
/** Inventory validity shared by writes, moderation and current buyer eligibility. */
export const UTC_TODAY_SQL = "(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date";
export const INVENTORY_CURRENCIES = ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'] as const;
export const INVENTORY_FORMATS = [
  'static',
  'digital_led',
  '3d',
  'tri_vision',
  'mural',
  'transit',
  'street_furniture',
] as const;

type Dimensions = { width?: unknown; height?: unknown; area?: unknown };
export type IntegrityFace = Dimensions & {
  id?: string;
  faceLabel?: unknown;
  bookable?: boolean;
  pixelWidth?: unknown;
  pixelHeight?: unknown;
  spotLengthSeconds?: unknown;
  loopLengthSeconds?: unknown;
  spotsPerLoop?: unknown;
};
export type IntegritySite = Dimensions & {
  name?: unknown;
  city?: unknown;
  country?: unknown;
  format?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  permitExpiresAt?: Date | string | null;
  mediaRequirementsVersion?: number;
  isDemo?: boolean;
  isResearchReference?: boolean;
};
export type IntegrityRate = {
  faceId?: string | null;
  currency?: unknown;
  rates?: Record<string, unknown>;
  effectiveFrom: Date | string;
  effectiveTo?: Date | string | null;
};
export function dimensionProblems(input: Dimensions): string[] {
  const width = Number(input.width),
    height = Number(input.height),
    area = Number(input.area);
  const problems: string[] = [];
  if (!Number.isFinite(width) || width <= 0) problems.push('width must be greater than 0');
  if (!Number.isFinite(height) || height <= 0) problems.push('height must be greater than 0');
  if (problems.length) return problems;
  const expected = width * height;
  if (!Number.isFinite(expected)) problems.push('dimensions are too large');
  if (
    input.area != null &&
    (!Number.isFinite(area) || Math.abs(area - expected) > Math.max(1, expected) * 1e-8)
  )
    problems.push('area must equal width × height in the recorded units');
  return problems;
}

export function digitalProblems(face: IntegrityFace, complete = false): string[] {
  const problems: string[] = [];
  for (const key of ['pixelWidth', 'pixelHeight', 'spotsPerLoop'] as const) {
    if (face[key] != null && (!Number.isInteger(face[key]) || Number(face[key]) < 1))
      problems.push(`${key} must be a positive integer`);
  }
  for (const key of ['spotLengthSeconds', 'loopLengthSeconds'] as const) {
    if (face[key] != null && (!Number.isFinite(face[key]) || Number(face[key]) <= 0))
      problems.push(`${key} must be greater than 0`);
  }
  const spot = Number(face.spotLengthSeconds),
    loop = Number(face.loopLengthSeconds);
  if (spot > 0 && loop > 0) {
    if (spot > loop) problems.push('spot length cannot exceed loop length');
    else if (Number(face.spotsPerLoop) > 0 && spot * Number(face.spotsPerLoop) > loop + 1e-8)
      problems.push('the recorded spots must fit inside the loop');
  }
  if (
    complete &&
    ['pixelWidth', 'pixelHeight', 'spotLengthSeconds', 'loopLengthSeconds', 'spotsPerLoop'].some(
      (key) => (face as Record<string, unknown>)[key] == null,
    )
  )
    problems.push('complete the pixel and loop/spot details for each bookable digital face');
  return problems;
}

export function siteIntegrityProblems(site: IntegritySite): string[] {
  const problems = dimensionProblems(site);
  for (const key of ['name', 'city', 'country'] as const)
    if (typeof site[key] !== 'string' || !site[key].trim()) problems.push(`${key} is required`);
  if (typeof site.format !== 'string' || !site.format.trim()) problems.push('format is required');
  else if (!INVENTORY_FORMATS.includes(site.format as never))
    problems.push('choose a supported billboard format');
  return problems;
}

function day(value: Date | string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}
export function currentRate(rate: IntegrityRate, today: string): boolean {
  return (
    INVENTORY_CURRENCIES.includes(rate.currency as never) &&
    !!day(rate.effectiveFrom) &&
    day(rate.effectiveFrom) <= today &&
    (!rate.effectiveTo || day(rate.effectiveTo) >= today) &&
    Object.values(rate.rates ?? {}).some(
      (price) => typeof price === 'number' && Number.isFinite(price) && price > 0,
    )
  );
}

export function publicationProblems(
  site: IntegritySite,
  faces: IntegrityFace[],
  rates: IntegrityRate[],
  datedFront: boolean | RequiredSiteMedia[],
  today = new Date().toISOString().slice(0, 10),
): string[] {
  if (site.isResearchReference) return []; // Existing references remain explicitly non-commercial.
  const problems = siteIntegrityProblems(site);
  if (!Number.isFinite(Number(site.latitude)) || Math.abs(Number(site.latitude)) > 90)
    problems.push('latitude must be between -90 and 90');
  if (!Number.isFinite(Number(site.longitude)) || Math.abs(Number(site.longitude)) > 180)
    problems.push('longitude must be between -180 and 180');
  if (!site.isDemo)
    problems.push(
      ...siteMediaProblems(
        Array.isArray(datedFront)
          ? datedFront
          : datedFront
            ? [{ kind: 'front', capturedAt: 'known' }]
            : [],
        site.mediaRequirementsVersion ?? 1,
      ),
    );
  if (site.permitExpiresAt && day(site.permitExpiresAt) < today)
    problems.push('the recorded permit has expired');
  const bookable = faces.filter((face) => face.bookable);
  if (!bookable.length) problems.push('add at least one bookable face');
  for (const face of bookable) {
    if (typeof face.faceLabel !== 'string' || !face.faceLabel.trim())
      problems.push('face label is required');
    problems.push(...dimensionProblems(face));
    problems.push(...digitalProblems(face, site.format === 'digital_led'));
    if (
      !rates.some((rate) => (!rate.faceId || rate.faceId === face.id) && currentRate(rate, today))
    )
      problems.push('add a current rate for each bookable face');
  }
  return [...new Set(problems)];
}

/** Same current eligibility in list SQL; no read mutates legacy/shared records. */
export function listingEligibilitySql(alias = 's'): string {
  const s = alias ? alias + '.' : 'billboard_sites.';
  const dimensions = (p: string) =>
    `(${p}width > 0 AND ${p}height > 0 AND ${p}width < 'Infinity'::float8 AND ${p}height < 'Infinity'::float8 AND COALESCE(${p}area, ${p}width * ${p}height) < 'Infinity'::float8 AND abs(COALESCE(${p}area, ${p}width * ${p}height) - ${p}width * ${p}height) <= greatest(1, ${p}width * ${p}height) * 1e-8)`;
  const currencies = INVENTORY_CURRENCIES.map((v) => `'${v}'`).join(',');
  const formats = INVENTORY_FORMATS.map((v) => `'${v}'`).join(',');
  // Optional measurements must be coherent on every format; only digital sites
  // require all five fields. Keep the partial-draft rules aligned with digitalProblems.
  const digital = [
    ...['pixel_width', 'pixel_height', 'spots_per_loop'].map(
      (key) => `(f.${key} IS NULL OR f.${key} > 0)`,
    ),
    ...['spot_length_seconds', 'loop_length_seconds'].map(
      (key) => `(f.${key} IS NULL OR (f.${key} > 0 AND f.${key} < 'Infinity'::float8))`,
    ),
    '(f.spot_length_seconds IS NULL OR f.loop_length_seconds IS NULL OR f.spot_length_seconds <= f.loop_length_seconds)',
    '(f.spot_length_seconds IS NULL OR f.loop_length_seconds IS NULL OR f.spots_per_loop IS NULL OR f.spot_length_seconds * f.spots_per_loop <= f.loop_length_seconds + 1e-8)',
    `(${s}format <> 'digital_led' OR (f.pixel_width IS NOT NULL AND f.pixel_height IS NOT NULL AND f.spot_length_seconds IS NOT NULL AND f.loop_length_seconds IS NOT NULL AND f.spots_per_loop IS NOT NULL))`,
  ].join(' AND ');
  const face = `btrim(f.face_label) <> '' AND ${dimensions('f.')} AND ${digital}`;
  const rate = `EXISTS (SELECT 1 FROM rate_cards r WHERE r.site_id = ${s}id::text AND (r.face_id IS NULL OR r.face_id = f.id::text) AND r.currency IN (${currencies}) AND (r.effective_from AT TIME ZONE 'UTC')::date <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date AND (r.effective_to IS NULL OR (r.effective_to AT TIME ZONE 'UTC')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date) AND ((r.rates->>'perDay')::numeric > 0 OR (r.rates->>'perWeek')::numeric > 0 OR (r.rates->>'perMonth')::numeric > 0))`;
  return `(${s}research_agency_id IS NOT NULL OR (btrim(${s}name) <> '' AND btrim(${s}city) <> '' AND btrim(${s}country) <> '' AND ${s}latitude BETWEEN -90 AND 90 AND ${s}longitude BETWEEN -180 AND 180 AND ${s}format IN (${formats}) AND ${dimensions(s)} AND (${s}permit_expires_at IS NULL OR (${s}permit_expires_at AT TIME ZONE 'UTC')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date) AND (${s}demo_agency_id IS NOT NULL OR ${siteMediaEligibilitySql(s)}) AND EXISTS (SELECT 1 FROM site_faces f WHERE f.site_id = ${s}id::text AND f.bookable) AND NOT EXISTS (SELECT 1 FROM site_faces f WHERE f.site_id = ${s}id::text AND f.bookable AND ((${face}) IS NOT TRUE OR NOT (${rate})))))`;
}
export function effectiveStatusSql(alias = 's'): string {
  const s = alias ? alias + '.' : 'billboard_sites.';
  return `(CASE WHEN ${s}status = 'listed' AND (${listingEligibilitySql(alias)}) IS NOT TRUE THEN 'draft' ELSE ${s}status END)`;
}

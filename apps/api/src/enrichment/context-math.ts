import type {
  ContextMetric,
  ContextProvenance,
  PopulationContext,
} from '@abonten/contracts/enrichment';

export const CONTEXT_RADII = [250, 500, 1000] as const;
export const CONTEXT_DISCLAIMER =
  'Geographic context only. Modelled residents and mapped features are not audience, reach, impressions or measured traffic.';

export function unavailable<T>(
  method: string,
  warning = 'No production reference import is available.',
): ContextMetric<T> {
  return { status: 'unavailable', value: null, method, provenance: null, warnings: [warning] };
}

export function populationMetric(
  row: { people: number | null; validArea: number; rasterArea: number; catchmentArea: number },
  provenance: ContextProvenance,
): ContextMetric<PopulationContext> {
  const fraction = (area: number) => Math.max(0, Math.min(1, area / row.catchmentArea));
  const validCoverageFraction = fraction(Number(row.validArea));
  const rasterCoverageFraction = fraction(Number(row.rasterArea));
  // Only tolerate numerical area noise; any meaningful NoData remains partial.
  const covered = validCoverageFraction >= 1 - 1e-6;
  const people = row.people === null || validCoverageFraction <= 0 ? null : Number(row.people);
  return {
    status: people === null ? 'unavailable' : covered ? 'available' : 'partial',
    value: { people, validCoverageFraction, rasterCoverageFraction, unit: 'people' },
    method:
      'Area-weighted sum of persons per pixel, using geodesic pixel/catchment intersection; no extrapolation across NoData or outside the raster.',
    provenance,
    warnings: [
      'Modelled residential population, not measured audience or daytime footfall.',
      ...(covered
        ? []
        : ['Incomplete valid raster coverage; reported residents cover only valid cell areas.']),
      ...provenance.warnings,
    ],
  };
}

/** Conservative read window, not a distance calculation; PostGIS performs the exact clipping. */
export function catchmentReadBounds(
  latitude: number,
  longitude: number,
  radius = 1100,
): [number, number, number, number] {
  const latDelta = radius / 110000;
  const lonDelta = radius / (110000 * Math.max(0.01, Math.cos((latitude * Math.PI) / 180)));
  return [longitude - lonDelta, latitude - latDelta, longitude + lonDelta, latitude + latDelta];
}

/** Derived read projection only: never rewrites original photo evidence or its
 * append-only upload audit. Owner and buyer detail use the same current pin. */
export function projectMediaAssetEvidence<T extends { metadata?: Record<string, unknown> | null }>(
  asset: T,
  currentSitePin: { latitude: unknown; longitude: unknown },
): T {
  if (!asset.metadata) return asset;
  const metadata = asset.metadata;
  const location =
    metadata.location !== null &&
    typeof metadata.location === 'object' &&
    !Array.isArray(metadata.location)
      ? (metadata.location as Record<string, unknown>)
      : {};
  const latitude = coordinate(location.latitude, 90),
    longitude = coordinate(location.longitude, 180);
  const pinLatitude = coordinate(currentSitePin.latitude, 90),
    pinLongitude = coordinate(currentSitePin.longitude, 180);
  const comparable =
    ['exif', 'device_gps'].includes(String(location.source)) &&
    latitude !== null &&
    longitude !== null &&
    pinLatitude !== null &&
    pinLongitude !== null;
  const distance = comparable
    ? evidenceDistanceMeters(
        { latitude, longitude },
        { latitude: pinLatitude, longitude: pinLongitude },
      )
    : null;
  const codes = Array.isArray(metadata.warningCodes)
    ? metadata.warningCodes.filter((code): code is string => typeof code === 'string')
    : [];
  const warnings = Array.isArray(metadata.warnings)
    ? metadata.warnings.filter((message): message is string => typeof message === 'string')
    : [];
  const currentCodes = codes.filter((code) => code !== 'photo_pin_distance');
  const currentWarnings = warnings.filter(
    (message, index) =>
      codes[index] !== 'photo_pin_distance' && !message.startsWith('Photo location differs'),
  );
  const accuracy =
    typeof location.accuracyMeters === 'number' &&
    Number.isFinite(location.accuracyMeters) &&
    location.accuracyMeters >= 0
      ? location.accuracyMeters
      : 0;
  if (distance !== null && distance > Math.max(100, accuracy)) {
    currentCodes.push('photo_pin_distance');
    currentWarnings.push(
      'Photo location differs from the current site pin; check the photo and location. This is not an independently verified mismatch.',
    );
  }
  return {
    ...asset,
    metadata: {
      ...metadata,
      evidenceDistanceMeters: distance,
      comparisonScope: 'current_site_pin',
      warningCodes: currentCodes,
      warnings: currentWarnings,
    },
  };
}

function coordinate(value: unknown, limit: number): number | null {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export function evidenceDistanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number | null {
  const numbers = [a.latitude, a.longitude, b.latitude, b.longitude];
  if (
    numbers.some((v) => typeof v !== 'number' || !Number.isFinite(v)) ||
    Math.abs(a.latitude) > 90 ||
    Math.abs(b.latitude) > 90 ||
    Math.abs(a.longitude) > 180 ||
    Math.abs(b.longitude) > 180
  )
    return null;
  const rad = (n: number) => (n * Math.PI) / 180;
  const x =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return Math.round(6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, x))));
}

import { createHash } from 'node:crypto';
import { findMarket } from '../../common/supported-markets';

export const LOCATION_POLICY_VERSION = 'address-pin-v1';
/** Street-side board offsets and imperfect address points are tolerated up to 250 m. */
export const LOCATION_TOLERANCE_METERS = 250;
export interface LocationInput {
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country: string;
  latitude: number;
  longitude: number;
}
export interface GeocodingCandidate {
  latitude: number;
  longitude: number;
  countryCode: string;
  featureType: string;
  accuracy: string;
  confidence: string;
  /** Explicitly unmatched components are never silently promoted to an exact match. */
  componentsMatched: boolean;
}
export interface LocationVerification {
  status: 'matched' | 'mismatch' | 'unable_to_verify';
  reasonCode: string;
  distanceMeters: number | null;
  toleranceMeters: number;
  policyVersion: string;
  checkedAt: string;
  inputFingerprint: string;
  provider: 'mapbox' | null;
  message: string;
  /** An inconclusive retry cannot erase an established mismatch for unchanged inputs. */
  lastAttempt?: {
    status: 'unable_to_verify';
    reasonCode: string;
    checkedAt: string;
    provider: 'mapbox' | null;
    message: string;
  };
}
const normalized = (value: string | null | undefined) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ');
export function locationCountryCode(country: string): string | null {
  return findMarket(country)?.code.toLowerCase() ?? null;
}
export function locationFingerprint(input: LocationInput): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        address: normalized(input.address),
        city: normalized(input.city),
        region: normalized(input.region),
        country: locationCountryCode(input.country) ?? normalized(input.country),
        latitude: Number(input.latitude),
        longitude: Number(input.longitude),
      }),
    )
    .digest('hex');
}
export function locationDistanceMeters(a: LocationInput, b: GeocodingCandidate): number {
  const rad = Math.PI / 180;
  const dlat = (b.latitude - a.latitude) * rad;
  const dlng = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dlng / 2) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function locationMessage(status: LocationVerification['status'], locale = 'en'): string {
  if (locale === 'fr') {
    if (status === 'mismatch')
      return 'Examen automatique : l’adresse précise et le repère sont distants de plus de 250 m. Corrigez l’adresse ou le repère, puis soumettez à nouveau. Le site reste non publié.';
    if (status === 'matched')
      return 'L’adresse et le repère correspondent à moins de 250 m. Le site doit encore être approuvé avant publication.';
    return 'Impossible de vérifier l’adresse avec certitude. Précisez l’adresse et vérifiez le repère ; la soumission reste non publiée pour examen.';
  }
  if (status === 'mismatch')
    return 'Automatically reviewed: the precise address and map pin are more than 250 m apart. Correct the address or pin, then resubmit. The site remains unpublished.';
  if (status === 'matched')
    return 'The address and map pin agree within 250 m. The site still needs approval before publication.';
  return 'Couldn’t verify the address with certainty. Add a precise address and check the pin; the submission remains unpublished for review.';
}
export function locationRecheckMessage(locale = 'en'): string {
  return locale === 'fr'
    ? 'La dernière vérification est inconclusive. L’écart confirmé précédemment reste applicable ; corrigez l’adresse ou le repère, ou réessayez la vérification. Le site reste non publié.'
    : 'The latest check was inconclusive. The previously confirmed mismatch still applies; correct the address or pin, or retry verification. The site remains unpublished.';
}
export function locationDecision(
  input: LocationInput,
  candidates: GeocodingCandidate[],
  locale = 'en',
  failureReason?: string,
): LocationVerification {
  let status: LocationVerification['status'] = 'unable_to_verify';
  let reasonCode = failureReason ?? 'no_precise_match';
  let distanceMeters: number | null = null;
  const validPin =
    Number.isFinite(input.latitude) &&
    Math.abs(input.latitude) <= 90 &&
    Number.isFinite(input.longitude) &&
    Math.abs(input.longitude) <= 180;
  if (!validPin) reasonCode = 'invalid_coordinates';
  else if (!locationCountryCode(input.country)) reasonCode = 'unsupported_country';
  else if (!input.address?.trim() || !input.city?.trim()) reasonCode = 'address_incomplete';
  else if (!failureReason) {
    // Requiring exactly one result prevents selection of a convenient first result.
    // City/street/parcel centroids, interpolated addresses and low/medium confidence stay uncertain.
    if (candidates.length > 1) reasonCode = 'ambiguous_address';
    else if (candidates.length === 1) {
      const candidate = candidates[0];
      if (candidate.countryCode.toLowerCase() !== locationCountryCode(input.country))
        reasonCode = 'country_uncertain';
      else if (
        candidate.featureType !== 'address' ||
        !['rooftop', 'point'].includes(candidate.accuracy) ||
        !['exact', 'high'].includes(candidate.confidence) ||
        !candidate.componentsMatched ||
        !Number.isFinite(candidate.latitude) ||
        Math.abs(candidate.latitude) > 90 ||
        !Number.isFinite(candidate.longitude) ||
        Math.abs(candidate.longitude) > 180
      )
        reasonCode = 'insufficient_precision';
      else {
        distanceMeters = Math.round(locationDistanceMeters(input, candidate));
        // Compare unrounded distance at the threshold.
        status =
          locationDistanceMeters(input, candidate) > LOCATION_TOLERANCE_METERS
            ? 'mismatch'
            : 'matched';
        reasonCode = status === 'mismatch' ? 'address_pin_mismatch' : 'address_pin_match';
      }
    }
  }
  return {
    status,
    reasonCode,
    distanceMeters,
    toleranceMeters: LOCATION_TOLERANCE_METERS,
    policyVersion: LOCATION_POLICY_VERSION,
    checkedAt: new Date().toISOString(),
    inputFingerprint: locationFingerprint(input),
    provider: failureReason === 'provider_not_configured' ? null : 'mapbox',
    message: locationMessage(status, locale),
  };
}

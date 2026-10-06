import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  locationCountryCode,
  locationDecision,
  type GeocodingCandidate,
  type LocationInput,
} from './location-verification';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function mapboxCandidates(body: unknown): GeocodingCandidate[] {
  const features = record(body).features;
  if (!Array.isArray(features) || features.length > 5) return [];
  return features.map((feature) => {
    const props = record(record(feature).properties);
    const coordinates = record(props.coordinates);
    const match = record(props.match_code);
    const country = record(record(props.context).country);
    const componentStates = ['address_number', 'street', 'place', 'region', 'country'].map(
      (key) => match[key],
    );
    return {
      latitude: typeof coordinates.latitude === 'number' ? coordinates.latitude : NaN,
      longitude: typeof coordinates.longitude === 'number' ? coordinates.longitude : NaN,
      countryCode: typeof country.country_code === 'string' ? country.country_code : '',
      featureType: typeof props.feature_type === 'string' ? props.feature_type : '',
      accuracy: typeof coordinates.accuracy === 'string' ? coordinates.accuracy : '',
      confidence: typeof match.confidence === 'string' ? match.confidence : '',
      componentsMatched:
        match.street === 'matched' &&
        match.place === 'matched' &&
        match.country === 'matched' &&
        componentStates.every((state) => state !== 'unmatched' && state !== 'plausible'),
    };
  });
}

@Injectable()
export class LocationVerificationService {
  constructor(@Optional() private readonly config?: ConfigService) {}
  private setting(name: string): string | undefined {
    return this.config?.get<string>(name) ?? process.env[name];
  }
  async verify(input: LocationInput, locale = 'en') {
    const token = this.setting('MAPBOX_GEOCODING_TOKEN') ?? this.setting('MAPBOX_PUB_KEY');
    // Existing map access alone is not authorization for stored, billable geocoding.
    // Official v6 docs require permanent=true and a card/enterprise entitlement for retention.
    if (
      this.setting('MAPBOX_GEOCODING_ENABLED') !== 'true' ||
      this.setting('MAPBOX_GEOCODING_PERMANENT_ALLOWED') !== 'true' ||
      !token
    ) {
      return locationDecision(input, [], locale, 'provider_not_configured');
    }
    if (!input.address?.trim() || !input.city?.trim() || !locationCountryCode(input.country)) {
      return locationDecision(input, [], locale);
    }
    const query = [input.address, input.city, input.region, input.country]
      .filter(Boolean)
      .join(', ');
    if (query.length > 256 || query.includes(';') || query.split(/[\s,]+/).length > 20) {
      return locationDecision(input, [], locale, 'address_query_invalid');
    }
    try {
      const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
      url.search = new URLSearchParams({
        q: query,
        country: locationCountryCode(input.country)!,
        autocomplete: 'false',
        limit: '5',
        language: locale === 'fr' ? 'fr' : 'en',
        permanent: 'true',
        access_token: token,
      }).toString();
      // No pin bias: that would conceal the address/pin disagreement this check tests.
      const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) return locationDecision(input, [], locale, 'provider_unavailable');
      if (Number(response.headers.get('content-length')) > 128 * 1024) {
        await response.body?.cancel();
        return locationDecision(input, [], locale, 'provider_response_invalid');
      }
      const reader = response.body?.getReader();
      if (!reader) return locationDecision(input, [], locale, 'provider_response_invalid');
      const chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 128 * 1024) {
          await reader.cancel();
          return locationDecision(input, [], locale, 'provider_response_invalid');
        }
        chunks.push(value);
      }
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return locationDecision(input, mapboxCandidates(body), locale);
    } catch {
      // Never log provider URL/token, private address, response body or network exception.
      return locationDecision(input, [], locale, 'provider_unavailable');
    }
  }
}

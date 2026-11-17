import {
  BadRequestException,
  HttpException,
  Injectable,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisService } from '../common/redis.service';
import { ConfigService } from '@nestjs/config';
import type {
  TravelDemandDurationEvidence,
  TravelDemandRouteFailure,
} from './dto/travel-demand-shared.dto';

export const MAPBOX_DIRECTIONS_SOURCE = 'Mapbox Directions v5 (driving-traffic)';

const TIMEOUT_MS = 5000;
const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_REQUESTS_PER_MINUTE = 240;
const MAX_REQUESTS_PER_MINUTE = 300;
const ACTIVE_SCENARIOS = 2;
const ROUTE_CACHE_LIMIT = 512;
const RETAINED_ROUTE_CACHE_LIMIT = 2048;
const ROUTE_CACHE_MS = 24 * 60 * 60 * 1000;

export interface RoutedEstimate {
  durationSeconds: number;
  evidence: Exclude<TravelDemandDurationEvidence, 'supplied_estimate'>;
  path: string;
  distanceMetres: number;
  segments: { distanceMetres: number; durationSeconds: number; speedMps: number | null }[];
}
type RouteChoices = { routes: RoutedEstimate[] } | { reason: TravelDemandRouteFailure };

export const ROUTING_FAILURE_GUIDANCE: Record<
  TravelDemandRouteFailure,
  { message: string; action: string; global: boolean }
> = {
  no_route: {
    message: 'Mapbox could not connect the public road endpoints.',
    action: 'Review the study road coverage and connected public endpoints.',
    global: false,
  },
  no_road_match: {
    message: 'Mapbox could not match a public endpoint to a driving road.',
    action: 'Review the mapped public road point and driving access.',
    global: false,
  },
  provider_invalid_request: {
    message: 'Mapbox rejected the routing request format or parameters.',
    action:
      'The operator must correct the routing request or provider configuration before retrying.',
    global: true,
  },
  provider_unauthorized: {
    message: 'Mapbox refused the configured routing credentials.',
    action: 'The operator must check the Directions token and its permissions before retrying.',
    global: true,
  },
  provider_rate_limited: {
    message: 'Mapbox routing request capacity was reached.',
    action: 'Wait for the provider rate window, then retry the saved study.',
    global: true,
  },
  provider_unconfigured: {
    message: 'Mapbox Directions is not configured.',
    action: 'The operator must configure the server Directions token, then retry the saved study.',
    global: true,
  },
  provider_error: {
    message: 'The routing provider could not complete the request.',
    action: 'Retry the saved study; successful source-compatible routes will be reused.',
    global: false,
  },
  provider_timeout: {
    message: 'The routing provider did not respond before the deadline.',
    action: 'Retry the saved study; successful source-compatible routes will be reused.',
    global: false,
  },
  invalid_provider_response: {
    message: 'The routing provider returned unusable route data.',
    action:
      'Retry the saved study; if this continues, ask the operator to review the Directions integration.',
    global: false,
  },
};
export class RoutingProviderException extends ServiceUnavailableException {
  readonly action: string;
  readonly retryable: boolean;
  constructor(readonly code: TravelDemandRouteFailure) {
    const guidance = ROUTING_FAILURE_GUIDANCE[code];
    super(`${guidance.message} ${guidance.action}`);
    this.action = guidance.action;
    this.retryable =
      code !== 'provider_invalid_request' &&
      code !== 'provider_unauthorized' &&
      code !== 'provider_unconfigured';
  }
}
function supportedDeparture(value: string): string {
  const instant = Date.parse(value);
  if (!Number.isFinite(instant))
    throw new BadRequestException('Provide a valid departure instant for routing.');
  return new Date(Math.floor(instant / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function readDirections(response: Response): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    return null;
  }
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    return null;
  }
}

function readRoute(value: unknown): RoutedEstimate | null {
  const { duration, geometry, legs, distance } = record(value);
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration < 0.001 ||
    duration > 864000 ||
    typeof geometry !== 'string' ||
    !geometry
  )
    return null;

  const hasTraffic =
    Array.isArray(legs) &&
    legs.some((leg: unknown) => {
      const levels = record(record(leg).annotation).congestion;
      return (
        Array.isArray(levels) &&
        levels.some(
          (level: unknown) =>
            level === 'low' || level === 'moderate' || level === 'heavy' || level === 'severe',
        )
      );
    });
  const segments: RoutedEstimate['segments'] = [];
  if (Array.isArray(legs))
    for (const leg of legs) {
      const annotation = record(record(leg).annotation);
      const distances = annotation.distance;
      const durations = annotation.duration;
      const speeds = annotation.speed;
      if (!Array.isArray(distances) || !Array.isArray(durations)) continue;
      for (let index = 0; index < distances.length; index++) {
        const d = distances[index];
        const t = durations[index];
        const speed = Array.isArray(speeds) ? speeds[index] : undefined;
        if (typeof d !== 'number' || d < 0 || typeof t !== 'number' || t < 0) continue;
        segments.push({
          distanceMetres: d,
          durationSeconds: t,
          speedMps: typeof speed === 'number' && speed > 0 ? speed : t > 0 ? d / t : null,
        });
      }
    }
  return {
    distanceMetres:
      typeof distance === 'number' && distance > 0
        ? distance
        : segments.reduce((sum, segment) => sum + segment.distanceMetres, 0),
    segments,
    durationSeconds: duration,
    evidence: hasTraffic ? 'mapbox_traffic_indicated' : 'mapbox_traffic_unconfirmed',
    path: geometry,
  };
}

function readChoices(body: unknown, alternatives: boolean): RouteChoices {
  const { code, routes } = record(body);
  if (code === 'NoRoute') return { reason: 'no_route' };
  if (code === 'NoSegment') return { reason: 'no_road_match' };
  if (
    code !== 'Ok' ||
    !Array.isArray(routes) ||
    !routes.length ||
    routes.length > (alternatives ? 3 : 1)
  )
    return { reason: 'invalid_provider_response' };
  const choices = routes.map(readRoute);
  if (choices.some((choice) => choice === null)) return { reason: 'invalid_provider_response' };
  return { routes: [...new Map(choices.map((choice) => [choice!.path, choice!])).values()] };
}

@Injectable()
export class MapboxDirectionsProvider {
  private active = 0;
  private started = 0;
  private used = 0;
  private readonly cache = new Map<string, { at: number; value: RouteChoices }>();
  private readonly requestsPerMinute: number;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {
    const configured = Number(
      config.get<string>('MAPBOX_DIRECTIONS_REQUESTS_PER_MINUTE') ?? DEFAULT_REQUESTS_PER_MINUTE,
    );
    this.requestsPerMinute =
      Number.isFinite(configured) && configured >= 1
        ? Math.min(MAX_REQUESTS_PER_MINUTE, Math.floor(configured))
        : DEFAULT_REQUESTS_PER_MINUTE;
  }

  async estimateRoutes(routes: string[][], departureAt: string, signal: AbortSignal) {
    const choices = await this.routeChoices(routes, departureAt, signal, false);
    return choices.map((choice) => ('routes' in choice ? choice.routes[0] : choice));
  }

  /** Study jobs wait within the existing provider budget; ordinary comparisons retain 429. */
  async discoverStudyRoutes(
    routes: string[][],
    departureAt: string,
    signal: AbortSignal,
    sourceVersion: string,
  ): Promise<RouteChoices[]> {
    departureAt = supportedDeparture(departureAt);
    const output: RouteChoices[] = [];
    for (const points of routes) {
      signal.throwIfAborted();
      const key = JSON.stringify([sourceVersion, departureAt, points]);
      const redisKey = `planning-route:v1:${createHash('sha256').update(key).digest('hex')}`;
      const cached = this.cache.get(key);
      if (!cached && this.redis) {
        const stored = await this.redis.instance.get(redisKey);
        if (stored) {
          const value = JSON.parse(stored) as RouteChoices;
          this.cache.set(key, { at: Date.now(), value });
          while (this.cache.size > ROUTE_CACHE_LIMIT)
            this.cache.delete(this.cache.keys().next().value!);
          output.push(value);
          continue;
        }
      }
      if (cached && Date.now() - cached.at < ROUTE_CACHE_MS) {
        output.push(cached.value);
        continue;
      }
      while (
        this.active >= ACTIVE_SCENARIOS ||
        (Date.now() - this.started < 60_000 && this.used >= this.requestsPerMinute)
      ) {
        await new Promise<void>((resolve, reject) => {
          const cancel = () => {
            clearTimeout(timer);
            reject(new Error('Routing cancelled.'));
          };
          const timer = setTimeout(() => {
            signal.removeEventListener('abort', cancel);
            resolve();
          }, 250);
          signal.addEventListener('abort', cancel, { once: true });
        });
        signal.throwIfAborted();
      }
      const [value] = await this.routeChoices([points], departureAt, signal, true);
      // Failures are retried on a new attempt instead of persisting as cache evidence.
      if ('routes' in value)
        await this.cacheStudyRoutes(points, departureAt, sourceVersion, value.routes);
      output.push(value);
    }
    return output;
  }

  /** Reuse already-routed public evidence without making a provider request. */
  async cacheStudyRoutes(
    points: string[],
    departureAt: string,
    sourceVersion: string,
    routes: RoutedEstimate[],
  ) {
    const key = JSON.stringify([sourceVersion, supportedDeparture(departureAt), points]);
    const redisKey = `planning-route:v1:${createHash('sha256').update(key).digest('hex')}`;
    const value = { routes };
    this.cache.set(key, { at: Date.now(), value });
    while (this.cache.size > ROUTE_CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    if (this.redis) {
      await this.redis.instance.set(
        redisKey,
        JSON.stringify(value),
        'EX',
        Math.floor(ROUTE_CACHE_MS / 1000),
      );
      const indexKey = 'planning-route:v1:index';
      await this.redis.instance.zadd(indexKey, Date.now(), redisKey);
      const excess = (await this.redis.instance.zcard(indexKey)) - RETAINED_ROUTE_CACHE_LIMIT;
      if (excess > 0) {
        const expired = await this.redis.instance.zrange(indexKey, 0, excess - 1);
        if (expired.length)
          await this.redis.instance
            .multi()
            .del(...expired)
            .zrem(indexKey, ...expired)
            .exec();
      }
    }
  }

  private async routeChoices(
    routes: string[][],
    departureAt: string,
    signal: AbortSignal,
    alternatives: boolean,
  ): Promise<RouteChoices[]> {
    const token = this.config.get<string>('MAPBOX_DIRECTIONS_TOKEN')?.trim();
    if (!token) throw new RoutingProviderException('provider_unconfigured');
    departureAt = supportedDeparture(departureAt);

    const now = Date.now();
    if (now - this.started >= 60_000) {
      this.started = now;
      this.used = 0;
    }
    if (this.active >= ACTIVE_SCENARIOS || this.used + routes.length > this.requestsPerMinute)
      throw new HttpException('Travel demand routing capacity reached. Please retry later.', 429);

    this.active++;
    this.used += routes.length;
    try {
      // A single deadline bounds the whole batch, including response bodies.
      const deadline = AbortSignal.timeout(TIMEOUT_MS);
      const requestSignal = AbortSignal.any([signal, deadline]);
      return await Promise.all(
        routes.map((points) =>
          this.estimate(points, departureAt, token, requestSignal, deadline, alternatives),
        ),
      );
    } finally {
      this.active--;
    }
  }

  private async estimate(
    points: string[],
    departureAt: string,
    token: string,
    signal: AbortSignal,
    deadline: AbortSignal,
    alternatives: boolean,
  ): Promise<RouteChoices> {
    const url = new URL(
      `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${points.join(';')}`,
    );
    url.search = new URLSearchParams({
      access_token: token,
      depart_at: departureAt,
      // Limit how far Mapbox can move a submitted waypoint to reach a road.
      radiuses: points.map(() => '50').join(';'),
      overview: 'full',
      geometries: 'polyline6',
      annotations: 'congestion,distance,duration,speed',
    }).toString();
    if (alternatives) url.searchParams.set('alternatives', 'true');
    try {
      const response = await fetch(url, { signal, redirect: 'error' });
      if (!response.ok) {
        await response.body?.cancel();
        return {
          reason:
            response.status === 400 || response.status === 422
              ? 'provider_invalid_request'
              : response.status === 401 || response.status === 403
                ? 'provider_unauthorized'
                : response.status === 429
                  ? 'provider_rate_limited'
                  : 'provider_error',
        };
      }
      return readChoices(await readDirections(response), alternatives);
    } catch {
      // Provider URLs, bodies and raw errors may contain the token or route details.
      return { reason: deadline.aborted ? 'provider_timeout' : 'provider_error' };
    }
  }
}

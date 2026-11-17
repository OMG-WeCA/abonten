import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  TravelDemandDurationEvidence,
  TravelDemandRouteFailure,
} from './dto/travel-demand-shared.dto';
import type {
  TravelDemandScenarioDto,
  TravelDemandScenarioResponse,
} from './dto/travel-demand.dto';
import { MAPBOX_DIRECTIONS_SOURCE, MapboxDirectionsProvider } from './mapbox-directions.provider';
import { coordinate, inverseDurationShares } from './travel-demand-model';

type Duration =
  | {
      seconds: number;
      evidence: TravelDemandDurationEvidence;
      path?: string;
    }
  | { reason: TravelDemandRouteFailure };

@Injectable()
export class TravelDemandService {
  constructor(private readonly mapbox: MapboxDirectionsProvider) {}

  async compare(
    dto: TravelDemandScenarioDto,
    signal: AbortSignal,
  ): Promise<TravelDemandScenarioResponse> {
    const mapbox = dto.durationSource === 'mapbox';
    const departure = dto.departureAt ? new Date(dto.departureAt) : null;
    if (mapbox) {
      if (!departure || dto.confirmPublicRoadTransfer !== true)
        throw new BadRequestException(
          'Mapbox routing requires a departure time and confirmed public-road transfer.',
        );
      if (dto.suppliedDurationSource !== undefined)
        throw new BadRequestException('Omit the supplied duration source when using Mapbox.');
    } else if (!dto.suppliedDurationSource || dto.confirmPublicRoadTransfer !== undefined) {
      throw new BadRequestException(
        'Provide a duration source and omit the Mapbox transfer confirmation.',
      );
    }

    const pairIds = new Set<string>();
    const pairEndpoints = new Set<string>();
    const routes = dto.pairs.map((pair) => {
      const origin = coordinate(pair.origin);
      const destination = coordinate(pair.destination);
      const endpoints = `${origin};${destination}`;
      if (origin === destination || pairIds.has(pair.id) || pairEndpoints.has(endpoints))
        throw new BadRequestException(
          'Use a distinct origin and destination and submit each directional pair once.',
        );
      pairIds.add(pair.id);
      pairEndpoints.add(endpoints);

      const ids = new Set<string>();
      const paths = new Set<string>();
      return pair.alternatives.map((alternative) => {
        const points = [origin, ...(alternative.via ?? []).map(coordinate), destination];
        const path = points.join(';');
        if (ids.has(alternative.id) || paths.has(path) || new Set(points).size !== points.length)
          throw new BadRequestException(
            'Each alternative needs a unique ID and distinct waypoints and path.',
          );
        if (mapbox === (alternative.durationSeconds !== undefined))
          throw new BadRequestException(
            'Supply a duration for every alternative, or use Mapbox for all alternatives.',
          );
        ids.add(alternative.id);
        paths.add(path);
        return points;
      });
    });

    const estimates = mapbox
      ? await this.mapbox.estimateRoutes(
          routes.flat(),
          departure!.toISOString().replace('.000Z', 'Z'),
          signal,
        )
      : [];
    const totalWeight = dto.pairs.reduce((sum, pair) => sum + pair.demandWeight, 0);
    let estimateIndex = 0;
    const pairs = dto.pairs.map((pair) => {
      const scenarioDemandShare = pair.demandWeight / totalWeight;
      const durations = pair.alternatives.map((alternative): Duration => {
        if (!mapbox)
          return { seconds: alternative.durationSeconds!, evidence: 'supplied_estimate' };
        const estimate = estimates[estimateIndex++];
        if ('reason' in estimate) return estimate;
        return {
          seconds: estimate.durationSeconds,
          evidence: estimate.evidence,
          path: estimate.path,
        };
      });
      const available = durations.filter((duration) => 'seconds' in duration);
      let unresolvedReason: TravelDemandScenarioResponse['pairs'][number]['unresolvedReason'] =
        null;
      if (available.length !== durations.length) unresolvedReason = 'missing_duration';
      else if (mapbox && new Set(available.map(({ path }) => path)).size !== available.length)
        unresolvedReason = 'duplicate_routed_path';
      const shares = unresolvedReason
        ? []
        : inverseDurationShares(available.map(({ seconds }) => seconds));
      const alternatives = pair.alternatives.map((alternative, index) => {
        const duration = durations[index];
        const pairDemandShare = shares[index] ?? null;
        return {
          id: alternative.id,
          via: alternative.via ?? [],
          durationSeconds: 'seconds' in duration ? duration.seconds : null,
          durationEvidence: 'evidence' in duration ? duration.evidence : null,
          unavailableReason: 'reason' in duration ? duration.reason : null,
          pairDemandShare,
          scenarioDemandShare:
            pairDemandShare === null ? null : pairDemandShare * scenarioDemandShare,
        };
      });
      return {
        id: pair.id,
        origin: pair.origin,
        destination: pair.destination,
        demandWeight: pair.demandWeight,
        demandSource: pair.demandSource,
        scenarioDemandShare,
        unresolvedReason,
        alternatives,
      };
    });

    const unresolved = pairs.filter((pair) => pair.unresolvedReason);
    return {
      status:
        unresolved.length === 0
          ? 'complete'
          : unresolved.length === pairs.length
            ? 'unavailable'
            : 'partial',
      method: 'inverse-duration-v1',
      timeWindow: dto.timeWindow,
      departureAt: dto.departureAt ?? null,
      durationSource: dto.durationSource,
      durationSourceName: mapbox ? MAPBOX_DIRECTIONS_SOURCE : dto.suppliedDurationSource!,
      unresolvedDemandShare:
        unresolved.length === pairs.length
          ? 1
          : unresolved.reduce((sum, pair) => sum + pair.scenarioDemandShare, 0),
      pairs,
    };
  }
}

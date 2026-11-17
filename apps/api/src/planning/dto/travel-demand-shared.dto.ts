import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export const DEPARTURE =
  /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export class TravelDemandPointDto {
  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;

  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;
}

export const TRAVEL_DEMAND_DURATION_EVIDENCE = [
  'supplied_estimate',
  'mapbox_traffic_indicated',
  'mapbox_traffic_unconfirmed',
] as const;
export type TravelDemandDurationEvidence = (typeof TRAVEL_DEMAND_DURATION_EVIDENCE)[number];

export const TRAVEL_DEMAND_ROUTE_FAILURES = [
  'no_route',
  'no_road_match',
  'provider_error',
  'provider_invalid_request',
  'provider_unauthorized',
  'provider_rate_limited',
  'provider_unconfigured',
  'provider_timeout',
  'invalid_provider_response',
] as const;
export type TravelDemandRouteFailure = (typeof TRAVEL_DEMAND_ROUTE_FAILURES)[number];

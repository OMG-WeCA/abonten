import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsNumber,
  IsObject,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DEPARTURE,
  TRAVEL_DEMAND_DURATION_EVIDENCE,
  TRAVEL_DEMAND_ROUTE_FAILURES,
  TravelDemandPointDto,
  type TravelDemandDurationEvidence,
  type TravelDemandRouteFailure,
} from './travel-demand-shared.dto';

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/;

export const TRAVEL_DEMAND_DURATION_SOURCES = ['supplied', 'mapbox'] as const;

export class TravelDemandAlternativeDto {
  @ApiProperty({ pattern: ID.source })
  @IsString()
  @Matches(ID)
  id!: string;

  @ApiPropertyOptional({
    type: [TravelDemandPointDto],
    maxItems: 3,
    description: 'Ordered public-road waypoints between the origin and destination.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(3)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => TravelDemandPointDto)
  via?: TravelDemandPointDto[];

  @ApiPropertyOptional({
    minimum: 0.001,
    maximum: 864000,
    description: 'Required in supplied mode. Omit in Mapbox mode.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsNumber()
  @Min(0.001)
  @Max(864000)
  durationSeconds?: number;
}

export class TravelDemandPairDto {
  @ApiProperty({ pattern: ID.source })
  @IsString()
  @Matches(ID)
  id!: string;

  @ApiProperty({ type: TravelDemandPointDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TravelDemandPointDto)
  origin!: TravelDemandPointDto;

  @ApiProperty({ type: TravelDemandPointDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => TravelDemandPointDto)
  destination!: TravelDemandPointDto;

  @ApiProperty({ minimum: 0.000001, maximum: 1e9, description: 'Unitless assumed trip demand.' })
  @IsNumber()
  @Min(0.000001)
  @Max(1e9)
  demandWeight!: number;

  @ApiProperty({ maxLength: 160, description: 'Source or assumption behind this weight.' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(160)
  demandSource!: string;

  @ApiProperty({ type: [TravelDemandAlternativeDto], minItems: 1, maxItems: 3 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => TravelDemandAlternativeDto)
  alternatives!: TravelDemandAlternativeDto[];
}

export class TravelDemandScenarioDto {
  @ApiProperty({ maxLength: 80, description: 'Name of the time window, such as Weekday morning.' })
  @IsString()
  @Matches(/\S/)
  @MaxLength(80)
  timeWindow!: string;

  @ApiPropertyOptional({
    format: 'date-time',
    pattern: DEPARTURE.source,
    description: 'Representative departure with seconds and a UTC offset. Required in Mapbox mode.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsDateString({ strict: true, strictSeparator: true })
  @Matches(DEPARTURE)
  departureAt?: string;

  @ApiProperty({ enum: TRAVEL_DEMAND_DURATION_SOURCES })
  @IsIn(TRAVEL_DEMAND_DURATION_SOURCES)
  durationSource!: (typeof TRAVEL_DEMAND_DURATION_SOURCES)[number];

  @ApiPropertyOptional({
    maxLength: 160,
    description: 'Source for all supplied duration estimates. Omit in Mapbox mode.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @Matches(/\S/)
  @MaxLength(160)
  suppliedDurationSource?: string;

  @ApiPropertyOptional({
    description:
      'Set to true in Mapbox mode to confirm that the coordinates are public roads and authorize sending them and the departure time to Mapbox.',
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  confirmPublicRoadTransfer?: boolean;

  @ApiProperty({ type: [TravelDemandPairDto], minItems: 1, maxItems: 6 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => TravelDemandPairDto)
  pairs!: TravelDemandPairDto[];
}

const PAIR_ISSUES = ['missing_duration', 'duplicate_routed_path'] as const;

class TravelDemandAlternativeResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: [TravelDemandPointDto] })
  via!: TravelDemandPointDto[];

  @ApiProperty({ type: Number, nullable: true })
  durationSeconds!: number | null;

  @ApiProperty({
    type: String,
    enum: TRAVEL_DEMAND_DURATION_EVIDENCE,
    nullable: true,
    description:
      'Mapbox can return a driving estimate without traffic data. Traffic indications cover some segments and do not establish live observation.',
  })
  durationEvidence!: TravelDemandDurationEvidence | null;

  @ApiProperty({ type: String, enum: TRAVEL_DEMAND_ROUTE_FAILURES, nullable: true })
  unavailableReason!: TravelDemandRouteFailure | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 1 })
  pairDemandShare!: number | null;

  @ApiProperty({ type: Number, nullable: true, minimum: 0, maximum: 1 })
  scenarioDemandShare!: number | null;
}

class TravelDemandPairResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty({ type: TravelDemandPointDto })
  origin!: TravelDemandPointDto;

  @ApiProperty({ type: TravelDemandPointDto })
  destination!: TravelDemandPointDto;

  @ApiProperty()
  demandWeight!: number;

  @ApiProperty()
  demandSource!: string;

  @ApiProperty({ minimum: 0, maximum: 1 })
  scenarioDemandShare!: number;

  @ApiProperty({ type: String, enum: PAIR_ISSUES, nullable: true })
  unresolvedReason!: (typeof PAIR_ISSUES)[number] | null;

  @ApiProperty({ type: [TravelDemandAlternativeResponse] })
  alternatives!: TravelDemandAlternativeResponse[];
}

export class TravelDemandScenarioResponse {
  @ApiProperty({ enum: ['complete', 'partial', 'unavailable'] })
  status!: 'complete' | 'partial' | 'unavailable';

  @ApiProperty({ enum: ['inverse-duration-v1'] })
  method!: 'inverse-duration-v1';

  @ApiProperty()
  timeWindow!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  departureAt!: string | null;

  @ApiProperty({ enum: TRAVEL_DEMAND_DURATION_SOURCES })
  durationSource!: TravelDemandScenarioDto['durationSource'];

  @ApiProperty({ description: 'Caller-declared source or Mapbox Directions v5 routing profile.' })
  durationSourceName!: string;

  @ApiProperty({ minimum: 0, maximum: 1 })
  unresolvedDemandShare!: number;

  @ApiProperty({ type: [TravelDemandPairResponse] })
  pairs!: TravelDemandPairResponse[];
}

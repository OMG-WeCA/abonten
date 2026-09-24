import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInstance,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsPositive,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class GeoPointDto {
  @ApiProperty() @IsNumber() @Type(() => Number) longitude!: number;
  @ApiProperty() @IsNumber() @Type(() => Number) latitude!: number;
}

/** Structured provenance for hand-entered structure attributes (SPEC §5.1
 * trust contract 3): stored as a site_metadata record (dimension 'structure'). */
export class StructureProvenanceDto {
  @ApiProperty() @IsString() @MinLength(2) source!: string;
  @ApiProperty() @IsString() @MinLength(2) method!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() collectedAt?: string;
}

export const VERIFICATION_STATES = ['unverified', 'partner_declared', 'field_verified', 'third_party'] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export class CreateSiteDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  /** Idempotent-create key: replays the original draft on an ambiguous retry. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) clientRequestId?: string;
  @ApiPropertyOptional({ default: 'billboard' }) @IsOptional() @IsString() type?: string;
  @ApiProperty() @IsString() format!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subFormat?: string;

  @ApiProperty() @IsNumber() @Min(-90) @Max(90) @Type(() => Number) latitude!: number;
  @ApiProperty() @IsNumber() @Min(-180) @Max(180) @Type(() => Number) longitude!: number;
  @ApiPropertyOptional({ type: [GeoPointDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeoPointDto)
  geoPolygon?: GeoPointDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiProperty() @IsString() city!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() region?: string;
  @ApiProperty() @IsString() country!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() marketId?: string;

  @ApiProperty() @IsNumber() @IsPositive() @Type(() => Number) width!: number;
  @ApiProperty() @IsNumber() @IsPositive() @Type(() => Number) height!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Type(() => Number) area?: number;
  @ApiPropertyOptional({ default: 'm' }) @IsOptional() @IsString() units?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) orientationDeg?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) viewingDistance?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) elevation?: number;

  @ApiPropertyOptional({ default: 'none' }) @IsOptional() @IsString() illuminationType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() illuminationHours?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() permitRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() permitExpiresAt?: string;
  /** Required when orientation/viewing distance/elevation is entered or changed
   * by hand (SPEC §5.1 trust contract 3): "if you typed it, say how you know it". */
  @ApiPropertyOptional({ type: StructureProvenanceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StructureProvenanceDto)
  structureProvenance?: StructureProvenanceDto;
}

export class UpdateSiteDto extends PartialType(CreateSiteDto) {}

export class ListSitesQueryDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsNumber() @Type(() => Number) page?: number;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsNumber() @Type(() => Number) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() format?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class CreateFaceDto {
  @ApiProperty() @IsString() faceLabel!: string;
  @ApiProperty() @IsNumber() @Type(() => Number) width!: number;
  @ApiProperty() @IsNumber() @Type(() => Number) height!: number;
  @ApiProperty() @IsNumber() @Type(() => Number) area!: number;
  @ApiProperty({ default: 'm' }) @IsString() units!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() printableArea?: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() bookable?: boolean;
  // Digital-face attributes (SPEC §5.1 trust contract 2) — collected for
  // digital_led faces; nullable everywhere so static faces are unaffected.
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Type(() => Number) pixelWidth?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Type(() => Number) pixelHeight?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() @Type(() => Number) spotLengthSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() @Type(() => Number) loopLengthSeconds?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) @Type(() => Number) spotsPerLoop?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() proofOfPlay?: boolean;
}

export class UpdateFaceDto extends PartialType(CreateFaceDto) {}

export class CreateMetadataDto {
  @ApiProperty() @IsString() dimension!: string;
  @ApiProperty({ type: Object }) @IsInstance(Object) payload!: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() method?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) confidence?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() collectedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiresAt?: string;
  @ApiPropertyOptional({ enum: VERIFICATION_STATES, default: 'unverified' })
  @IsOptional()
  @IsIn(VERIFICATION_STATES as unknown as string[])
  verification?: string;
}

export class UpdateMetadataDto extends PartialType(CreateMetadataDto) {}

export class RateCardRatesDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) @Type(() => Number) perDay?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) @Type(() => Number) perWeek?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) @Type(() => Number) perMonth?: number;
}

export class CreateRateCardDto {
  @ApiProperty() @IsString() currency!: string;
  @ApiProperty({ type: RateCardRatesDto })
  @Type(() => RateCardRatesDto)
  @ValidateNested()
  rates!: RateCardRatesDto;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsInstance(Object) seasonalRules?: Record<string, unknown>;
  @ApiProperty() @IsDateString() effectiveFrom!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateRateCardDto extends PartialType(CreateRateCardDto) {}

export class RejectSiteDto {
  @ApiProperty() @IsString() reason!: string;
}
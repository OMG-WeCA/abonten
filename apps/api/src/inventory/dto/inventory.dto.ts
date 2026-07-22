import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInstance,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class GeoPointDto {
  @ApiProperty() @IsNumber() @Type(() => Number) longitude!: number;
  @ApiProperty() @IsNumber() @Type(() => Number) latitude!: number;
}

export class CreateSiteDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional({ default: 'billboard' }) @IsOptional() @IsString() type?: string;
  @ApiProperty() @IsString() format!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subFormat?: string;

  @ApiProperty() @IsNumber() @Type(() => Number) latitude!: number;
  @ApiProperty() @IsNumber() @Type(() => Number) longitude!: number;
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

  @ApiProperty() @IsNumber() @Type(() => Number) width!: number;
  @ApiProperty() @IsNumber() @Type(() => Number) height!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) area?: number;
  @ApiPropertyOptional({ default: 'm' }) @IsOptional() @IsString() units?: string;

  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) orientationDeg?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) viewingDistance?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) elevation?: number;

  @ApiPropertyOptional({ default: 'none' }) @IsOptional() @IsString() illuminationType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() illuminationHours?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() permitRef?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() permitExpiresAt?: string;
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
}

export class UpdateMetadataDto extends PartialType(CreateMetadataDto) {}

export class RateCardRatesDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) perDay?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) perWeek?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) perMonth?: number;
}

export class CreateRateCardDto {
  @ApiProperty() @IsString() currency!: string;
  @ApiProperty({ type: RateCardRatesDto }) @IsInstance(Object) rates!: RateCardRatesDto;
  @ApiPropertyOptional({ type: Object }) @IsOptional() @IsInstance(Object) seasonalRules?: Record<string, unknown>;
  @ApiProperty() @IsDateString() effectiveFrom!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateRateCardDto extends PartialType(CreateRateCardDto) {}

export class RejectSiteDto {
  @ApiProperty() @IsString() reason!: string;
}
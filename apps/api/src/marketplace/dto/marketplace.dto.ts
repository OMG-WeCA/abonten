import { Transform, Type } from 'class-transformer';
import { canonicalCountry } from '../../common/supported-markets';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MarketplaceQueryDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsNumber() @Type(() => Number) page?: number;
  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) => canonicalCountry(value))
  country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() market?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() format?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() illumination?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) minSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) maxSize?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) minPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) maxPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) lng?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Type(() => Number) radius?: number; // km
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  ArrayMaxSize,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SiteOptionsQueryDto {
  @ApiProperty({ description: 'Inclusive UTC date, YYYY-MM-DD' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;
  @ApiProperty({ description: 'Exclusive UTC date, YYYY-MM-DD' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;
}
export class PlannerHistoryDto {
  @ApiProperty({ enum: ['user', 'assistant'] }) @IsIn(['user', 'assistant']) role!:
    'user' | 'assistant';
  @ApiProperty({ maxLength: 4000 }) @IsString() @MinLength(1) @MaxLength(4000) content!: string;
}
export class PlannerFiltersDto {
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MaxLength(80) country?: string;
  @ApiPropertyOptional({ maxLength: 80 }) @IsOptional() @IsString() @MaxLength(80) city?: string;
  @ApiPropertyOptional({ enum: ['static', 'digital_led', '3d'] })
  @IsOptional()
  @IsIn(['static', 'digital_led', '3d'])
  format?: string;
  @ApiPropertyOptional({ maxLength: 160 })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}
export class PlannerBudgetDto {
  @ApiProperty({ minimum: 0, maximum: 1000000000000 })
  @IsNumber()
  @Min(0)
  @Max(1e12)
  amount!: number;
  @ApiProperty({ enum: ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'] })
  @IsIn(['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'])
  currency!: string;
}
export class PlannerFaceCurrencyDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() faceId!: string;
  @ApiProperty({ enum: ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'] })
  @IsIn(['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'])
  currency!: string;
}
export class PlannerContextDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Some draft selections were omitted from the bounded request; full-plan budget fit is unknown.',
  })
  @IsOptional()
  @IsBoolean()
  selectionTruncated?: boolean;
  @ApiPropertyOptional({ type: [String], maxItems: 12 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique((item: unknown) => (typeof item === 'string' ? item.toLowerCase() : item))
  @IsUUID('all', { each: true })
  selectedSiteIds?: string[];
  @ApiPropertyOptional({ type: [String], maxItems: 24 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ArrayUnique((item: unknown) => (typeof item === 'string' ? item.toLowerCase() : item))
  @IsUUID('all', { each: true })
  selectedFaceIds?: string[];
  @ApiPropertyOptional({
    type: [PlannerFaceCurrencyDto],
    maxItems: 24,
    description:
      'Selected face pricing currency, validated against published rates; no currency conversion.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ArrayUnique((item: PlannerFaceCurrencyDto | null | undefined) =>
    typeof item?.faceId === 'string' ? item.faceId.toLowerCase() : item?.faceId,
  )
  @ValidateNested({ each: true })
  @Type(() => PlannerFaceCurrencyDto)
  faceCurrencies?: PlannerFaceCurrencyDto[];
  @ApiPropertyOptional({ type: PlannerFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlannerFiltersDto)
  filters?: PlannerFiltersDto;
  @ApiPropertyOptional({ type: SiteOptionsQueryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SiteOptionsQueryDto)
  window?: SiteOptionsQueryDto;
  @ApiPropertyOptional({ type: PlannerBudgetDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlannerBudgetDto)
  budget?: PlannerBudgetDto;
}
export class AssistantMessageDto {
  @ApiPropertyOptional({ enum: ['en', 'fr'], default: 'en' })
  @IsOptional()
  @IsIn(['en', 'fr'])
  locale?: 'en' | 'fr';
  @ApiProperty({ maxLength: 4000 }) @IsString() @MinLength(1) @MaxLength(4000) message!: string;
  @ApiPropertyOptional({
    maxLength: 60000,
    description: 'Confirmed brief text; untrusted data, local unless explicit consent.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60000)
  briefText?: string;
  @ApiPropertyOptional({
    default: false,
    description:
      'Explicit consent for this confirmed brief only; reset after editing/replacing/removing it.',
  })
  @IsOptional()
  @IsBoolean()
  shareBriefWithProvider?: boolean;
  @ApiPropertyOptional({
    type: [PlannerHistoryDto],
    maxItems: 8,
    description:
      'Recent chat only. Reset on brief/consent changes. Dropped when a supplied brief has no consent.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => PlannerHistoryDto)
  history?: PlannerHistoryDto[];
  @ApiPropertyOptional({ type: PlannerContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlannerContextDto)
  context?: PlannerContextDto;
}

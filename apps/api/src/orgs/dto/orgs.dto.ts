import {
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ORGANIZATION_ROLE_VALUES } from '../../capabilities/organization-roles';

export const ORGANIZATION_TYPES = ['media_partner', 'agency', 'brand', 'platform'] as const;
// Platform organizations are provisioned by the operator, never from the public onboarding flow.
export const SELF_SERVICE_ORGANIZATION_TYPES = ['media_partner', 'agency', 'brand'] as const;
export const SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'XAF', 'XOF', 'USD', 'EUR'] as const;
export const SUPPORTED_LOCALES = ['en', 'fr'] as const;

export class CreateOrgDto {
  @ApiPropertyOptional({ description: 'Stable client key for resumable onboarding' })
  @IsOptional()
  @IsUUID('4')
  onboardingKey?: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;
  @ApiProperty({ enum: SELF_SERVICE_ORGANIZATION_TYPES })
  @IsIn(SELF_SERVICE_ORGANIZATION_TYPES)
  type!: (typeof SELF_SERVICE_ORGANIZATION_TYPES)[number];
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  country!: string;
  @ApiPropertyOptional({ enum: SUPPORTED_CURRENCIES, default: 'NGN' })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  defaultCurrency?: (typeof SUPPORTED_CURRENCIES)[number];
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES, default: 'en' })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  defaultLocale?: (typeof SUPPORTED_LOCALES)[number];
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedEmailDomains?: string[];
}

export class UpdateOrganizationSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  country?: string;
  @ApiPropertyOptional({ enum: SUPPORTED_CURRENCIES })
  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  defaultCurrency?: (typeof SUPPORTED_CURRENCIES)[number];
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES)
  defaultLocale?: (typeof SUPPORTED_LOCALES)[number];
}

export class InviteUserDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiProperty({ enum: ORGANIZATION_ROLE_VALUES }) @IsIn(ORGANIZATION_ROLE_VALUES) role!: string;
}

export class UpdateOrgMemberDto {
  @ApiProperty({ enum: ORGANIZATION_ROLE_VALUES }) @IsIn(ORGANIZATION_ROLE_VALUES) role!: string;
}

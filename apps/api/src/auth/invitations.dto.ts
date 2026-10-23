import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { PartnerTermsAcceptanceDto } from '../orgs/dto/partner-terms.dto';
import { ORGANIZATION_ROLE_VALUES } from '../capabilities/organization-roles';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SUPPORTED_CURRENCIES, SUPPORTED_LOCALES } from '../orgs/dto/orgs.dto';
import { findMarket } from '../common/supported-markets';
export const ACCOUNT_TYPES = ['media_partner', 'agency', 'brand'] as const;
export class CreateInvitationDto {
  @IsEmail() email!: string;
  @IsIn(ACCOUNT_TYPES) accountType!: (typeof ACCOUNT_TYPES)[number];
  @IsOptional() @IsIn(['en', 'fr']) locale?: 'en' | 'fr';
  @IsOptional() @IsUUID('4') clientRequestId?: string;
}
/** Separate existing-team invitation; not new-account admission. */
export class MemberInvitationDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsUUID() organizationId!: string;
  @IsIn(ORGANIZATION_ROLE_VALUES) role!: string;
  @IsOptional() @IsIn(['en', 'fr']) locale?: 'en' | 'fr';
  @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number;
}
export class InvitationOrganizationDto {
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? (findMarket(value)?.name ?? value.trim()) : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  country!: string;
  @IsOptional() @IsIn(SUPPORTED_CURRENCIES) defaultCurrency?: (typeof SUPPORTED_CURRENCIES)[number];
  @IsOptional() @IsIn(SUPPORTED_LOCALES) defaultLocale?: (typeof SUPPORTED_LOCALES)[number];
}
export class AcceptInvitationDto {
  @IsOptional() @IsIn(['en', 'fr']) locale?: 'en' | 'fr';
  @IsOptional()
  @ValidateNested()
  @Type(() => PartnerTermsAcceptanceDto)
  partnerTerms?: PartnerTermsAcceptanceDto;
  @IsOptional() @ValidateNested() @Type(() => UpdateProfileDto) profile?: UpdateProfileDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => InvitationOrganizationDto)
  organization?: InvitationOrganizationDto;
}
export class InvitationQueryDto {
  @IsOptional() @IsString() @MaxLength(160) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

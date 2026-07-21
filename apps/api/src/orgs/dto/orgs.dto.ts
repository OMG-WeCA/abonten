import { IsArray, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ORGANIZATION_ROLE_VALUES } from '../../capabilities/organization-roles';

export const ORGANIZATION_TYPES = ['media_partner', 'agency', 'brand', 'platform'] as const;

export class CreateOrgDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: ORGANIZATION_TYPES }) @IsIn(ORGANIZATION_TYPES) type!: string;
  @ApiProperty() @IsString() country!: string;
  @ApiPropertyOptional({ default: 'NGN' }) @IsOptional() @IsString() defaultCurrency?: string;
  @ApiPropertyOptional({ default: 'en' }) @IsOptional() @IsString() defaultLocale?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) allowedEmailDomains?: string[];
}

export class InviteUserDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiProperty({ enum: ORGANIZATION_ROLE_VALUES }) @IsIn(ORGANIZATION_ROLE_VALUES) role!: string;
}

export class UpdateOrgMemberDto {
  @ApiProperty({ enum: ORGANIZATION_ROLE_VALUES }) @IsIn(ORGANIZATION_ROLE_VALUES) role!: string;
}
import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { ORGANIZATION_ROLE_VALUES } from '../../capabilities/organization-roles';

export class InviteDto {
  @IsEmail() email!: string;
  @IsOptional() @IsString() name?: string;
  @IsIn(ORGANIZATION_ROLE_VALUES) role!: string;
}

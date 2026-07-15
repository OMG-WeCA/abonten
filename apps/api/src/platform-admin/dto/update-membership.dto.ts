import { IsIn } from 'class-validator';
import { ORGANIZATION_ROLE_VALUES } from '../../capabilities/organization-roles';

export class UpdateMembershipDto {
  @IsIn(ORGANIZATION_ROLE_VALUES) role!: string;
}

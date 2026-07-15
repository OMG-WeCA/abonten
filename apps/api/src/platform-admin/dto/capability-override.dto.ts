import { IsEnum, IsIn } from 'class-validator';
import { Capability } from '../../capabilities/capability.enum';

export class CapabilityOverrideDto {
  @IsEnum(Capability) capability!: Capability;
  @IsIn(['grant', 'revoke']) action!: 'grant' | 'revoke';
}

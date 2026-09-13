import { IsString, IsUUID, MinLength } from 'class-validator';

export class SwitchOrgDto {
  @IsUUID() organizationId!: string;
  @IsString() @MinLength(1) refreshToken!: string;
}

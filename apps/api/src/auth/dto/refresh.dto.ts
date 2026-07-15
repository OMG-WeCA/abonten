import { IsOptional, IsUUID } from 'class-validator';

export class RefreshDto {
  @IsUUID() refreshToken!: string;
  @IsOptional() @IsUUID() activeOrgId?: string;
}

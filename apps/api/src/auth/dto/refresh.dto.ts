import { IsOptional, IsString, IsUUID } from 'class-validator';

export class RefreshDto {
  @IsUUID() refreshToken!: string;
  @IsOptional() @IsString() activeOrgId?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, Matches, MaxLength } from 'class-validator';

export class PartnerTermsAcceptanceDto {
  @ApiProperty() @IsString() @MaxLength(80) version!: string;
  @ApiProperty({ enum: ['en', 'fr'] }) @IsIn(['en', 'fr']) locale!: 'en' | 'fr';
  @ApiProperty({
    description:
      'SHA-256 digest of the exact document displayed, compared with server-owned content',
  })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  expectedDigest!: string;
  @ApiProperty({ description: 'Must be affirmative true; never inferred from account creation' })
  @IsBoolean()
  accepted!: boolean;
  @ApiProperty({ description: 'Representative affirms authority to act for the partner' })
  @IsBoolean()
  authorityConfirmed!: boolean;
}

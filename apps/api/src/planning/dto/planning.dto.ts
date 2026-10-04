import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  Matches,
  IsIn,
} from 'class-validator';

export class AssistantMessageDto {
  @ApiPropertyOptional({ enum: ['en', 'fr'], default: 'en' })
  @IsOptional()
  @IsIn(['en', 'fr'])
  locale?: 'en' | 'fr';

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({
    maxLength: 60000,
    description: 'User-confirmed extracted brief text. Treated as untrusted data.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60000)
  briefText?: string;
}

export class SiteOptionsQueryDto {
  @ApiProperty({ description: 'Inclusive UTC date, YYYY-MM-DD' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @ApiProperty({ description: 'Exclusive UTC date, YYYY-MM-DD' })
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;
}

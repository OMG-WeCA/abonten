import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UploadInventoryMediaDto {
  @ApiPropertyOptional({ enum: ['front', 'context', 'night', 'diagram'] })
  @IsOptional()
  @IsIn(['front', 'context', 'night', 'diagram'])
  kind?: string;
  @ApiPropertyOptional({
    description: 'Explicit partner-declared capture date; never default to upload time.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  capturedAt?: string;
  @ApiPropertyOptional({ enum: ['uploaded', 'device_camera'] })
  @IsOptional()
  @IsIn(['uploaded', 'device_camera'])
  captureMethod?: 'uploaded' | 'device_camera';
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim()
      ? Number(value)
      : typeof value === 'number'
        ? value
        : NaN,
  )
  @IsNumber()
  @Min(-90)
  @Max(90)
  deviceLatitude?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim()
      ? Number(value)
      : typeof value === 'number'
        ? value
        : NaN,
  )
  @IsNumber()
  @Min(-180)
  @Max(180)
  deviceLongitude?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' && value.trim()
      ? Number(value)
      : typeof value === 'number'
        ? value
        : NaN,
  )
  @IsNumber()
  @Min(0)
  @Max(100_000)
  deviceAccuracyMeters?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString({ strict: true }) deviceCapturedAt?: string;
  @ApiPropertyOptional({
    description: 'Actual browser geolocation fix timestamp; distinct from photo exposure.',
  })
  @IsOptional()
  @IsDateString({ strict: true })
  deviceLocationRecordedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) missingMetadataReason?: string;
  @ApiPropertyOptional({ description: 'Stable operation UUID for ambiguous-network retries.' })
  @IsOptional()
  @IsUUID()
  clientRequestId?: string;
}

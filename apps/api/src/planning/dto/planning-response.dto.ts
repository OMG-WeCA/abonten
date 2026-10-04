import { ApiProperty } from '@nestjs/swagger';

export class BriefConstraintsResponse {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Literal budget suggestion requiring confirmation',
  })
  budget!: number | null;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'ISO currency; ambiguous dollar signs remain null',
  })
  currency!: string | null;
  @ApiProperty({ type: [String] }) cities!: string[];
  @ApiProperty({ type: String, nullable: true }) startDate!: string | null;
  @ApiProperty({ type: String, nullable: true }) endDate!: string | null;
  @ApiProperty({ type: [String], description: 'Literal brief excerpts supporting the suggestions' })
  evidence!: string[];
}

export class AssistantStatusResponse {
  @ApiProperty({ enum: ['local'] }) mode!: 'local';
  @ApiProperty({ type: String, nullable: true }) provider!: null;
  @ApiProperty({ type: Boolean, example: false }) aiAvailable!: false;
  @ApiProperty() message!: string;
  @ApiProperty({ type: [String] }) documentFormats!: string[];
  @ApiProperty({ example: 10485760 }) maxUploadBytes!: number;
  @ApiProperty({ type: Boolean, example: false }) documentsRetained!: false;
  @ApiProperty({ type: Boolean, example: false }) externalTransfer!: false;
}

export class ExtractedBriefResponse {
  @ApiProperty({ maxLength: 60000 }) text!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty({ enum: ['pdf', 'pptx', 'xlsx', 'docx', 'txt', 'csv', 'tsv', 'md'] })
  format!: string;
  @ApiProperty() characters!: number;
  @ApiProperty({ type: [String] }) warnings!: string[];
  @ApiProperty({ type: BriefConstraintsResponse }) constraints!: BriefConstraintsResponse;
  @ApiProperty({ type: Boolean, example: true }) requiresConfirmation!: true;
  @ApiProperty({ type: Boolean, example: false }) retained!: false;
}

export class PlannerReplyResponse {
  @ApiProperty({ enum: ['local'] }) mode!: 'local';
  @ApiProperty({ type: String, nullable: true }) provider!: null;
  @ApiProperty({ type: Boolean, example: false }) aiAvailable!: false;
  @ApiProperty() message!: string;
  @ApiProperty({ type: BriefConstraintsResponse }) constraints!: BriefConstraintsResponse;
  @ApiProperty({ type: [String] }) missing!: string[];
  @ApiProperty({ type: Boolean, example: true }) requiresConfirmation!: true;
}

export class FaceAvailabilityResponse {
  @ApiProperty() faceId!: string;
  @ApiProperty({
    description: 'Bookable face without an overlapping blackout or active booking at checkedAt',
  })
  available!: boolean;
}

export class SiteOptionsResponse {
  @ApiProperty() siteId!: string;
  @ApiProperty({ description: 'Inclusive UTC date' }) startDate!: string;
  @ApiProperty({ description: 'Exclusive UTC date' }) endDate!: string;
  @ApiProperty({ format: 'date-time' }) checkedAt!: string;
  @ApiProperty({ type: [FaceAvailabilityResponse] }) faces!: FaceAvailabilityResponse[];
  @ApiProperty({
    type: Boolean,
    example: false,
    description: 'This check never creates a reservation or guarantees future availability',
  })
  reservation!: false;
}

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
  @ApiProperty({ enum: ['local', 'openai'] }) mode!: 'local' | 'openai';
  @ApiProperty({ type: String, enum: ['openai'], nullable: true }) provider!: 'openai' | null;
  @ApiProperty({ type: String, enum: ['gpt-6-luna'], nullable: true }) model!: 'gpt-6-luna' | null;
  @ApiProperty({ type: Boolean }) aiAvailable!: boolean;
  @ApiProperty() message!: string;
  @ApiProperty({ type: [String] }) documentFormats!: string[];
  @ApiProperty({ example: 10485760 }) maxUploadBytes!: number;
  @ApiProperty({ type: Boolean, example: false }) documentsRetained!: false;
  @ApiProperty({
    type: Boolean,
    description:
      'Chat provider configured; brief text is transferred only with explicit per-brief consent.',
  })
  externalTransfer!: boolean;
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

export class PlannerRecommendationResponse {
  @ApiProperty({ format: 'uuid' }) siteId!: string;
  @ApiProperty({ format: 'uuid' }) faceId!: string;
  @ApiProperty({ maxLength: 1000 }) reason!: string;
}
export class PlannerReplyResponse {
  @ApiProperty({ enum: ['local', 'openai'] }) mode!: 'local' | 'openai';
  @ApiProperty({ type: String, enum: ['openai'], nullable: true }) provider!: 'openai' | null;
  @ApiProperty({ type: String, enum: ['gpt-6-luna'], nullable: true }) model!: 'gpt-6-luna' | null;
  @ApiProperty({ type: Boolean }) aiAvailable!: boolean;
  @ApiProperty() message!: string;
  @ApiProperty({
    description: 'True only when this request sent explicitly consented confirmed text to OpenAI.',
  })
  briefShared!: boolean;
  @ApiProperty({ type: [PlannerRecommendationResponse] })
  recommendations!: PlannerRecommendationResponse[];
  @ApiProperty({ type: [String] }) questions!: string[];
  @ApiProperty({
    type: Object,
    description:
      'Authoritative server facts: checkedAt, UTC window, brief-aware bounded retrieval coverage and confirmation needs, marketplace sites/faces with canonical media estimates, availability and source-backed production enrichment, selected budget summary, selected WGS84 Haversine distances in km, ots:null, reach:null and assumptions. See docs/agency-planner-api.md.',
  })
  facts!: object;
  @ApiProperty({ type: BriefConstraintsResponse }) constraints!: BriefConstraintsResponse;
  @ApiProperty({ type: [String] }) missing!: string[];
  @ApiProperty({ type: Boolean, example: true }) requiresConfirmation!: true;
}

export class FaceAvailabilityResponse {
  @ApiProperty() faceId!: string;
  @ApiProperty({
    description:
      'Physically flight-eligible face (permit coverage and digital specs) without an overlapping blackout or active booking at checkedAt',
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

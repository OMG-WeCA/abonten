// Central barrel for all TypeORM entities so DataSource/DatabaseModule registration
// stays in one place. Order doesn't matter for schema creation (FKs are logical only
// at this stage — no DB-level foreign keys in the initial migration, per SPEC §6
// "logical outline, not a physical schema").
export { PartnerTermsAcceptanceEntity } from './partner-terms-acceptance.entity';
export { OrganizationEntity } from './organization.entity';
export { EnrichmentImportEntity } from './enrichment-import.entity';
export { EnrichmentFeatureEntity } from './enrichment-feature.entity';
export { BillboardSiteEntity } from './billboard-site.entity';
export { SiteFaceEntity } from './site-face.entity';
export { SiteAssetEntity } from './site-asset.entity';
export { SiteMetadataEntity } from './site-metadata.entity';
export { RateCardEntity } from './rate-card.entity';
export { MarketEntity } from './market.entity';
export { TagEntity } from './tag.entity';
export { CampaignEntity } from './campaign.entity';
export { CampaignItemEntity } from './campaign-item.entity';
export { BookingEntity } from './booking.entity';
export { FaceBlackoutEntity } from './face-blackout.entity';
export { QuoteEntity } from './quote.entity';
export { CreativeEntity } from './creative.entity';
export { ProofOfPerformanceEntity } from './proof-of-performance.entity';
export { PopPhotoEntity } from './pop-photo.entity';
export { IssueEntity } from './issue.entity';
export { IssueCommentEntity } from './issue-comment.entity';
export { AlertRuleEntity } from './alert-rule.entity';
export { AuditLogEntity } from './audit-log.entity';
export { ReferenceDataEntity } from './reference-data.entity';
export { ReportDefinitionEntity } from './report-definition.entity';
export { ReportRunEntity } from './report-run.entity';
export { UserEntity } from '../../auth/entities/user.entity';
export { MembershipEntity } from '../../auth/entities/membership.entity';
export { UserCapabilityOverrideEntity } from '../../auth/entities/user-capability-override.entity';
export { RefreshTokenEntity } from '../../auth/entities/refresh-token.entity';
export { OrganizationCreationRequestEntity } from '../../orgs/entities/organization-creation-request.entity';

import { PartnerTermsAcceptanceEntity } from './partner-terms-acceptance.entity';
import { OrganizationEntity } from './organization.entity';
import { EnrichmentImportEntity } from './enrichment-import.entity';
import { EnrichmentFeatureEntity } from './enrichment-feature.entity';
import { BillboardSiteEntity } from './billboard-site.entity';
import { SiteFaceEntity } from './site-face.entity';
import { SiteAssetEntity } from './site-asset.entity';
import { SiteMetadataEntity } from './site-metadata.entity';
import { RateCardEntity } from './rate-card.entity';
import { MarketEntity } from './market.entity';
import { TagEntity } from './tag.entity';
import { CampaignEntity } from './campaign.entity';
import { CampaignItemEntity } from './campaign-item.entity';
import { BookingEntity } from './booking.entity';
import { FaceBlackoutEntity } from './face-blackout.entity';
import { QuoteEntity } from './quote.entity';
import { CreativeEntity } from './creative.entity';
import { ProofOfPerformanceEntity } from './proof-of-performance.entity';
import { PopPhotoEntity } from './pop-photo.entity';
import { IssueEntity } from './issue.entity';
import { IssueCommentEntity } from './issue-comment.entity';
import { AlertRuleEntity } from './alert-rule.entity';
import { AuditLogEntity } from './audit-log.entity';
import { ReferenceDataEntity } from './reference-data.entity';
import { ReportDefinitionEntity } from './report-definition.entity';
import { ReportRunEntity } from './report-run.entity';
import { UserEntity } from '../../auth/entities/user.entity';
import { MembershipEntity } from '../../auth/entities/membership.entity';
import { UserCapabilityOverrideEntity } from '../../auth/entities/user-capability-override.entity';
import { RefreshTokenEntity } from '../../auth/entities/refresh-token.entity';
import { OrganizationCreationRequestEntity } from '../../orgs/entities/organization-creation-request.entity';

/** All entities, for DataSource / DatabaseModule registration. */
export const ENTITIES = [
  PartnerTermsAcceptanceEntity,
  OrganizationEntity,
  EnrichmentImportEntity,
  EnrichmentFeatureEntity,
  BillboardSiteEntity,
  SiteFaceEntity,
  SiteAssetEntity,
  SiteMetadataEntity,
  RateCardEntity,
  MarketEntity,
  TagEntity,
  CampaignEntity,
  CampaignItemEntity,
  BookingEntity,
  FaceBlackoutEntity,
  QuoteEntity,
  CreativeEntity,
  ProofOfPerformanceEntity,
  PopPhotoEntity,
  IssueEntity,
  IssueCommentEntity,
  AlertRuleEntity,
  AuditLogEntity,
  ReferenceDataEntity,
  ReportDefinitionEntity,
  ReportRunEntity,
  UserEntity,
  MembershipEntity,
  UserCapabilityOverrideEntity,
  RefreshTokenEntity,
  OrganizationCreationRequestEntity,
];

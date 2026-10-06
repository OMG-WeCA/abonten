import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { PartnerTermsDocument, TermsLocale } from '../../orgs/terms/partner-terms.catalog';

/** Immutable affirmative event; draft preview events are never legal acceptance. */
@Entity({ name: 'partner_terms_acceptances' })
@Index(['organizationId', 'version'], { unique: true })
export class PartnerTermsAcceptanceEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('uuid', { name: 'organization_id' }) organizationId!: string;
  @Column('uuid', { name: 'user_id' }) userId!: string;
  @Column({ name: 'organization_name' }) organizationName!: string;
  @Column({ name: 'representative_name' }) representativeName!: string;
  @Column() version!: string;
  @Column() locale!: TermsLocale;
  @Column() digest!: string;
  @Column({ name: 'event_kind' }) eventKind!: 'preview_acknowledgement' | 'approved_acceptance';
  @Column({ name: 'authority_confirmed' }) authorityConfirmed!: boolean;
  @Column('jsonb', { name: 'content_copy' }) contentCopy!: PartnerTermsDocument;
  @Column('timestamptz', { name: 'accepted_at' }) acceptedAt!: Date;
}

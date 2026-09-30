import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Immutable normalized geometry attached to one public source import. */
@Entity({ name: 'enrichment_features' })
export class EnrichmentFeatureEntity {
  @PrimaryColumn({ name: 'import_id', type: 'uuid' }) importId!: string;
  @PrimaryColumn({ name: 'external_id' }) externalId!: string;
  @Column({ type: 'geometry', srid: 4326 }) geom!: object;
  @Column({ type: 'jsonb' }) properties!: Record<string, unknown>;
}

import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Campaign — an agency's plan for a brand client (SPEC.md §6.3). Stub for S1/S2. */
@Entity({ name: 'campaigns' })
export class CampaignEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'organization_id' }) organizationId!: string;
  @Column({ name: 'client_org_id', nullable: true }) clientOrgId?: string;
  @Column() name!: string;
  @Column({ nullable: true }) objective?: string;
  @Column({ nullable: true }) currency?: string;
  @Column({ name: 'total_budget', type: 'double precision', nullable: true }) totalBudget?: number;
  @Column({ name: 'flight_start', type: 'timestamptz', nullable: true }) flightStart?: Date;
  @Column({ name: 'flight_end', type: 'timestamptz', nullable: true }) flightEnd?: Date;
  @Column({ name: 'target_audience', nullable: true }) targetAudience?: string;
  @Column({ default: 'draft' }) status!: string;
  @Column({ name: 'scenario_of', nullable: true }) scenarioOf?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
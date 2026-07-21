import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Market / GeoArea hierarchy: country → region → city → market/zone (SPEC.md §6.2). */
@Entity({ name: 'markets' })
export class MarketEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column() name!: string;
  @Column() country!: string;
  @Column({ name: 'parent_id', nullable: true }) parentId?: string;
  @Column({ type: 'json', nullable: true }) bounds?: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
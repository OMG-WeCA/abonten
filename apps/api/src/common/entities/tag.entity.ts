import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Lightweight taxonomy tag for sites (SPEC.md §6.2). */
@Entity({ name: 'tags' })
export class TagEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column() scope!: string;
  @Column() value!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
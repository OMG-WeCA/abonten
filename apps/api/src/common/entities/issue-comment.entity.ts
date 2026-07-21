import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Comment on an issue thread (SPEC.md §6.4). Stub for S1/S2. */
@Entity({ name: 'issue_comments' })
export class IssueCommentEntity {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'issue_id' }) issueId!: string;
  @Column({ name: 'author_user_id' }) authorUserId!: string;
  @Column({ type: 'text' }) body!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}
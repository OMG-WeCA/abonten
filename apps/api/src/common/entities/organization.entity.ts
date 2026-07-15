import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'organizations' })
export class OrganizationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column() name!: string;
  @Column() type!: string;
  @Column() country!: string;
  @Column({ name: 'default_currency', default: 'NGN' }) defaultCurrency!: string;
  @Column({ name: 'default_locale', default: 'en' }) defaultLocale!: string;
  @Column({ default: 'active' }) status!: string;
  @Column({ name: 'billing_ref', nullable: true }) billingRef?: string;

  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt!: Date;
}

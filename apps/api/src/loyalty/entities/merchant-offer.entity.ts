import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MerchantOfferStatus } from '@ktb/shared-types';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationMerchant } from './organization-merchant.entity';
import { User } from '../../identity/entities/user.entity';

/**
 * MerchantOffer — a promotional offer funded by the merchant, redeemable with loyalty coins.
 * Proposed by the merchant, reviewed by Municipality Admin before going ACTIVE (FR-LOY-03, D#20).
 */
@Entity('merchant_offers')
export class MerchantOffer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId!: string;

  @ManyToOne(() => OrganizationMerchant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'merchant_id' })
  merchant?: OrganizationMerchant;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ name: 'coin_cost', type: 'numeric', precision: 8, scale: 2 })
  coinCost!: number;

  @Column({ name: 'max_redemptions', type: 'int', nullable: true })
  maxRedemptions?: number | null;

  @Column({ name: 'redemptions_count', type: 'int', default: 0 })
  redemptionsCount!: number;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom!: Date;

  @Column({ name: 'valid_until', type: 'timestamptz' })
  validUntil!: Date;

  @Column({
    type: 'varchar',
    length: 30,
    default: MerchantOfferStatus.PENDING_REVIEW,
  })
  status!: MerchantOfferStatus;

  @Column({ name: 'proposed_by', type: 'uuid' })
  proposedBy!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'proposed_by' })
  proposedByUser?: User;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'reviewed_by' })
  reviewedByUser?: User | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt?: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

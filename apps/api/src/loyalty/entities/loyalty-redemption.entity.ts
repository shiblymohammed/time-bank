import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { MerchantOffer } from './merchant-offer.entity';
import { OrganizationMerchant } from './organization-merchant.entity';
import { User } from '../../identity/entities/user.entity';
import { LoyaltyCoinWallet } from './loyalty-coin-wallet.entity';

/**
 * LoyaltyRedemption — a record of a member spending coins to redeem a merchant offer.
 * The `one_time_code` is UNIQUE, preventing double-redemption (FR-LOY-04, D#21).
 */
@Entity('loyalty_redemptions')
export class LoyaltyRedemption {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'offer_id', type: 'uuid' })
  offerId!: string;

  @ManyToOne(() => MerchantOffer, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'offer_id' })
  offer?: MerchantOffer;

  @Column({ name: 'merchant_id', type: 'uuid' })
  merchantId!: string;

  @ManyToOne(() => OrganizationMerchant, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'merchant_id' })
  merchant?: OrganizationMerchant;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @ManyToOne(() => LoyaltyCoinWallet, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'wallet_id' })
  wallet?: LoyaltyCoinWallet;

  @Column({ name: 'coins_spent', type: 'numeric', precision: 8, scale: 2 })
  coinsSpent!: number;

  @Column({ name: 'one_time_code', type: 'varchar', length: 12, unique: true })
  oneTimeCode!: string;

  @CreateDateColumn({ name: 'redeemed_at', type: 'timestamptz' })
  redeemedAt!: Date;
}

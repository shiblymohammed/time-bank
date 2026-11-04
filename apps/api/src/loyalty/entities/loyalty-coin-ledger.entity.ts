import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { LoyaltyCoinTxType } from '@ktb/shared-types';
import { LoyaltyCoinWallet } from './loyalty-coin-wallet.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { ServiceRequest } from '../../requests/entities/service-request.entity';
import { VolunteerAssignment } from '../../matching/entities/volunteer-assignment.entity';

/**
 * LoyaltyCoinLedger — append-only coin movement record.
 * The DB trigger prevents UPDATE and DELETE (same pattern as time_credit_ledger).
 */
@Entity('loyalty_coin_ledger')
export class LoyaltyCoinLedger {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId!: string;

  @ManyToOne(() => LoyaltyCoinWallet, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'wallet_id' })
  wallet?: LoyaltyCoinWallet;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amount!: number;

  @Column({ name: 'balance_after', type: 'numeric', precision: 12, scale: 2 })
  balanceAfter!: number;

  @Column({ name: 'tx_type', type: 'varchar', length: 30 })
  txType!: LoyaltyCoinTxType;

  @Column({ name: 'service_request_id', type: 'uuid', nullable: true })
  serviceRequestId?: string | null;

  @ManyToOne(() => ServiceRequest, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'service_request_id' })
  serviceRequest?: ServiceRequest | null;

  @Column({ name: 'assignment_id', type: 'uuid', nullable: true })
  assignmentId?: string | null;

  @ManyToOne(() => VolunteerAssignment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'assignment_id' })
  assignment?: VolunteerAssignment | null;

  @Column({ name: 'redemption_id', type: 'uuid', nullable: true })
  redemptionId?: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reference?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UniversalTimeWallet } from '../../identity/entities/universal-time-wallet.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { ServiceRequest } from '../../requests/entities/service-request.entity';
import { VolunteerAssignment } from '../../matching/entities/volunteer-assignment.entity';
import { CommunityCreditPool } from '../../donations/entities/community-credit-pool.entity';
import { CreditDonation } from '../../donations/entities/credit-donation.entity';

export enum TimeCreditTxType {
  SERVICE_EARNED = 'SERVICE_EARNED',
  DONATION_SENT = 'DONATION_SENT',
  DONATION_RECEIVED = 'DONATION_RECEIVED',
}

const credits = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

/**
 * One append-only movement of universal time credits (FR-TIME-04, ITB-009).
 * Rows are never updated or deleted; a database trigger enforces this.
 */
@Entity('time_credit_ledger')
export class TimeCreditLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Exactly one of wallet or pool is set. */
  @Column({ name: 'wallet_id', type: 'uuid', nullable: true })
  walletId?: string | null;

  @ManyToOne(() => UniversalTimeWallet, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'wallet_id' })
  wallet?: UniversalTimeWallet;

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: credits })
  amount!: number;

  @Column({ name: 'balance_after', type: 'numeric', precision: 10, scale: 2, transformer: credits })
  balanceAfter!: number;

  /** Posted to frozen credits because the wallet was not active. */
  @Column({ type: 'boolean', default: false })
  held!: boolean;

  @Column({ name: 'tx_type', type: 'varchar', length: 30 })
  txType!: TimeCreditTxType;

  @Column({ name: 'originating_org_id', type: 'uuid' })
  originatingOrgId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'originating_org_id' })
  originatingOrg?: Organization;

  @Column({ name: 'service_request_id', type: 'uuid', nullable: true })
  serviceRequestId?: string | null;

  @ManyToOne(() => ServiceRequest, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'service_request_id' })
  serviceRequest?: ServiceRequest | null;

  @Column({ name: 'volunteer_assignment_id', type: 'uuid', nullable: true })
  volunteerAssignmentId?: string | null;

  @ManyToOne(() => VolunteerAssignment, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'volunteer_assignment_id' })
  volunteerAssignment?: VolunteerAssignment | null;

  @Column({ name: 'pool_id', type: 'uuid', nullable: true })
  poolId?: string | null;

  @ManyToOne(() => CommunityCreditPool, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'pool_id' })
  pool?: CommunityCreditPool | null;

  @Column({ name: 'donation_id', type: 'uuid', nullable: true })
  donationId?: string | null;

  @ManyToOne(() => CreditDonation, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'donation_id' })
  donation?: CreditDonation | null;

  @Column({ type: 'int', nullable: true })
  minutes?: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

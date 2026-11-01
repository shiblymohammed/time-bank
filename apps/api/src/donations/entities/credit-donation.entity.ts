import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';
import { CommunityCreditPool } from './community-credit-pool.entity';

/** One gift of time credits to a verified member or a community pool (FR-TIME-03). */
@Entity('credit_donations')
export class CreditDonation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'donor_user_id', type: 'uuid' })
  donorUserId!: string;

  @Column({ name: 'originating_org_id', type: 'uuid' })
  originatingOrgId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'originating_org_id' })
  originatingOrg?: Organization;

  @Column({ name: 'recipient_user_id', type: 'uuid', nullable: true })
  recipientUserId?: string | null;

  @Column({ name: 'recipient_membership_id', type: 'uuid', nullable: true })
  recipientMembershipId?: string | null;

  @ManyToOne(() => OrganizationMembership, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'recipient_membership_id' })
  recipientMembership?: OrganizationMembership | null;

  @Column({ name: 'recipient_pool_id', type: 'uuid', nullable: true })
  recipientPoolId?: string | null;

  @ManyToOne(() => CommunityCreditPool, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'recipient_pool_id' })
  recipientPool?: CommunityCreditPool | null;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: { to: (value: number) => value, from: (value: string) => parseFloat(value) },
  })
  amount!: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  note?: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100 })
  idempotencyKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

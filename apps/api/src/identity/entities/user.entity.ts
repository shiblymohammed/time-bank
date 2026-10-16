import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { AccountStatus } from '@ktb/shared-types';
import { VerifiedIdentity } from './verified-identity.entity';
import { UniversalTimeWallet } from './universal-time-wallet.entity';
import { GlobalAccountRestriction } from './global-account-restriction.entity';
import { OrganizationMembership } from '../../memberships/entities/organization-membership.entity';

/**
 * Global User Entity
 * One permanent verified user identity across all Indian Time Bank organizations (D#39, ITB-004).
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'phone_e164', type: 'varchar', length: 20, unique: true })
  phoneE164!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: AccountStatus.ACTIVE,
  })
  status!: AccountStatus;

  @Column({ name: 'primary_org_id', type: 'uuid', nullable: true })
  primaryOrgId?: string | null;

  @OneToOne(() => VerifiedIdentity, (vi) => vi.user, { cascade: false })
  verifiedIdentity?: VerifiedIdentity;

  @OneToOne(() => UniversalTimeWallet, (wallet) => wallet.user, { cascade: false })
  universalWallet?: UniversalTimeWallet;

  @OneToMany(() => OrganizationMembership, (membership) => membership.user)
  memberships!: OrganizationMembership[];

  @OneToMany(() => GlobalAccountRestriction, (restriction) => restriction.user)
  restrictions!: GlobalAccountRestriction[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

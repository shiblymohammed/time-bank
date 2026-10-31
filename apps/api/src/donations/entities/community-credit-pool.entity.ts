import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

export enum CommunityPoolStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

/** An approved municipal assistance pool that members can donate credits to (D#19). */
@Entity('community_credit_pools')
export class CommunityCreditPool {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string | null;

  @Column({
    name: 'balance_credits',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: { to: (value: number) => value, from: (value: string) => parseFloat(value) },
  })
  balanceCredits!: number;

  @Column({ type: 'varchar', length: 20, default: CommunityPoolStatus.ACTIVE })
  status!: CommunityPoolStatus;

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

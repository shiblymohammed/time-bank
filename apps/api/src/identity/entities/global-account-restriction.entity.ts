import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { GlobalRestrictionType, GlobalRestrictionStatus } from '@ktb/shared-types';
import { User } from './user.entity';

/**
 * Global Account Restriction Entity
 * Platform-wide suspensions and restrictions (D#82, D#83, ITB-012).
 */
@Entity('global_account_restrictions')
export class GlobalAccountRestriction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, (user) => user.restrictions)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    name: 'restriction_type',
    type: 'varchar',
    length: 50,
  })
  restrictionType!: GlobalRestrictionType;

  @Column({ name: 'reason_code', type: 'varchar', length: 100 })
  reasonCode!: string;

  @Column({
    type: 'varchar',
    length: 30,
    default: GlobalRestrictionStatus.ACTIVE,
  })
  status!: GlobalRestrictionStatus;

  @Column({ name: 'authorized_by', type: 'uuid' })
  authorizedBy!: string;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy?: string | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

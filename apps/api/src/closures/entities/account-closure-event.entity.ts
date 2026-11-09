import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ClosureEventType } from '@ktb/shared-types';
import { User } from '../../identity/entities/user.entity';
import { AccountClosure } from './account-closure.entity';

/** The closure's history. A database trigger refuses any change once written. */
@Entity('account_closure_events')
export class AccountClosureEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'closure_id', type: 'uuid' })
  closureId!: string;

  @ManyToOne(() => AccountClosure, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'closure_id' })
  closure?: AccountClosure;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_user_id' })
  actor?: User;

  @Column({ type: 'varchar', length: 30 })
  type!: ClosureEventType;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

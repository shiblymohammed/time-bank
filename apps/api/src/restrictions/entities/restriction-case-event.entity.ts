import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { RestrictionCaseEventType } from '@ktb/shared-types';
import { User } from '../../identity/entities/user.entity';
import { RestrictionCase } from './restriction-case.entity';

/** The case history. A database trigger refuses any change once written. */
@Entity('restriction_case_events')
export class RestrictionCaseEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'case_id', type: 'uuid' })
  caseId!: string;

  @ManyToOne(() => RestrictionCase, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'case_id' })
  restrictionCase?: RestrictionCase;

  @Column({ name: 'actor_user_id', type: 'uuid' })
  actorUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_user_id' })
  actor?: User;

  @Column({ type: 'varchar', length: 30 })
  type!: RestrictionCaseEventType;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

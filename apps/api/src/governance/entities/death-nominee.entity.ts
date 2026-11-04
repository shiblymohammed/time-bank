import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from '../../identity/entities/user.entity';

/** Post-death credit transfer nominee — one per user (FR-IDENT-06, D#44, D#45). */
@Entity('death_nominees')
export class DeathNominee {
  @PrimaryGeneratedColumn('uuid') id!: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true }) userId!: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) @JoinColumn({ name: 'user_id' }) user?: User;

  @Column({ name: 'nominee_name', type: 'varchar', length: 200 }) nomineeName!: string;
  @Column({ name: 'nominee_phone', type: 'varchar', length: 20 }) nomineePhone!: string;

  @Column({ name: 'nominee_user_id', type: 'uuid', nullable: true }) nomineeUserId?: string | null;
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true }) @JoinColumn({ name: 'nominee_user_id' }) nomineeUser?: User | null;

  @Column({ type: 'boolean', default: false }) verified!: boolean;
  @Column({ name: 'updated_by_otp', type: 'boolean', default: false }) updatedByOtp!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt!: Date;
}

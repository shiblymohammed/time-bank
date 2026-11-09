import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../identity/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import type { SponsorFigures } from '../report-figures';

export type SponsorReportSource = 'MONTHLY_JOB' | 'STAFF';

/** One saved version of a community's month. A database trigger refuses any change once written. */
@Entity('sponsor_reports')
export class SponsorReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @Column({ name: 'period_month', type: 'char', length: 7 })
  periodMonth!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'jsonb' })
  figures!: SponsorFigures;

  @Column({ type: 'varchar', length: 16 })
  source!: SponsorReportSource;

  @Column({ name: 'generated_by_user_id', type: 'uuid', nullable: true })
  generatedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'generated_by_user_id' })
  generatedBy?: User | null;

  @Column({ name: 'generated_at', type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;
}

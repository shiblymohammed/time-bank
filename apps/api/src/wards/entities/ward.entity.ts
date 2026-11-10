import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const WARD_REPRESENTATIVE_TITLES = ['COUNCILLOR', 'WARD_MEMBER'] as const;
export type WardRepresentativeTitle = (typeof WARD_REPRESENTATIVE_TITLES)[number];

/** One ward of a municipality and the person members ask for a signed NOC. */
@Entity('wards')
export class Ward {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'ward_number', type: 'varchar', length: 20 })
  wardNumber!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ name: 'representative_title', type: 'varchar', length: 20 })
  representativeTitle!: WardRepresentativeTitle;

  @Column({ name: 'representative_name', type: 'varchar', length: 120 })
  representativeName!: string;

  /** Staff only: members see the name, ward and office. */
  @Column({ name: 'representative_phone', type: 'varchar', length: 20, nullable: true })
  representativePhone!: string | null;

  @Column({ name: 'office_address', type: 'varchar', length: 300, nullable: true })
  officeAddress!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status!: 'ACTIVE' | 'INACTIVE';

  @Column({ name: 'created_by_user_id', type: 'uuid', nullable: true })
  createdByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

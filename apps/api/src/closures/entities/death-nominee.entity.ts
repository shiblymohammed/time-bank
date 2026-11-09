import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Who a member names to receive their credits. Old rows stay, so a late change can be seen. */
@Entity('death_nominees')
export class DeathNominee {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'nominee_name', type: 'varchar', length: 100 })
  nomineeName!: string;

  @Column({ name: 'nominee_phone', type: 'varchar', length: 20 })
  nomineePhone!: string;

  @Column({ name: 'replaced_at', type: 'timestamptz', nullable: true })
  replacedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

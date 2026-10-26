import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { GlobalServiceDefinition } from './global-service-definition.entity';

/**
 * ServiceCategory Entity (Global Core Domain)
 * Represents the top-level standardized taxonomy for volunteer services nationwide (D#10).
 */
@Entity('service_categories')
export class ServiceCategory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ name: 'name_en', type: 'varchar', length: 100 })
  nameEn!: string;

  @Column({ name: 'name_ml', type: 'varchar', length: 100 })
  nameMl!: string;

  @Column({ name: 'description_en', type: 'text', nullable: true })
  descriptionEn?: string | null;

  @Column({ name: 'description_ml', type: 'text', nullable: true })
  descriptionMl?: string | null;

  @Column({ name: 'icon_key', type: 'varchar', length: 100, nullable: true })
  iconKey?: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder!: number;

  @OneToMany(() => GlobalServiceDefinition, (service) => service.category)
  services?: GlobalServiceDefinition[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

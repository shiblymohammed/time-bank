import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Which community's app a phone registered from, so a community's push messages reach only that
 * community's app (AT-15). Empty for devices registered before this, until they register again,
 * and for builds not locked to a community; those still receive every message.
 */
export class PushDeviceOrganization1729118400016 implements MigrationInterface {
  name = 'PushDeviceOrganization1729118400016';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE push_devices
        ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE push_devices DROP COLUMN organization_id;`);
  }
}

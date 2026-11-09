import { DataSource, QueryRunner } from 'typeorm';
import * as path from 'path';
import { Foundation1729118400001 } from './migrations/1729118400001-Foundation';
import { IdentityAndOrganizations1729118400002 } from './migrations/1729118400002-IdentityAndOrganizations';
import { ServiceCatalogueAndRequests1729118400003 } from './migrations/1729118400003-ServiceCatalogueAndRequests';
import { OperationalZonesAndMatchingRounds1729118400004 } from './migrations/1729118400004-OperationalZonesAndMatchingRounds';

import { RescheduleConfirmation1729118400005 } from './migrations/1729118400005-RescheduleConfirmation';
import { ServiceCompletion1729118400006 } from './migrations/1729118400006-ServiceCompletion';
import { TimeCreditLedger1729118400007 } from './migrations/1729118400007-TimeCreditLedger';
import { CreditDonations1729118400008 } from './migrations/1729118400008-CreditDonations';
import { MembershipApplications1729118400009 } from './migrations/1729118400009-MembershipApplications';
import { CreditControls1729118400010 } from './migrations/1729118400010-CreditControls';
import { PushNotifications1729118400011 } from './migrations/1729118400011-PushNotifications';
import { SecurityReviewFixes1729118400012 } from './migrations/1729118400012-SecurityReviewFixes';
import { BookingRecovery1729118400013 } from './migrations/1729118400013-BookingRecovery';
import { StaffEmailCode1729118400014 } from './migrations/1729118400014-StaffEmailCode';
import { NamesAndIdentity1729118400015 } from './migrations/1729118400015-NamesAndIdentity';
import { PushDeviceOrganization1729118400016 } from './migrations/1729118400016-PushDeviceOrganization';
import { SafetyAlerts1729118400017 } from './migrations/1729118400017-SafetyAlerts';
describe('entity and migration schema contract', () => {
  it('defines every mapped entity column in the migration SQL', async () => {
    const queries: string[] = [];
    const runner = {
      query: async (sql: string) => {
        queries.push(sql);
        return [];
      },
    } as unknown as QueryRunner;
    for (const migration of [
      new Foundation1729118400001(),
      new IdentityAndOrganizations1729118400002(),
      new ServiceCatalogueAndRequests1729118400003(),
      new OperationalZonesAndMatchingRounds1729118400004(),
      new RescheduleConfirmation1729118400005(),
      new ServiceCompletion1729118400006(),
      new TimeCreditLedger1729118400007(),
      new CreditDonations1729118400008(),
      new MembershipApplications1729118400009(),
      new CreditControls1729118400010(),
      new PushNotifications1729118400011(),
      new SecurityReviewFixes1729118400012(),
      new BookingRecovery1729118400013(),
      new StaffEmailCode1729118400014(),
      new NamesAndIdentity1729118400015(),
      new PushDeviceOrganization1729118400016(),
      new SafetyAlerts1729118400017(),
    ]) {
      await migration.up(runner);
    }
    const tables = new Map<string, Set<string>>();
    for (const sql of queries.flatMap((query) => query.split(';'))) {
      const create = /CREATE TABLE "?(\w+)"?\s*\(([\s\S]*)\)/.exec(sql);
      if (create) {
        const columns = [
          ...create[2]!.matchAll(
            /^\s*"?(\w+)"?\s+(?:UUID|VARCHAR|TEXT|INT|INTEGER|BIGINT|SMALLINT|NUMERIC|BOOLEAN|TIMESTAMP|TIMESTAMPTZ|JSONB|DATE|DECIMAL|INET|BYTEA|DOUBLE|REAL|CHAR)/gim,
          ),
        ].map((m) => m[1]!);
        tables.set(create[1]!, new Set(columns));
      }
      const alter = /ALTER TABLE "?(\w+)"?/.exec(sql);
      if (alter)
        for (const column of sql.matchAll(/ADD COLUMN (?:IF NOT EXISTS )?"?(\w+)"?/g)) {
          tables.get(alter[1]!)?.add(column[1]!);
        }
    }
    const source = new DataSource({
      type: 'postgres',
      entities: [path.join(__dirname, '../**/*.entity.ts')],
    });
    await (source as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
    expect(source.entityMetadatas).toHaveLength(36);
    for (const entity of source.entityMetadatas) {
      expect(tables.has(entity.tableName)).toBe(true);
      for (const column of entity.columns) {
        expect({
          table: entity.tableName,
          missingColumn: tables.get(entity.tableName)?.has(column.databaseName)
            ? null
            : column.databaseName,
        }).toEqual({ table: entity.tableName, missingColumn: null });
      }
    }
    // Compiling every entity file can pass Jest's default 5 seconds on a busy run.
  }, 60_000);
});

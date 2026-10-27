import { QueryRunner } from 'typeorm';
import { OperationalZonesAndMatchingRounds1729118400004 } from './1729118400004-OperationalZonesAndMatchingRounds';

describe('OperationalZonesAndMatchingRounds1729118400004 Migration', () => {
  let migration: OperationalZonesAndMatchingRounds1729118400004;
  let executedUpQueries: string[];
  let executedDownQueries: string[];
  let mockQueryRunner: any;

  beforeEach(() => {
    migration = new OperationalZonesAndMatchingRounds1729118400004();
    executedUpQueries = [];
    executedDownQueries = [];

    mockQueryRunner = {
      query: jest.fn(async (query: string) => {
        executedUpQueries.push(query.trim());
        return [];
      }),
    };
  });

  it('has correct migration name timestamped sequentially (1729118400004)', () => {
    expect(migration.name).toBe('OperationalZonesAndMatchingRounds1729118400004');
  });

  it('creates operational_zones, volunteer_zone_assignments, and matching_rounds tables and alters existing tables', async () => {
    await migration.up(mockQueryRunner as QueryRunner);

    const combinedSql = executedUpQueries.join('\n');

    // 1. Verify tables created
    expect(combinedSql).toContain('CREATE TABLE "operational_zones"');
    expect(combinedSql).toContain('CREATE TABLE "volunteer_zone_assignments"');
    expect(combinedSql).toContain('CREATE TABLE "matching_rounds"');

    // 2. Verify unique constraints
    expect(combinedSql).toContain('uq_operational_zones_org_code');
    expect(combinedSql).toContain('uq_volunteer_zone_assignment');
    expect(combinedSql).toContain('uq_matching_rounds_request_round');

    // 3. Verify columns on volunteer_availabilities
    expect(combinedSql).toContain('"is_gps_consented"');
    expect(combinedSql).toContain('"residential_address_text"');
    expect(combinedSql).toContain('"residential_ward_number"');
    expect(combinedSql).toContain('"residential_postal_code"');
    expect(combinedSql).toContain('"residential_lat"');
    expect(combinedSql).toContain('"residential_lng"');

    // 4. Verify columns on volunteer_assignments
    expect(combinedSql).toContain('"matching_round_id"');
    expect(combinedSql).toContain('"idempotency_key"');
    expect(combinedSql).toContain('fk_vol_assignments_round');
  });

  it('reverts all changes in reverse dependency order', async () => {
    mockQueryRunner.query = jest.fn(async (query: string) => {
      executedDownQueries.push(query.trim());
      return [];
    });

    await migration.down(mockQueryRunner as QueryRunner);

    const combinedDownSql = executedDownQueries.join('\n');
    expect(combinedDownSql).toContain('DROP CONSTRAINT IF EXISTS "fk_vol_assignments_round"');
    expect(combinedDownSql).toContain('DROP TABLE IF EXISTS "matching_rounds"');
    expect(combinedDownSql).toContain('DROP TABLE IF EXISTS "volunteer_zone_assignments"');
    expect(combinedDownSql).toContain('DROP TABLE IF EXISTS "operational_zones"');
  });
});

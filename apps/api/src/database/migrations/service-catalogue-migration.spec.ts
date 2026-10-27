import { QueryRunner } from 'typeorm';
import { ServiceCatalogueAndRequests1729118400003 } from './1729118400003-ServiceCatalogueAndRequests';

describe('ServiceCatalogueAndRequests1729118400003 Migration', () => {
  let migration: ServiceCatalogueAndRequests1729118400003;
  let executedUpQueries: string[];
  let executedDownQueries: string[];
  let mockQueryRunner: any;

  beforeEach(() => {
    migration = new ServiceCatalogueAndRequests1729118400003();
    executedUpQueries = [];
    executedDownQueries = [];

    mockQueryRunner = {
      query: jest.fn(async (query: string) => {
        executedUpQueries.push(query.trim());
        return [];
      }),
    };
  });

  it('has correct migration name timestamped sequentially', () => {
    expect(migration.name).toBe('ServiceCatalogueAndRequests1729118400003');
  });

  it('applies forward migration creating all 12 tables with indexes and constraints', async () => {
    await migration.up(mockQueryRunner as QueryRunner);

    expect(executedUpQueries.length).toBeGreaterThan(15);
    const combinedSql = executedUpQueries.join('\n');

    // Verify all 12 tables created
    const expectedTables = [
      'service_categories',
      'global_service_definitions',
      'organization_service_catalog',
      'organization_service_proposals',
      'beneficiary_eligibilities',
      'caregiver_authorizations',
      'volunteer_skills',
      'volunteer_availabilities',
      'service_requests',
      'volunteer_assignments',
      'request_cancellations',
      'request_reschedules',
    ];

    for (const table of expectedTables) {
      expect(combinedSql).toContain(`CREATE TABLE "${table}"`);
    }

    // Verify credit calculation and metadata columns on global_service_definitions
    expect(combinedSql).toContain('"base_credit_rate_hourly"');
    expect(combinedSql).toContain('"credit_multiplier"');
    expect(combinedSql).toContain('"allow_partial_hours"');
    expect(combinedSql).toContain('"default_min_volunteers"');
    expect(combinedSql).toContain('"default_preferred_volunteers"');
    expect(combinedSql).toContain('"is_hazardous_physical"');
    expect(combinedSql).toContain('"is_emergency_prohibited"');
    expect(combinedSql).toContain('"requires_skills"');
    expect(combinedSql).toContain('"required_skill_codes"');

    // Verify safety check constraints
    expect(combinedSql).toContain('chk_global_min_volunteers');
    expect(combinedSql).toContain('chk_global_pref_volunteers');
    expect(combinedSql).toContain('chk_org_service_min_volunteers');
    expect(combinedSql).toContain('chk_org_service_pref_volunteers');

    // Verify critical foreign keys
    expect(combinedSql).toContain('fk_global_service_category');
    expect(combinedSql).toContain('fk_org_service_catalog_org');
    expect(combinedSql).toContain('fk_org_service_catalog_global');
    expect(combinedSql).toContain('fk_org_proposals_org');

    // Verify indexing & idempotency
    expect(combinedSql).toContain('idx_service_categories_active');
    expect(combinedSql).toContain('idx_global_services_category');
    expect(combinedSql).toContain('idx_org_service_catalog_org_enabled');
    expect(combinedSql).toContain('idx_org_proposals_status');
    expect(combinedSql).toContain('"idempotency_key"');
    expect(combinedSql).toContain('uq_service_requests_idempotency');
  });

  it('reverts all created tables in reverse dependency order', async () => {
    mockQueryRunner.query = jest.fn(async (query: string) => {
      executedDownQueries.push(query.trim());
      return [];
    });

    await migration.down(mockQueryRunner as QueryRunner);

    expect(executedDownQueries).toHaveLength(12);

    // First dropped must be child dependencies (leaf tables)
    expect(executedDownQueries[0]).toContain('request_reschedules');
    expect(executedDownQueries[1]).toContain('request_cancellations');
    expect(executedDownQueries[2]).toContain('volunteer_assignments');
    expect(executedDownQueries[3]).toContain('service_requests');

    // Root definitions dropped last
    expect(executedDownQueries[10]).toContain('global_service_definitions');
    expect(executedDownQueries[11]).toContain('service_categories');
  });
});

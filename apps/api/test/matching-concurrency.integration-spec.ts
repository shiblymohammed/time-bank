import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RequestsService } from '../src/requests/requests.service';
import { RequestCancellation } from '../src/requests/entities/request-cancellation.entity';
import { RequestRescheduleHistory } from '../src/requests/entities/request-reschedule.entity';
import { OrganizationServiceCatalog } from '../src/catalogue/entities/organization-service-catalog.entity';
import { Organization } from '../src/organizations/entities/organization.entity';
import { User } from '../src/identity/entities/user.entity';
import { MembershipRoleGrant } from '../src/memberships/entities/membership-role-grant.entity';
import { AuthorizationService } from '../src/authorization/authorization.service';
import { MatchingConfigService } from '../src/matching/matching-config.service';
import { DeterministicCandidateRankingStrategy } from '../src/matching/ranking/deterministic-ranking.strategy';
import { RescheduleConfirmation1729118400005 } from '../src/database/migrations/1729118400005-RescheduleConfirmation';
import { VolunteerAssignmentStatus } from '@ktb/shared-types';
import { MatchingService } from '../src/matching/matching.service';
import { AuditService } from '../src/audit/audit.service';
import { AuditEvent } from '../src/audit/entities/audit-event.entity';
import { VolunteerSkill } from '../src/matching/entities/volunteer-skill.entity';
import { VolunteerAvailability } from '../src/matching/entities/volunteer-availability.entity';
import { VolunteerAssignment } from '../src/matching/entities/volunteer-assignment.entity';
import { OperationalZone } from '../src/matching/entities/operational-zone.entity';
import { VolunteerZoneAssignment } from '../src/matching/entities/volunteer-zone-assignment.entity';
import { MatchingRound } from '../src/matching/entities/matching-round.entity';
import { ServiceRequest } from '../src/requests/entities/service-request.entity';
import { OrganizationMembership } from '../src/memberships/entities/organization-membership.entity';
import { GlobalAccountRestriction } from '../src/identity/entities/global-account-restriction.entity';
import { Foundation1729118400001 } from '../src/database/migrations/1729118400001-Foundation';
import { IdentityAndOrganizations1729118400002 } from '../src/database/migrations/1729118400002-IdentityAndOrganizations';
import { ServiceCatalogueAndRequests1729118400003 } from '../src/database/migrations/1729118400003-ServiceCatalogueAndRequests';
import { OperationalZonesAndMatchingRounds1729118400004 } from '../src/database/migrations/1729118400004-OperationalZonesAndMatchingRounds';

// This suite deliberately refuses DATABASE_URL and ordinary database names.
// Its tables are reset between tests, so only a dedicated disposable database is valid.
const connection = process.env['MATCHING_TEST_DATABASE_URL'];
if (!connection || !/^ktb_matching_test_[a-z0-9_]+$/.test(new URL(connection).pathname.slice(1))) {
  throw new Error('Set MATCHING_TEST_DATABASE_URL to a disposable ktb_matching_test_* database');
}

describe('Volunteer booking concurrency against PostgreSQL', () => {
  const db = new DataSource({
    type: 'postgres',
    url: connection,
    entities: [join(__dirname, '../src/**/*.entity.ts')],
    migrations: [
      Foundation1729118400001,
      IdentityAndOrganizations1729118400002,
      ServiceCatalogueAndRequests1729118400003,
      OperationalZonesAndMatchingRounds1729118400004,
      RescheduleConfirmation1729118400005,
    ],
    synchronize: false,
    extra: {
      max: 10,
      application_name: 'ktb_matching_concurrency',
      options: '-c lock_timeout=10000 -c statement_timeout=15000',
    },
  });
  let service: MatchingService;
  let requests: RequestsService;
  let audit: AuditService;
  let orgA: string, orgB: string, volunteer: string, otherVolunteer: string, coordinator: string;
  let memberA: string,
    memberB: string,
    otherMember: string,
    beneficiaryA: string,
    beneficiaryB: string;
  let catalogueA: string, catalogueB: string;
  let sequence = 0;

  const id = async (sql: string, parameters: unknown[] = []): Promise<string> =>
    (await db.query(sql, parameters))[0].id;

  beforeAll(async () => {
    await db.initialize();
    await db.runMigrations();
    audit = new AuditService(db.getRepository(AuditEvent));
    const authorization = new AuthorizationService(
      db.getRepository(User),
      db.getRepository(Organization),
      db.getRepository(OrganizationMembership),
      db.getRepository(MembershipRoleGrant),
      db.getRepository(GlobalAccountRestriction),
    );
    service = new MatchingService(
      db.getRepository(VolunteerSkill),
      db.getRepository(VolunteerAvailability),
      db.getRepository(VolunteerAssignment),
      db.getRepository(OperationalZone),
      db.getRepository(VolunteerZoneAssignment),
      db.getRepository(MatchingRound),
      db.getRepository(ServiceRequest),
      db.getRepository(OrganizationMembership),
      db.getRepository(GlobalAccountRestriction),
      new DeterministicCandidateRankingStrategy(),
      new MatchingConfigService(new ConfigService()),
      db,
      audit,
      authorization,
    );
    requests = new RequestsService(
      db.getRepository(ServiceRequest),
      db.getRepository(RequestCancellation),
      db.getRepository(RequestRescheduleHistory),
      db.getRepository(OrganizationServiceCatalog),
      db.getRepository(OrganizationMembership),
      db.getRepository(Organization),
      db.getRepository(VolunteerAssignment),
      {} as any,
      service,
      audit,
      authorization,
    );
  });

  afterAll(async () => {
    if (db.isInitialized) await db.destroy();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await db.query('TRUNCATE audit_events, users, organizations, service_categories CASCADE');
    sequence = 0;
    orgA = await id(
      "INSERT INTO organizations(code,name,district) VALUES('A','Organization A','Test') RETURNING id",
    );
    orgB = await id(
      "INSERT INTO organizations(code,name,district) VALUES('B','Organization B','Test') RETURNING id",
    );
    volunteer = await id("INSERT INTO users(phone_e164) VALUES('+919000000001') RETURNING id");
    otherVolunteer = await id("INSERT INTO users(phone_e164) VALUES('+919000000002') RETURNING id");
    coordinator = await id("INSERT INTO users(phone_e164) VALUES('+919000000003') RETURNING id");
    const beneficiary = await id(
      "INSERT INTO users(phone_e164) VALUES('+919000000004') RETURNING id",
    );
    const member = (org: string, user: string) =>
      id(
        "INSERT INTO organization_memberships(organization_id,user_id,status) VALUES($1,$2,'APPROVED') RETURNING id",
        [org, user],
      );
    memberA = await member(orgA, volunteer);
    memberB = await member(orgB, volunteer);
    otherMember = await member(orgA, otherVolunteer);
    beneficiaryA = await member(orgA, beneficiary);
    beneficiaryB = await member(orgB, beneficiary);
    const coordinatorMember = await member(orgA, coordinator);
    await db.query(
      "INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,'COORDINATOR',$2)",
      [coordinatorMember, coordinator],
    );
    for (const membership of [memberA, memberB, otherMember]) {
      await db.query(
        "INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,'VOLUNTEER',$2)",
        [membership, coordinator],
      );
    }
    const category = await id(
      "INSERT INTO service_categories(code,name_en,name_ml) VALUES('TEST','Test','Test') RETURNING id",
    );
    const global = await id(
      "INSERT INTO global_service_definitions(category_id,code,name_en,name_ml) VALUES($1,'TEST','Test','Test') RETURNING id",
      [category],
    );
    catalogueA = await id(
      'INSERT INTO organization_service_catalog(organization_id,global_service_id) VALUES($1,$2) RETURNING id',
      [orgA, global],
    );
    catalogueB = await id(
      'INSERT INTO organization_service_catalog(organization_id,global_service_id) VALUES($1,$2) RETURNING id',
      [orgB, global],
    );
  });

  async function request(start = '2030-01-01T10:00:00Z', org = orgA, preferred = 1) {
    return id(
      `INSERT INTO service_requests(organization_id,request_number,beneficiary_membership_id,
      service_catalog_id,created_by_user_id,scheduled_start_time,expected_duration_minutes,
      preferred_volunteers,location_address_text,location_ward_number,location_postal_code)
      VALUES($1,$2,$3,$4,$5,$6,60,$7,'Test community centre','1','676503') RETURNING id`,
      [
        org,
        `REQ-${++sequence}`,
        org === orgA ? beneficiaryA : beneficiaryB,
        org === orgA ? catalogueA : catalogueB,
        coordinator,
        start,
        preferred,
      ],
    );
  }

  async function offer(requestId: string, member = memberA, org = orgA) {
    const round = await id(
      `INSERT INTO matching_rounds(organization_id,service_request_id,expires_at)
      VALUES($1,$2,NOW()+interval '1 hour') RETURNING id`,
      [org, requestId],
    );
    return id(
      `INSERT INTO volunteer_assignments(organization_id,service_request_id,volunteer_membership_id,
      matching_round_id,offer_expires_at) VALUES($1,$2,$3,$4,NOW()+interval '1 hour') RETURNING id`,
      [org, requestId, member, round],
    );
  }

  it('staff matching snapshot is tenant-scoped and excludes non-staff', async () => {
    const req = await request();
    await offer(req);
    const snapshot = await service.getRequestMatching(orgA, req, coordinator);
    expect(snapshot.pendingCount).toBe(1);
    expect(snapshot.acceptedCount).toBe(0);
    expect(snapshot.request.serviceName).toBe('Test');
    expect(snapshot.assignments).toHaveLength(1);
    await expect(service.getRequestMatching(orgA, req, volunteer)).rejects.toThrow(
      ForbiddenException,
    );
    const foreign = await request('2030-01-01T10:00:00Z', orgB);
    await expect(service.getRequestMatching(orgA, foreign, coordinator)).rejects.toThrow(
      'not found',
    );
  });

  it('dispatch search checks all verified skills and dispatch rechecks them', async () => {
    const req = await request();
    await db.query(
      'UPDATE global_service_definitions SET requires_skills=true, required_skill_codes=\'["FIRST_AID","DRIVING"]\'::jsonb',
    );
    let candidates = await service.listDispatchVolunteers(orgA, req, coordinator, {
      page: 1,
      limit: 10,
    });
    expect(candidates.total).toBe(0);
    await db.query(
      "INSERT INTO volunteer_skills(organization_id,membership_id,skill_code,status) VALUES($1,$2,'FIRST_AID','VERIFIED'),($1,$2,'DRIVING','VERIFIED')",
      [orgA, memberA],
    );
    candidates = await service.listDispatchVolunteers(orgA, req, coordinator, {
      page: 1,
      limit: 10,
      search: '9000000001',
    });
    expect(candidates.volunteers.map((v) => v.id)).toEqual([memberA]);
    await db.query("UPDATE volunteer_skills SET status='REJECTED' WHERE skill_code='DRIVING'");
    await expect(
      service.coordinatorDispatch(orgA, req, { volunteerMembershipId: memberA }, coordinator),
    ).rejects.toThrow('required verified skills');
    expect(await db.getRepository(VolunteerAssignment).count()).toBe(0);
  });

  it('rechecks changed central skill requirements before accepting an old offer', async () => {
    const req = await request();
    const pending = await offer(req);
    await db.query(
      'UPDATE global_service_definitions SET requires_skills=true, required_skill_codes=\'["FIRST_AID"]\'::jsonb',
    );
    await expect(service.acceptOffer(orgA, pending, memberA, {})).rejects.toThrow(
      'required verified skills',
    );
    expect(
      (await db.getRepository(VolunteerAssignment).findOneByOrFail({ id: pending })).status,
    ).toBe('OFFERED');
    await db.query(
      "INSERT INTO volunteer_skills(organization_id,membership_id,skill_code,status) VALUES($1,$2,'FIRST_AID','VERIFIED')",
      [orgA, memberA],
    );
    expect((await service.acceptOffer(orgA, pending, memberA, {})).status).toBe('ACCEPTED');
  });

  it('dispatch search excludes cross-organization overlapping commitments and respects pagination', async () => {
    const req = await request();
    const foreign = await request('2030-01-01T10:30:00Z', orgB);
    await offer(foreign, memberB, orgB);
    await db.query("UPDATE volunteer_assignments SET status='ACCEPTED'");
    const result = await service.listDispatchVolunteers(orgA, req, coordinator, {
      page: 1,
      limit: 1,
    });
    expect(result.total).toBe(1);
    expect(result.volunteers.map((v) => v.id)).toEqual([otherMember]);
    expect(
      (await service.listDispatchVolunteers(orgA, req, coordinator, { page: 2, limit: 1 }))
        .volunteers,
    ).toEqual([]);
  });

  // Hold a real row lock until both service transactions are observed waiting in
  // pg_stat_activity. The test proves overlapping execution rather than relying
  // on Promise scheduling or a sleep to happen to produce a race.
  async function race(
    actions: Array<() => Promise<unknown>>,
    lockTable = 'users',
    lockId = volunteer,
    ordered = false,
  ) {
    if (!['users', 'service_requests'].includes(lockTable))
      throw new Error('Unexpected lock table');
    const blocker = db.createQueryRunner();
    await blocker.connect();
    await blocker.startTransaction();
    await blocker.query(`SELECT id FROM ${lockTable} WHERE id=$1 FOR UPDATE`, [lockId]);
    const start = (action: () => Promise<unknown>): Promise<PromiseSettledResult<unknown>> =>
      action().then(
        (value) => ({ status: 'fulfilled' as const, value }),
        (reason) => ({ status: 'rejected' as const, reason }),
      );
    const pending = actions.slice(0, ordered ? 1 : actions.length).map(start);
    let observed = false;
    let waitDetails: unknown[] = [];
    try {
      const deadline = Date.now() + 7000;
      while (Date.now() < deadline) {
        // Long TypeORM SELECTs can be truncated before their FOR UPDATE suffix
        // in pg_stat_activity. Inspect lock waits, not the reported SQL text.
        const [state] = await db.query(`SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname=current_database() AND application_name='ktb_matching_concurrency'
          AND state='active' AND wait_event_type='Lock'`);
        if (ordered && pending.length === 1 && state.waiting >= 1) {
          pending.push(...actions.slice(1).map(start));
        }
        if (state.waiting >= actions.length) {
          observed = true;
          break;
        }
        waitDetails = await db.query(`SELECT wait_event_type, wait_event
          FROM pg_stat_activity WHERE datname=current_database()
          AND application_name='ktb_matching_concurrency' AND wait_event_type='Lock'`);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    } finally {
      await blocker.commitTransaction();
      await blocker.release();
    }
    if (pending.length < actions.length) pending.push(...actions.slice(pending.length).map(start));
    const results = await Promise.all(pending);
    if (!observed) {
      throw new Error(
        `Did not observe both blocked transactions: ${results
          .map((result) =>
            result.status === 'fulfilled' ? 'fulfilled' : String(result.reason?.message),
          )
          .join('; ')}; ${JSON.stringify(waitDetails)}`,
      );
    }
    return results;
  }

  async function expectOneBooking(results: PromiseSettledResult<unknown>[]) {
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(ConflictException);
    const [count] = await db.query(
      "SELECT count(*)::int AS accepted FROM volunteer_assignments WHERE status='ACCEPTED'",
    );
    expect(count.accepted).toBe(1);
    expect(await db.getRepository(AuditEvent).count()).toBe(1);
  }

  it('allows only one of two overlapping offers for the same volunteer', async () => {
    const first = await offer(await request());
    const second = await offer(await request('2030-01-01T10:30:00Z'));
    await expectOneBooking(
      await race([
        () => service.acceptOffer(orgA, first, memberA, {}),
        () => service.acceptOffer(orgA, second, memberA, {}),
      ]),
    );
  });

  it('serializes the same human across two organization memberships', async () => {
    const first = await offer(await request());
    const second = await offer(await request('2030-01-01T10:15:00Z', orgB), memberB, orgB);
    await expectOneBooking(
      await race([
        () => service.acceptOffer(orgA, first, memberA, {}),
        () => service.acceptOffer(orgB, second, memberB, {}),
      ]),
    );
  });

  it('uses the same reservation lock for acceptance and coordinator dispatch', async () => {
    const first = await offer(await request());
    const second = await request('2030-01-01T10:30:00Z');
    await expectOneBooking(
      await race([
        () => service.acceptOffer(orgA, first, memberA, {}),
        () =>
          service.coordinatorDispatch(
            orgA,
            second,
            { volunteerMembershipId: memberA },
            coordinator,
          ),
      ]),
    );
  });

  it('allows only one of two overlapping coordinator dispatches', async () => {
    const first = await request();
    const second = await request('2030-01-01T10:30:00Z');
    await expectOneBooking(
      await race([
        () =>
          service.coordinatorDispatch(orgA, first, { volunteerMembershipId: memberA }, coordinator),
        () =>
          service.coordinatorDispatch(
            orgA,
            second,
            { volunteerMembershipId: memberA },
            coordinator,
          ),
      ]),
    );
  });

  it('allows back-to-back assignments without treating endpoints as overlaps', async () => {
    const first = await offer(await request());
    const second = await offer(await request('2030-01-01T11:00:00Z'));
    const results = await race([
      () => service.acceptOffer(orgA, first, memberA, {}),
      () => service.acceptOffer(orgA, second, memberA, {}),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      await db
        .getRepository(VolunteerAssignment)
        .countBy({ status: VolunteerAssignmentStatus.ACCEPTED }),
    ).toBe(2);
  });

  it('allows different people to accept overlapping requests', async () => {
    const first = await offer(await request());
    const second = await offer(await request(), otherMember);
    await service.acceptOffer(orgA, first, memberA, {});
    await expect(service.acceptOffer(orgA, second, otherMember, {})).resolves.toBeDefined();
  });

  it('keeps simultaneous coordinator retries from inflating the team size', async () => {
    const target = await request('2030-01-01T10:00:00Z', orgA, 2);
    await db.query('UPDATE service_requests SET min_volunteers=2 WHERE id=$1', [target]);
    const results = await race([
      () =>
        service.coordinatorDispatch(orgA, target, { volunteerMembershipId: memberA }, coordinator),
      () =>
        service.coordinatorDispatch(orgA, target, { volunteerMembershipId: memberA }, coordinator),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(
      await db
        .getRepository(VolunteerAssignment)
        .countBy({ status: VolunteerAssignmentStatus.ACCEPTED }),
    ).toBe(1);
    expect((await db.getRepository(ServiceRequest).findOneByOrFail({ id: target })).status).toBe(
      'PARTIALLY_ACCEPTED',
    );
    expect(await db.getRepository(AuditEvent).count()).toBe(1);
  });

  it('allows a coordinator to resolve an escalated request', async () => {
    const target = await request();
    await db.query("UPDATE service_requests SET status='ESCALATED_TO_COORDINATOR' WHERE id=$1", [
      target,
    ]);
    await expect(
      service.coordinatorDispatch(orgA, target, { volunteerMembershipId: memberA }, coordinator),
    ).resolves.toMatchObject({ status: VolunteerAssignmentStatus.ACCEPTED });
  });

  it('keeps concurrent retries of the same offer idempotent under the lock', async () => {
    const assignment = await offer(await request());
    const operation = { clientOperationId: randomUUID() };
    const results = await race([
      () => service.acceptOffer(orgA, assignment, memberA, operation),
      () => service.acceptOffer(orgA, assignment, memberA, operation),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(await db.getRepository(AuditEvent).count()).toBe(1);
    const [round] = await db.query('SELECT offers_accepted_count FROM matching_rounds');
    expect(round.offers_accepted_count).toBe(1);
  });

  it('retains request capacity protection for two different volunteers', async () => {
    const target = await request();
    const first = await offer(target);
    // Share the existing round: there is one round number per request.
    const second = await id(
      `INSERT INTO volunteer_assignments(organization_id,service_request_id,
      volunteer_membership_id,offer_expires_at) VALUES($1,$2,$3,NOW()+interval '1 hour') RETURNING id`,
      [orgA, target, otherMember],
    );
    await expectOneBooking(
      await race(
        [
          () => service.acceptOffer(orgA, first, memberA, {}),
          () => service.acceptOffer(orgA, second, otherMember, {}),
        ],
        'service_requests',
        target,
      ),
    );
    expect(
      await db
        .getRepository(VolunteerAssignment)
        .countBy({ status: VolunteerAssignmentStatus.DECLINED }),
    ).toBe(1);
  });

  it('rejects an overlap with an in-progress assignment', async () => {
    const busy = await offer(await request());
    await db.query("UPDATE volunteer_assignments SET status='IN_PROGRESS' WHERE id=$1", [busy]);
    const next = await offer(await request('2030-01-01T10:30:00Z'));
    await expect(service.acceptOffer(orgA, next, memberA, {})).rejects.toThrow(ConflictException);
    expect(await db.getRepository(AuditEvent).count()).toBe(0);
  });

  it('rejects offers on cancelled requests without changing assignments', async () => {
    const target = await request();
    const assignment = await offer(target);
    await db.query("UPDATE service_requests SET status='CANCELLED' WHERE id=$1", [target]);
    await expect(service.acceptOffer(orgA, assignment, memberA, {})).rejects.toThrow(
      ConflictException,
    );
    expect(
      (await db.getRepository(VolunteerAssignment).findOneByOrFail({ id: assignment })).status,
    ).toBe('OFFERED');
  });

  it('rechecks revoked volunteer authority at the booking boundary', async () => {
    const assignment = await offer(await request());
    await db.query("UPDATE membership_role_grants SET status='REVOKED' WHERE membership_id=$1", [
      memberA,
    ]);
    await expect(service.acceptOffer(orgA, assignment, memberA, {})).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('rechecks account suspension while accepting an offer', async () => {
    const assignment = await offer(await request());
    await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [volunteer]);
    await expect(service.acceptOffer(orgA, assignment, memberA, {})).rejects.toThrow(
      ForbiddenException,
    );
  });

  it.each(['WITHDRAWN', 'COMPLETED', 'CANCELLED'])(
    'does not reserve a volunteer for a %s assignment',
    async (status) => {
      const history = await offer(await request());
      await db.query('UPDATE volunteer_assignments SET status=$1 WHERE id=$2', [status, history]);
      const next = await offer(await request());
      await expect(service.acceptOffer(orgA, next, memberA, {})).resolves.toBeDefined();
    },
  );

  it('commits offer expiry before returning its conflict response', async () => {
    const assignment = await offer(await request());
    await db.query(
      "UPDATE volunteer_assignments SET offer_expires_at=NOW()-interval '1 minute' WHERE id=$1",
      [assignment],
    );
    await expect(service.acceptOffer(orgA, assignment, memberA, {})).rejects.toThrow(
      ConflictException,
    );
    expect(
      (await db.getRepository(VolunteerAssignment).findOneByOrFail({ id: assignment })).status,
    ).toBe('TIMED_OUT');
  });

  it('rolls back booking, request, and audit together after a late failure', async () => {
    const target = await request();
    const assignment = await offer(target);
    const writeAudit = audit.logEvent.bind(audit);
    jest.spyOn(audit, 'logEvent').mockImplementationOnce(async (input, manager) => {
      await writeAudit(input, manager);
      throw new Error('Failure after audit insertion');
    });
    await expect(service.acceptOffer(orgA, assignment, memberA, {})).rejects.toThrow(
      'Failure after audit insertion',
    );
    expect(
      (await db.getRepository(VolunteerAssignment).findOneByOrFail({ id: assignment })).status,
    ).toBe('OFFERED');
    expect((await db.getRepository(ServiceRequest).findOneByOrFail({ id: target })).status).toBe(
      'MATCHING_ACTIVE',
    );
    expect(await db.getRepository(AuditEvent).count()).toBe(0);
    await expect(service.acceptOffer(orgA, assignment, memberA, {})).resolves.toBeDefined();
  });
  const reschedule = (requestId: string, time = '2030-01-02T10:00:00Z', actor = coordinator) =>
    requests.rescheduleRequest(orgA, requestId, actor, undefined, {
      newStartTime: time,
      reason: 'Appointment time changed',
    });

  it('replaces accepted commitments with new confirmation IDs and rejects stale acceptance', async () => {
    const req = await request();
    const old = await offer(req);
    await service.acceptOffer(orgA, old, memberA, { clientOperationId: 'original-accept' });
    const changed = await reschedule(req);
    expect(changed.latestRescheduleId).toBeTruthy();
    const rows = await db
      .getRepository(VolunteerAssignment)
      .find({ where: { serviceRequestId: req, volunteerMembershipId: memberA } });
    expect(rows.find((a) => a.id === old)?.status).toBe('CANCELLED');
    const fresh = rows.find((a) => a.id !== old)!;
    expect(fresh.status).toBe('OFFERED');
    expect(fresh.acceptedAt).toBeNull();
    expect(fresh.rescheduleId).toBe(changed.latestRescheduleId);
    await expect(
      service.acceptOffer(orgA, old, memberA, { clientOperationId: 'original-accept' }),
    ).rejects.toThrow(ConflictException);
    await service.acceptOffer(orgA, fresh.id, memberA, {});
    expect(
      await db
        .getRepository(VolunteerAssignment)
        .count({ where: { serviceRequestId: req, status: VolunteerAssignmentStatus.ACCEPTED } }),
    ).toBe(1);
  });

  it('rechecks availability when confirming the changed time', async () => {
    const req = await request();
    await service.acceptOffer(orgA, await offer(req), memberA, {});
    await reschedule(req);
    const competing = await request('2030-01-02T10:00:00Z');
    await service.acceptOffer(orgA, await offer(competing), memberA, {});
    const pending = await db.getRepository(VolunteerAssignment).findOneByOrFail({
      serviceRequestId: req,
      volunteerMembershipId: memberA,
      status: VolunteerAssignmentStatus.OFFERED,
    });
    await expect(service.acceptOffer(orgA, pending.id, memberA, {})).rejects.toThrow(
      ConflictException,
    );
  });

  it('requires confirmation even when a coordinator dispatches after rescheduling', async () => {
    const req = await request();
    await reschedule(req);
    const dispatched = await service.coordinatorDispatch(
      orgA,
      req,
      { volunteerMembershipId: memberA },
      coordinator,
    );
    expect(dispatched.status).toBe('OFFERED');
    expect(dispatched.rescheduleId).toBeTruthy();
    expect(
      await db
        .getRepository(VolunteerAssignment)
        .count({ where: { serviceRequestId: req, status: VolunteerAssignmentStatus.ACCEPTED } }),
    ).toBe(0);
  });

  it('replaces pending confirmations again and leaves unchanged-time retries alone', async () => {
    const req = await request();
    await service.acceptOffer(orgA, await offer(req), memberA, {});
    await reschedule(req);
    const first = await db.getRepository(VolunteerAssignment).findOneByOrFail({
      serviceRequestId: req,
      volunteerMembershipId: memberA,
      status: VolunteerAssignmentStatus.OFFERED,
    });
    const second = await reschedule(req, '2030-01-03T10:00:00Z');
    expect(
      (await db.getRepository(VolunteerAssignment).findOneByOrFail({ id: first.id })).status,
    ).toBe('CANCELLED');
    await reschedule(req, '2030-01-03T10:00:00Z');
    expect(
      await db.getRepository(RequestRescheduleHistory).count({ where: { serviceRequestId: req } }),
    ).toBe(2);
    expect(
      (await db.getRepository(ServiceRequest).findOneByOrFail({ id: req })).latestRescheduleId,
    ).toBe(second.latestRescheduleId);
    const memberHistory = await service.listMyAssignments(orgA, volunteer);
    const schedules = memberHistory.map((entry) => entry.scheduledStartTime?.toISOString()).sort();
    expect(schedules).toEqual([
      '2030-01-01T10:00:00.000Z',
      '2030-01-02T10:00:00.000Z',
      '2030-01-03T10:00:00.000Z',
    ]);
    expect(
      memberHistory.every(
        (entry) =>
          entry.serviceRequest?.scheduledStartTime.toISOString() === '2030-01-03T10:00:00.000Z',
      ),
    ).toBe(true);
    const staffHistory = await service.getRequestMatching(orgA, req, coordinator);
    expect(
      staffHistory.assignments
        .filter((entry) => entry.volunteerMembershipId === memberA)
        .map((entry) => entry.scheduledStartTime?.toISOString())
        .sort(),
    ).toEqual(schedules);
  });

  it('rolls back history, offers, schedule and audit when rescheduling fails late', async () => {
    const req = await request();
    const old = await offer(req);
    await service.acceptOffer(orgA, old, memberA, {});
    const original = audit.logEvent.bind(audit);
    jest.spyOn(audit, 'logEvent').mockImplementation(async (event, manager) => {
      const result = await original(event, manager);
      if (event.eventType === 'SERVICE_REQUEST_RESCHEDULED')
        throw new Error('late reschedule failure');
      return result;
    });
    await expect(reschedule(req)).rejects.toThrow('late reschedule failure');
    expect(
      (
        await db.getRepository(ServiceRequest).findOneByOrFail({ id: req })
      ).scheduledStartTime.toISOString(),
    ).toBe('2030-01-01T10:00:00.000Z');
    expect((await db.getRepository(VolunteerAssignment).findOneByOrFail({ id: old })).status).toBe(
      'ACCEPTED',
    );
    expect(await db.getRepository(RequestRescheduleHistory).count()).toBe(0);
    expect(
      await db
        .getRepository(AuditEvent)
        .count({ where: { eventType: 'SERVICE_REQUEST_RESCHEDULED' } }),
    ).toBe(0);
  });

  it.each([true, false])(
    'serializes acceptance and rescheduling with reschedule first = %s',
    async (rescheduleFirst) => {
      const req = await request();
      const old = await offer(req);
      const accept = () => service.acceptOffer(orgA, old, memberA, {});
      const change = () => reschedule(req);
      const results = await race(
        rescheduleFirst ? [change, accept] : [accept, change],
        'service_requests',
        req,
        true,
      );
      const changed = results[rescheduleFirst ? 0 : 1]!;
      if (changed.status === 'rejected') throw changed.reason;
      const accepted = results[rescheduleFirst ? 1 : 0]!;
      expect(accepted.status).toBe(rescheduleFirst ? 'rejected' : 'fulfilled');
      expect(
        (await db.getRepository(VolunteerAssignment).findOneByOrFail({ id: old })).status,
      ).toBe('CANCELLED');
      expect(
        await db
          .getRepository(VolunteerAssignment)
          .count({ where: { serviceRequestId: req, status: VolunteerAssignmentStatus.ACCEPTED } }),
      ).toBe(0);
    },
  );

  it('avoids a user foreign-key deadlock when the rescheduler is also the volunteer', async () => {
    await db.query(
      "INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,'COORDINATOR',$2)",
      [memberA, coordinator],
    );
    const req = await request();
    const old = await offer(req);
    const result = await race(
      [
        () => reschedule(req, '2030-01-02T10:00:00Z', volunteer),
        () => service.acceptOffer(orgA, old, memberA, {}),
      ],
      'service_requests',
      req,
    );
    expect(result[0]!.status).toBe('fulfilled');
    expect((await db.getRepository(VolunteerAssignment).findOneByOrFail({ id: old })).status).toBe(
      'CANCELLED',
    );
  });
  it('resets a multi-volunteer team and its round counters until both volunteers reconfirm', async () => {
    const req = await request(undefined, orgA, 2);
    await db.query('UPDATE service_requests SET min_volunteers=2 WHERE id=$1', [req]);
    await service.coordinatorDispatch(orgA, req, { volunteerMembershipId: memberA }, coordinator);
    await service.coordinatorDispatch(
      orgA,
      req,
      { volunteerMembershipId: otherMember },
      coordinator,
    );
    await reschedule(req);
    const pending = await db
      .getRepository(VolunteerAssignment)
      .find({ where: { serviceRequestId: req, status: VolunteerAssignmentStatus.OFFERED } });
    expect(pending).toHaveLength(2);
    const round = await db
      .getRepository(MatchingRound)
      .findOneByOrFail({ id: pending[0]!.matchingRoundId! });
    expect(round.offersAcceptedCount).toBe(0);
    await service.acceptOffer(orgA, pending[0]!.id, pending[0]!.volunteerMembershipId, {});
    expect((await db.getRepository(ServiceRequest).findOneByOrFail({ id: req })).status).toBe(
      'PARTIALLY_ACCEPTED',
    );
    await service.acceptOffer(orgA, pending[1]!.id, pending[1]!.volunteerMembershipId, {});
    expect((await db.getRepository(ServiceRequest).findOneByOrFail({ id: req })).status).toBe(
      'FULLY_MATCHED',
    );
    expect(
      (await db.getRepository(MatchingRound).findOneByOrFail({ id: round.id })).offersAcceptedCount,
    ).toBe(2);
  });

  it('serializes rematching and rescheduling without appending stale offers', async () => {
    const req = await request();
    const stale = await db.getRepository(ServiceRequest).findOneByOrFail({ id: req });
    const result = await race(
      [() => reschedule(req), () => service.findCandidatesAndDispatchOffers(stale)],
      'service_requests',
      req,
    );
    expect(result.every((r) => r.status === 'fulfilled')).toBe(true);
    const current = await db.getRepository(ServiceRequest).findOneByOrFail({ id: req });
    const pending = await db
      .getRepository(VolunteerAssignment)
      .find({ where: { serviceRequestId: req, status: VolunteerAssignmentStatus.OFFERED } });
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((a) => a.rescheduleId === current.latestRescheduleId)).toBe(true);
  });

  it('keeps cancellation final when racing a reschedule', async () => {
    const req = await request();
    await service.acceptOffer(orgA, await offer(req), memberA, {});
    const result = await race(
      [
        () => reschedule(req),
        () =>
          requests.cancelRequest(
            orgA,
            req,
            coordinator,
            {
              userId: coordinator,
              organizationId: orgA,
              membershipId: '',
              membershipStatus: 'APPROVED',
              roles: ['COORDINATOR'],
              isSuperAdmin: false,
            } as any,
            { reasonCode: 'CANCEL', notes: 'Appointment cancelled' },
          ),
      ],
      'service_requests',
      req,
    );
    if (result[1]!.status === 'rejected') throw result[1]!.reason;
    expect((await db.getRepository(ServiceRequest).findOneByOrFail({ id: req })).status).toBe(
      'CANCELLED',
    );
    expect(
      await db
        .getRepository(VolunteerAssignment)
        .count({ where: { serviceRequestId: req, status: VolunteerAssignmentStatus.OFFERED } }),
    ).toBe(0);
    expect(
      await db
        .getRepository(VolunteerAssignment)
        .count({ where: { serviceRequestId: req, status: VolunteerAssignmentStatus.ACCEPTED } }),
    ).toBe(0);
  });

  it('rejects rescheduling to the past without modifying commitments', async () => {
    const req = await request();
    const old = await offer(req);
    await service.acceptOffer(orgA, old, memberA, {});
    await expect(reschedule(req, '2020-01-01T10:00:00Z')).rejects.toThrow('future');
    expect((await db.getRepository(VolunteerAssignment).findOneByOrFail({ id: old })).status).toBe(
      'ACCEPTED',
    );
    expect(await db.getRepository(RequestRescheduleHistory).count()).toBe(0);
  });
  it('serializes withdrawal and rescheduling without reviving an old commitment', async () => {
    const req = await request();
    const old = await offer(req);
    await service.acceptOffer(orgA, old, memberA, {});
    const results = await race(
      [
        () => reschedule(req),
        () => service.withdrawAssignment(orgA, old, memberA, { withdrawalReason: 'Cannot attend' }),
      ],
      'service_requests',
      req,
    );
    if (results[0]!.status === 'rejected') throw results[0]!.reason;
    const withdrawal = results[1]!;
    if (withdrawal.status === 'rejected')
      expect(withdrawal.reason.message).toContain('Can only withdraw');
    expect(
      (
        await db.getRepository(ServiceRequest).findOneByOrFail({ id: req })
      ).scheduledStartTime.toISOString(),
    ).toBe('2030-01-02T10:00:00.000Z');
    expect(
      await db
        .getRepository(VolunteerAssignment)
        .count({ where: { serviceRequestId: req, status: VolunteerAssignmentStatus.ACCEPTED } }),
    ).toBe(0);
    expect(
      (await db.getRepository(VolunteerAssignment).findOneByOrFail({ id: old })).status,
    ).not.toBe('ACCEPTED');
  });
});

import { BeneficiariesService } from '../src/beneficiaries/beneficiaries.service';
import { BeneficiaryEligibility } from '../src/beneficiaries/entities/beneficiary-eligibility.entity';
import { CaregiverAuthorization } from '../src/beneficiaries/entities/caregiver-authorization.entity';
import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { ConflictException, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import httpRequest from 'supertest';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/auth/auth.service';
import { OtpChallenge } from '../src/auth/entities/otp-challenge.entity';
import { AuthenticationSession } from '../src/auth/entities/authentication-session.entity';
import { SmsService } from '../src/auth/sms/sms.service';
import { sha256 } from '../src/auth/utils/phone.util';
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
import { ServiceCompletion1729118400006 } from '../src/database/migrations/1729118400006-ServiceCompletion';
import { TimeCreditLedger1729118400007 } from '../src/database/migrations/1729118400007-TimeCreditLedger';
import { CreditDonations1729118400008 } from '../src/database/migrations/1729118400008-CreditDonations';
import { MembershipApplications1729118400009 } from '../src/database/migrations/1729118400009-MembershipApplications';
import { CreditControls1729118400010 } from '../src/database/migrations/1729118400010-CreditControls';
import { PushNotifications1729118400011 } from '../src/database/migrations/1729118400011-PushNotifications';
import { CreditControlsService } from '../src/time-ledger/credit-controls.service';
import { CreditControlsController } from '../src/time-ledger/credit-controls.controller';
import { AuthGuard } from '../src/auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../src/authorization/guards/organization-access.guard';
import { RolesGuard } from '../src/authorization/guards/roles.guard';
import { MembershipsService } from '../src/memberships/memberships.service';
import { MembershipApproval } from '../src/memberships/entities/membership-approval.entity';
import { MembershipDocument } from '../src/memberships/entities/membership-document.entity';
import { RoleHierarchyService } from '../src/authorization/role-hierarchy.service';
import { DonationsService } from '../src/donations/donations.service';
import { CreditDonation } from '../src/donations/entities/credit-donation.entity';
import { CommunityCreditPool } from '../src/donations/entities/community-credit-pool.entity';
import { TimeLedgerService } from '../src/time-ledger/time-ledger.service';
import { TimeCreditLedgerEntry } from '../src/time-ledger/entities/time-credit-ledger-entry.entity';
import { UniversalTimeWallet } from '../src/identity/entities/universal-time-wallet.entity';
import { UserRole, VolunteerAssignmentStatus } from '@ktb/shared-types';
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
import { NotificationsService } from '../src/notifications/notifications.service';
import { MatchingWorker } from '../src/matching/matching.worker';
import {
  NotificationOutbox,
  NotificationStatus,
} from '../src/notifications/entities/notification-outbox.entity';
import { PushSender } from '../src/notifications/push-sender.service';
import { PushDevice } from '../src/notifications/entities/push-device.entity';
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
      ServiceCompletion1729118400006,
      TimeCreditLedger1729118400007,
      CreditDonations1729118400008,
      MembershipApplications1729118400009,
      CreditControls1729118400010,
      PushNotifications1729118400011,
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
  let authorization: AuthorizationService;
  let ledger: TimeLedgerService;
  let donations: DonationsService;
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
    authorization = new AuthorizationService(
      db.getRepository(User),
      db.getRepository(Organization),
      db.getRepository(OrganizationMembership),
      db.getRepository(MembershipRoleGrant),
      db.getRepository(GlobalAccountRestriction),
    );
    ledger = new TimeLedgerService(
      db.getRepository(UniversalTimeWallet),
      db.getRepository(TimeCreditLedgerEntry),
      audit,
    );
    donations = new DonationsService(
      db.getRepository(CreditDonation),
      db.getRepository(CommunityCreditPool),
      audit,
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
      new NotificationsService(
        db.getRepository(PushDevice),
        db,
        new PushSender(new ConfigService()),
      ),
    );
    requests = new RequestsService(
      db.getRepository(ServiceRequest),
      db.getRepository(RequestCancellation),
      db.getRepository(RequestRescheduleHistory),
      db.getRepository(OrganizationServiceCatalog),
      db.getRepository(OrganizationMembership),
      db.getRepository(Organization),
      db.getRepository(VolunteerAssignment),
      new BeneficiariesService(
        db.getRepository(BeneficiaryEligibility),
        db.getRepository(CaregiverAuthorization),
        db.getRepository(OrganizationMembership),
        db.getRepository(ServiceRequest),
        audit,
        authorization,
        db.getRepository(MembershipDocument),
      ),
      service,
      audit,
      authorization,
      ledger,
    );
  });

  afterAll(async () => {
    if (db.isInitialized) await db.destroy();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await db.query(
      'TRUNCATE otp_challenges, audit_events, users, organizations, service_categories CASCADE',
    );
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

  describe('atomic request creation and retries', () => {
    const create = (key = randomUUID(), hour = 10) =>
      requests.createRequest(orgA, coordinator, {
        creationChannel: 'COORDINATOR_ON_BEHALF',
        beneficiaryMembershipId: beneficiaryA,
        serviceCatalogId: catalogueA,
        urgency: 'SCHEDULED',
        scheduledStartTime: `2030-01-02T${hour}:00:00.000Z`,
        locationAddressText: 'Test community centre',
        locationWardNumber: '1',
        locationPostalCode: '676503',
        idempotencyKey: key,
      } as any);
    beforeEach(async () => {
      await db.query(
        `INSERT INTO beneficiary_eligibilities(organization_id,membership_id,review_due_at,
        approved_by_user_id,monthly_request_quota) VALUES($1,$2,NOW()+interval '1 year',$3,20)`,
        [orgA, beneficiaryA, coordinator],
      );
    });
    it('fits request numbers even when the organization code has its allowed maximum length', async () => {
      await db.query('UPDATE organizations SET code=$2 WHERE id=$1', [orgA, 'A'.repeat(50)]);
      const booking = await create();
      expect(booking.requestNumber.length).toBeLessThanOrEqual(50);
    });
    it('does not collide when Math.random repeats across two bookings', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const first = await create(randomUUID(), 13);
      const second = await create(randomUUID(), 14);
      expect(first.requestNumber).not.toBe(second.requestNumber);
    });
    it('rejects an already-past scheduled request without saving a booking', async () => {
      await expect(
        requests.createRequest(orgA, coordinator, {
          creationChannel: 'COORDINATOR_ON_BEHALF',
          beneficiaryMembershipId: beneficiaryA,
          serviceCatalogId: catalogueA,
          urgency: 'SCHEDULED',
          scheduledStartTime: '2020-01-01T10:00:00.000Z',
          locationAddressText: 'Test community centre',
          locationWardNumber: '1',
          locationPostalCode: '676503',
        } as any),
      ).rejects.toThrow('not in the past');
      expect(await db.getRepository(ServiceRequest).count()).toBe(0);
    });
    it('rolls back a booking when initial matching fails', async () => {
      jest
        .spyOn(service, 'findCandidatesAndDispatchOffers')
        .mockRejectedValueOnce(new Error('matching unavailable'));
      await expect(create()).rejects.toThrow('matching unavailable');
      expect(await db.getRepository(ServiceRequest).count()).toBe(0);
    });
    it('rolls back the booking and matching when creation audit fails', async () => {
      const log = audit.logEvent.bind(audit);
      jest.spyOn(audit, 'logEvent').mockImplementation(async (event, manager) => {
        if (event.eventType === 'SERVICE_REQUEST_CREATED') throw new Error('audit unavailable');
        return log(event, manager);
      });
      await expect(create()).rejects.toThrow('audit unavailable');
      expect(await db.getRepository(ServiceRequest).count()).toBe(0);
      expect(await db.getRepository(MatchingRound).count()).toBe(0);
      expect(await db.getRepository(VolunteerAssignment).count()).toBe(0);
    });
    it('replays concurrent retries as one booking instead of returning database errors', async () => {
      const key = randomUUID();
      const outcomes = await Promise.allSettled(Array.from({ length: 12 }, () => create(key)));
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(12);
      const results = outcomes.map((r) => (r as PromiseFulfilledResult<ServiceRequest>).value);
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(await db.getRepository(ServiceRequest).count()).toBe(1);
    });
    it('serializes the final monthly quota slot across concurrent requests', async () => {
      await db.query('UPDATE beneficiary_eligibilities SET monthly_request_quota=1');
      const results = await Promise.allSettled([
        create(randomUUID(), 11),
        create(randomUUID(), 12),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await db.getRepository(ServiceRequest).count()).toBe(1);
      const rejection = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejection.reason).toBeInstanceOf(ForbiddenException);
    });
  });

  describe('OTP concurrency and expiry', () => {
    const phone = '+919000000001';
    function authentication() {
      const sms = { sendOtp: jest.fn().mockResolvedValue(true) };
      return {
        sms,
        auth: new AuthService(
          db.getRepository(OtpChallenge),
          db.getRepository(AuthenticationSession),
          db.getRepository(User),
          db.getRepository(Organization),
          db.getRepository(OrganizationMembership),
          db,
          new JwtService({ secret: 'disposable-integration-test-secret' }),
          new ConfigService({ NODE_ENV: 'test', AUTH_ALLOW_MOCK_OTP: 'true' }),
          audit,
          sms as unknown as SmsService,
        ),
      };
    }
    async function challenge(code: string, ageSeconds: number, expiresSeconds = 600) {
      return db.getRepository(OtpChallenge).save({
        phoneHash: sha256(phone),
        codeHash: sha256(code),
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: new Date(Date.now() - ageSeconds * 1000),
        expiresAt: new Date(Date.now() + expiresSeconds * 1000),
      });
    }
    it('reuses the verified phone account, wallet and approved memberships', async () => {
      const { auth } = authentication();
      const before = await db.getRepository(User).count();
      const session = await auth.signInVerifiedPhone(phone, {});
      expect(session.user.id).toBe(volunteer);
      expect(await db.getRepository(User).count()).toBe(before);
      const profile = await auth.getMe(volunteer);
      expect(
        profile.memberships.some(
          (m) => m.organizationId === orgA && m.roles.includes(UserRole.VOLUNTEER),
        ),
      ).toBe(true);
      expect(session.isSuperAdmin).toBe(false);
    });
    it('serializes concurrent first-time Firebase phone provisioning into one account and wallet', async () => {
      const { auth } = authentication();
      const freshPhone = '+919000000099';
      const sessions = await Promise.all(
        Array.from({ length: 4 }, () => auth.signInVerifiedPhone(freshPhone, {})),
      );
      expect(new Set(sessions.map((s) => s.user.id)).size).toBe(1);
      expect(await db.getRepository(User).countBy({ phoneE164: freshPhone })).toBe(1);
      expect(
        await db.getRepository(UniversalTimeWallet).countBy({ userId: sessions[0]!.user.id }),
      ).toBe(1);
      expect(sessions.every((s) => s.roles.length === 0 && !s.isSuperAdmin)).toBe(true);
    });
    it('does not let a verified phone bypass a suspended Time Bank account', async () => {
      const { auth } = authentication();
      await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [volunteer]);
      await expect(auth.signInVerifiedPhone(phone, {})).rejects.toThrow('suspended');
      expect(await db.getRepository(AuthenticationSession).count()).toBe(0);
    });

    it('serializes simultaneous issuance before a challenge row exists', async () => {
      const { auth, sms } = authentication();
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () => auth.requestOtp({ phone })),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await db.getRepository(OtpChallenge).count()).toBe(1);
      expect(sms.sendOtp).toHaveBeenCalledTimes(1);
      for (const result of results) {
        if (result.status === 'rejected') expect(result.reason.getStatus()).toBe(429);
      }
    });
    it('allows only one session from simultaneous verification and retains the cooldown', async () => {
      const { auth } = authentication();
      const issued = await auth.requestOtp({ phone });
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () => auth.verifyOtp({ phone, code: issued.devOtp! })),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await db.getRepository(AuthenticationSession).count()).toBe(1);
      const used = await db
        .getRepository(OtpChallenge)
        .findOneByOrFail({ phoneHash: sha256(phone) });
      expect(used.consumedAt).not.toBeNull();
      expect(used.attemptCount).toBe(1);
      await expect(auth.requestOtp({ phone })).rejects.toMatchObject({ status: 429 });
    });
    it('persists every failed attempt without exceeding the shared attempt budget', async () => {
      const { auth } = authentication();
      const issued = await auth.requestOtp({ phone });
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => auth.verifyOtp({ phone, code: '000000' })),
      );
      expect(results.every((r) => r.status === 'rejected')).toBe(true);
      const used = await db
        .getRepository(OtpChallenge)
        .findOneByOrFail({ phoneHash: sha256(phone) });
      expect(used.attemptCount).toBe(3);
      expect(used.consumedAt).toBeNull();
      await expect(auth.verifyOtp({ phone, code: issued.devOtp! })).rejects.toThrow(
        'Maximum verification attempts',
      );
      expect(await db.getRepository(AuthenticationSession).count()).toBe(0);
    });
    it('does not revive an earlier code after the newest challenge was consumed', async () => {
      const { auth } = authentication();
      const older = await challenge('111111', 120);
      await challenge('222222', 0);
      await auth.verifyOtp({ phone, code: '222222' });
      await expect(auth.verifyOtp({ phone, code: '111111' })).rejects.toThrow(
        'No active verification challenge',
      );
      const unchanged = await db.getRepository(OtpChallenge).findOneByOrFail({ id: older.id });
      expect(unchanged.consumedAt).toBeNull();
      expect(unchanged.attemptCount).toBe(0);
      expect(await db.getRepository(AuthenticationSession).count()).toBe(1);
    });
    it('does not fall back to an earlier code when the latest challenge expired', async () => {
      const { auth } = authentication();
      await challenge('111111', 120);
      await challenge('222222', 0, -1);
      await expect(auth.verifyOtp({ phone, code: '111111' })).rejects.toThrow(
        'No active verification challenge',
      );
      expect(await db.getRepository(AuthenticationSession).count()).toBe(0);
    });
  });

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
    if (
      !['users', 'service_requests', 'universal_time_wallets', 'credit_reviews'].includes(lockTable)
    )
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
  describe('automatic matching rounds', () => {
    const worker = () => new MatchingWorker(service, new ConfigService());
    const status = async (requestId: string) =>
      (await db.getRepository(ServiceRequest).findOneByOrFail({ id: requestId })).status;
    const queued = () => db.getRepository(NotificationOutbox).count();
    const start = async () => {
      const requestId = await request();
      const entity = await db.getRepository(ServiceRequest).findOneByOrFail({ id: requestId });
      await service.findCandidatesAndDispatchOffers(entity);
      return requestId;
    };

    it('queues one message per offer and leaves the request alone while offers are open', async () => {
      const requestId = await start();

      expect(await queued()).toBe(2);
      await worker().tick();

      expect(await status(requestId)).toBe('MATCHING_ACTIVE');
      expect(await queued()).toBe(2);
    });

    it('escalates after the rounds run out, without asking the same volunteers again', async () => {
      const requestId = await start();
      await db.query(
        `UPDATE volunteer_assignments SET offer_expires_at = NOW() - interval '1 minute'`,
      );

      await worker().tick();
      await worker().tick();
      await worker().tick();

      expect(await status(requestId)).toBe('ESCALATED_TO_COORDINATOR');
      expect(await queued()).toBe(2);
      expect(await db.getRepository(VolunteerAssignment).count()).toBe(2);
      expect(await service.findRequestsDueForProgression()).toEqual([]);
    });

    it('finds a replacement after a withdrawal', async () => {
      const requestId = await request();
      const taken = await offer(requestId);
      await service.acceptOffer(orgA, taken, memberA, {});
      await service.withdrawAssignment(orgA, taken, memberA, { withdrawalReason: 'Fell ill' });

      expect(await service.findRequestsDueForProgression()).toEqual([
        { id: requestId, organizationId: orgA },
      ]);
      await worker().tick();

      const offers = await db
        .getRepository(VolunteerAssignment)
        .findBy({ serviceRequestId: requestId, status: VolunteerAssignmentStatus.OFFERED });
      expect(offers.map((row) => row.volunteerMembershipId)).toEqual([otherMember]);
    });

    it('does not touch a filled request', async () => {
      const requestId = await request();
      await service.acceptOffer(orgA, await offer(requestId), memberA, {});

      expect(await service.findRequestsDueForProgression()).toEqual([]);
    });

    it('sends nothing for an offer whose transaction rolled back', async () => {
      const requestId = await request();
      const entity = await db.getRepository(ServiceRequest).findOneByOrFail({ id: requestId });
      await expect(
        db.transaction(async (manager) => {
          await service.findCandidatesAndDispatchOffers(entity, undefined, manager);
          throw new Error('Failure after dispatch');
        }),
      ).rejects.toThrow('Failure after dispatch');

      expect(await queued()).toBe(0);
    });

    it('lets two senders share the queue without sending a message twice', async () => {
      await start();
      await db.query(
        'INSERT INTO push_devices(user_id,token,platform) VALUES($1,$2,$3),($4,$5,$6)',
        [volunteer, 'token-1', 'ANDROID', otherVolunteer, 'token-2', 'ANDROID'],
      );
      const send = jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { delivered: 1, staleTokens: [] };
      });
      const sender = { configured: true, send } as unknown as PushSender;
      const notifications = () =>
        new NotificationsService(db.getRepository(PushDevice), db, sender);

      await Promise.all([notifications().deliverDue(), notifications().deliverDue()]);

      expect(send).toHaveBeenCalledTimes(2);
      expect(
        await db.getRepository(NotificationOutbox).countBy({ status: NotificationStatus.SENT }),
      ).toBe(2);
    });
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

  describe('service start, finish and confirmation', () => {
    const scheduled = '2030-01-01T10:00:00Z';
    const at = (iso: string) => new Date(iso);
    const userOf = async (membership: string) =>
      (await db.getRepository(OrganizationMembership).findOneByOrFail({ id: membership })).userId;
    const statusOf = async (req: string) =>
      (await db.getRepository(ServiceRequest).findOneByOrFail({ id: req })).status;

    async function accepted() {
      const req = await request(scheduled);
      const assignment = await offer(req);
      await service.acceptOffer(orgA, assignment, memberA, {});
      return { req, assignment };
    }

    it('runs start, finish and beneficiary confirmation and completes the request', async () => {
      const { req, assignment } = await accepted();
      await expect(
        service.startAssignment(orgA, assignment, memberA, undefined, at('2030-01-01T08:59:00Z')),
      ).rejects.toThrow('60 minutes before');
      await service.startAssignment(
        orgA,
        assignment,
        memberA,
        undefined,
        at('2030-01-01T09:50:00Z'),
      );
      expect(await statusOf(req)).toBe('IN_PROGRESS');

      const beneficiary = await userOf(beneficiaryA);
      const context = await authorization.evaluateOrganizationAccess(beneficiary, orgA);
      await expect(
        requests.confirmCompletion(orgA, req, assignment, beneficiary, context, {}),
      ).rejects.toThrow('has not finished');
      // 70 minutes elapsed; the expected 60 does not cap time actually given.
      const finished = await service.finishAssignment(
        orgA,
        assignment,
        memberA,
        { notes: ' Shopping done ' },
        undefined,
        at('2030-01-01T11:00:00Z'),
      );
      expect(finished.reportedMinutes).toBe(70);
      expect(finished.completionNotes).toBe('Shopping done');
      expect(await statusOf(req)).toBe('IN_PROGRESS');

      await expect(
        requests.confirmCompletion(orgA, req, assignment, beneficiary, context, { minutes: 71 }),
      ).rejects.toThrow('At most the 70');
      const confirmed = await requests.confirmCompletion(
        orgA,
        req,
        assignment,
        beneficiary,
        context,
        { minutes: 65 },
      );
      expect(confirmed.confirmedMinutes).toBe(65);
      expect(confirmed.confirmedByUserId).toBe(beneficiary);
      expect(await statusOf(req)).toBe('COMPLETED');
      await expect(
        requests.confirmCompletion(orgA, req, assignment, beneficiary, context, {}),
      ).rejects.toThrow('already been confirmed');
      const events = await db.query(
        "SELECT event_type FROM audit_events WHERE target_id=$1 AND event_type LIKE 'SERVICE_%' ORDER BY created_at",
        [assignment],
      );
      expect(events.map((e: { event_type: string }) => e.event_type)).toEqual([
        'SERVICE_STARTED',
        'SERVICE_FINISHED',
        'SERVICE_CONFIRMED',
      ]);
    });

    it('limits reported minutes and only lets the assigned volunteer finish', async () => {
      const { assignment } = await accepted();
      await expect(
        service.finishAssignment(orgA, assignment, memberA, {}, undefined, at(scheduled)),
      ).rejects.toThrow('Only a started assignment');
      await service.startAssignment(orgA, assignment, memberA, undefined, at(scheduled));
      await expect(
        service.finishAssignment(orgA, assignment, otherMember, {}, undefined, at(scheduled)),
      ).rejects.toThrow('not found');
      // Ten minutes in, a late Start still allows the expected hour, but no more.
      const later = at('2030-01-01T10:10:00Z');
      await expect(
        service.finishAssignment(orgA, assignment, memberA, { minutes: 61 }, undefined, later),
      ).rejects.toThrow('At most 60 minutes');
      const done = await service.finishAssignment(
        orgA,
        assignment,
        memberA,
        { minutes: 60 },
        undefined,
        later,
      );
      expect(done.reportedMinutes).toBe(60);
      expect(done.status).toBe('COMPLETED');
    });

    it('honors separate caregiver verification permission through request details and payment', async () => {
      const { req, assignment } = await accepted();
      await service.startAssignment(orgA, assignment, memberA, undefined, at(scheduled));
      await service.finishAssignment(
        orgA,
        assignment,
        memberA,
        { minutes: 30 },
        undefined,
        at(scheduled),
      );
      await db.query(
        "INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,'CAREGIVER',$2)",
        [otherMember, coordinator],
      );
      const authId = await id(
        "INSERT INTO caregiver_authorizations(organization_id,beneficiary_membership_id,caregiver_membership_id,status,can_initiate_requests,can_verify_completions,approved_by_user_id) VALUES($1,$2,$3,'APPROVED',true,false,$4) RETURNING id",
        [orgA, beneficiaryA, otherMember, coordinator],
      );
      const verifier = new BeneficiariesService(
        db.getRepository(BeneficiaryEligibility),
        db.getRepository(CaregiverAuthorization),
        db.getRepository(OrganizationMembership),
        db.getRepository(ServiceRequest),
        audit,
        authorization,
        db.getRepository(MembershipDocument),
      );
      const previous = (requests as any).beneficiariesService;
      (requests as any).beneficiariesService = verifier;
      try {
        const context = await authorization.evaluateOrganizationAccess(otherVolunteer, orgA);
        await expect(
          requests.confirmCompletion(orgA, req, assignment, otherVolunteer, context, {}),
        ).rejects.toThrow(ForbiddenException);
        expect(
          (
            await db.query('SELECT confirmed_at FROM volunteer_assignments WHERE id=$1', [
              assignment,
            ])
          )[0].confirmed_at,
        ).toBeNull();
        await db.query(
          'UPDATE caregiver_authorizations SET can_initiate_requests=false, can_verify_completions=true WHERE id=$1',
          [authId],
        );
        await expect(
          verifier.verifyCaregiverProxyAccess(orgA, otherMember, beneficiaryA),
        ).rejects.toThrow(ForbiddenException);
        expect((await requests.getRequestById(orgA, req, otherVolunteer, context)).id).toBe(req);
        const confirmed = await requests.confirmCompletion(
          orgA,
          req,
          assignment,
          otherVolunteer,
          context,
          {},
        );
        expect(confirmed.confirmedMinutes).toBe(30);
        expect(confirmed.creditsEarned).toBe(0.5);
      } finally {
        (requests as any).beneficiariesService = previous;
      }
    });

    it('never lets the volunteer confirm, even when they are also a coordinator', async () => {
      const { req, assignment } = await accepted();
      await service.startAssignment(orgA, assignment, memberA, undefined, at(scheduled));
      await service.finishAssignment(orgA, assignment, memberA, {}, undefined, at(scheduled));
      await db.query(
        "INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,'COORDINATOR',$2)",
        [memberA, coordinator],
      );
      const own = await authorization.evaluateOrganizationAccess(volunteer, orgA);
      await expect(
        requests.confirmCompletion(orgA, req, assignment, volunteer, own, {}),
      ).rejects.toThrow('cannot confirm their own service');
      const stranger = await authorization.evaluateOrganizationAccess(otherVolunteer, orgA);
      (requests as any).beneficiariesService = {
        verifyCaregiverProxyAccess: () => Promise.reject(new Error('no authorization')),
      };
      await expect(
        requests.confirmCompletion(orgA, req, assignment, otherVolunteer, stranger, {}),
      ).rejects.toThrow('permission to confirm');
      const staff = await authorization.evaluateOrganizationAccess(coordinator, orgA);
      const confirmed = await requests.confirmCompletion(
        orgA,
        req,
        assignment,
        coordinator,
        staff,
        {},
      );
      expect(confirmed.confirmedMinutes).toBe(1);
    });

    it('keeps a team request open until every finished helper is confirmed', async () => {
      const req = await request(scheduled, orgA, 2);
      await db.query('UPDATE service_requests SET min_volunteers=2 WHERE id=$1', [req]);
      for (const member of [memberA, otherMember]) {
        await service.coordinatorDispatch(
          orgA,
          req,
          { volunteerMembershipId: member },
          coordinator,
        );
      }
      const team = await db
        .getRepository(VolunteerAssignment)
        .find({ where: { serviceRequestId: req } });
      const first = team.find((a) => a.volunteerMembershipId === memberA)!.id;
      const second = team.find((a) => a.volunteerMembershipId === otherMember)!.id;
      expect(team.map((a) => a.status)).toEqual(['ACCEPTED', 'ACCEPTED']);
      for (const [assignment, member] of [
        [first, memberA],
        [second, otherMember],
      ] as const) {
        await service.startAssignment(orgA, assignment, member, undefined, at(scheduled));
        await service.finishAssignment(orgA, assignment, member, {}, undefined, at(scheduled));
      }
      const staff = await authorization.evaluateOrganizationAccess(coordinator, orgA);
      await requests.confirmCompletion(orgA, req, first, coordinator, staff, {});
      expect(await statusOf(req)).toBe('IN_PROGRESS');
      await requests.confirmCompletion(orgA, req, second, coordinator, staff, {});
      expect(await statusOf(req)).toBe('COMPLETED');
    });

    it('blocks withdrawing and cancelling once the service has started', async () => {
      const { req, assignment } = await accepted();
      await service.startAssignment(orgA, assignment, memberA, undefined, at(scheduled));
      await expect(
        service.withdrawAssignment(orgA, assignment, memberA, { withdrawalReason: 'Too late' }),
      ).rejects.toThrow('ACCEPTED status');
      const staff = await authorization.evaluateOrganizationAccess(coordinator, orgA);
      await expect(
        requests.cancelRequest(orgA, req, coordinator, staff, {
          cancellationReason: 'OTHER',
        } as any),
      ).rejects.toThrow('IN_PROGRESS');
    });
  });

  describe('time credits paid on confirmation', () => {
    const scheduled = '2030-01-01T10:00:00Z';
    const at = (iso: string) => new Date(iso);
    const wallet = async () =>
      (
        await db.query(
          'SELECT balance_credits::float AS balance, frozen_credits::float AS frozen FROM universal_time_wallets WHERE user_id=$1',
          [volunteer],
        )
      )[0];

    // Accepted, started at the scheduled time and finished after `elapsed` minutes.
    async function finished(elapsed: number, minutes?: number) {
      const req = await request(scheduled);
      const assignment = await offer(req);
      await service.acceptOffer(orgA, assignment, memberA, {});
      await service.startAssignment(orgA, assignment, memberA, undefined, at(scheduled));
      const end = new Date(at(scheduled).getTime() + elapsed * 60_000);
      await service.finishAssignment(
        orgA,
        assignment,
        memberA,
        minutes ? { minutes } : {},
        undefined,
        end,
      );
      return { req, assignment };
    }

    async function confirm(req: string, assignment: string) {
      const staff = await authorization.evaluateOrganizationAccess(coordinator, orgA);
      return requests.confirmCompletion(orgA, req, assignment, coordinator, staff, {});
    }

    it('pays the volunteer once, by the service rate, and records the origin community', async () => {
      await db.query('UPDATE global_service_definitions SET credit_multiplier=1.5');
      const { req, assignment } = await finished(90);
      expect(await wallet()).toBeUndefined();

      const confirmed = await confirm(req, assignment);
      expect(confirmed.creditsEarned).toBe(2.25);
      expect(confirmed.creditsHeld).toBe(false);
      expect(await wallet()).toEqual({ balance: 2.25, frozen: 0 });
      await expect(confirm(req, assignment)).rejects.toThrow('already been confirmed');
      expect(await wallet()).toEqual({ balance: 2.25, frozen: 0 });

      const history = await ledger.listMyTransactions(volunteer);
      expect(history.balanceCredits).toBe(2.25);
      expect(history.total).toBe(1);
      expect(history.data[0]).toMatchObject({
        amount: 2.25,
        balanceAfter: 2.25,
        held: false,
        txType: 'SERVICE_EARNED',
        minutes: 90,
        organization: { id: orgA },
        serviceRequest: { id: req, serviceName: 'Test' },
      });
      expect((await ledger.listMyTransactions(coordinator)).data).toEqual([]);

      const events = await db.query(
        "SELECT event_type FROM audit_events WHERE event_type LIKE 'TIME_CREDITS_%'",
      );
      expect(events).toEqual([{ event_type: 'TIME_CREDITS_EARNED' }]);
    });

    it('keeps the ledger append-only and each assignment paid at most once', async () => {
      const { req, assignment } = await finished(60);
      await confirm(req, assignment);
      await expect(db.query('UPDATE time_credit_ledger SET amount=5')).rejects.toThrow(
        'append-only',
      );
      await expect(db.query('DELETE FROM time_credit_ledger')).rejects.toThrow('append-only');
      await expect(
        db.query(
          "INSERT INTO time_credit_ledger(wallet_id,amount,balance_after,tx_type,originating_org_id,service_request_id,volunteer_assignment_id,minutes) SELECT wallet_id,1,2,'SERVICE_EARNED',originating_org_id,service_request_id,volunteer_assignment_id,60 FROM time_credit_ledger",
        ),
      ).rejects.toThrow('uq_ledger_assignment_payment');
      expect(await wallet()).toEqual({ balance: 1, frozen: 0 });
    });

    it('counts whole hours only when the service does not allow partial hours', async () => {
      await db.query('UPDATE global_service_definitions SET allow_partial_hours=false');
      const first = await finished(90);
      expect((await confirm(first.req, first.assignment)).creditsEarned).toBe(1);
      const short = await finished(60, 50);
      expect((await confirm(short.req, short.assignment)).creditsEarned).toBe(0);
      expect(await wallet()).toEqual({ balance: 1, frozen: 0 });
      expect((await ledger.listMyTransactions(volunteer)).total).toBe(1);
    });

    it('holds credits for a frozen wallet without touching the spendable balance', async () => {
      await db.query(
        "INSERT INTO universal_time_wallets(user_id,balance_credits,status) VALUES($1,3,'FROZEN')",
        [volunteer],
      );
      const { req, assignment } = await finished(60);
      const confirmed = await confirm(req, assignment);
      expect(confirmed.creditsHeld).toBe(true);
      expect(await wallet()).toEqual({ balance: 3, frozen: 1 });
      const history = await ledger.listMyTransactions(volunteer);
      expect(history.status).toBe('FROZEN');
      expect(history.data[0]).toMatchObject({ amount: 1, balanceAfter: 3, held: true });
      const events = await db.query(
        "SELECT event_type FROM audit_events WHERE event_type LIKE 'TIME_CREDITS_%'",
      );
      expect(events).toEqual([{ event_type: 'TIME_CREDITS_HELD' }]);
    });
  });

  describe('time credit donations', () => {
    let key = 0;
    const gift = (amount: number, extra: Record<string, unknown> = {}) =>
      ({ amount, idempotencyKey: `gift-key-${++key}`, ...extra }) as any;
    const toMember = (amount: number, extra: Record<string, unknown> = {}) =>
      gift(amount, {
        recipientOrganizationId: orgA,
        recipientMembershipNumber: 'KTB-OTHER',
        ...extra,
      });
    const balance = async (user: string) =>
      (
        await db.query(
          'SELECT balance_credits::float AS balance FROM universal_time_wallets WHERE user_id=$1',
          [user],
        )
      )[0]?.balance;
    const walletOf = async (user: string) =>
      (await db.query('SELECT id FROM universal_time_wallets WHERE user_id=$1', [user]))[0].id;
    const fund = (user: string, credits: number) =>
      db.query(
        `INSERT INTO universal_time_wallets(user_id,balance_credits) VALUES($1,$2)
         ON CONFLICT (user_id) DO UPDATE SET balance_credits=EXCLUDED.balance_credits`,
        [user, credits],
      );
    const verify = (user: string) =>
      db.query(
        "INSERT INTO verified_identities(user_id,verification_status) VALUES($1,'VERIFIED')",
        [user],
      );
    let pool: string;

    beforeEach(async () => {
      await db.query(
        "UPDATE organization_memberships SET membership_number='KTB-OTHER' WHERE id=$1",
        [otherMember],
      );
      await db.query(
        "UPDATE organization_memberships SET membership_number='KTB-VOL' WHERE id=$1",
        [memberA],
      );
      await verify(otherVolunteer);
      await verify(volunteer);
      await fund(volunteer, 3);
      pool = await id(
        "INSERT INTO community_credit_pools(organization_id,name) VALUES($1,'Elder care pool') RETURNING id",
        [orgB],
      );
    });

    it('moves credits to a verified member in two balanced ledger rows, once per key', async () => {
      const dto = toMember(1.25, { note: 'For the ward' });
      const sent = await donations.donate(orgA, volunteer, dto);
      expect(sent).toMatchObject({
        amount: 1.25,
        balanceCredits: 1.75,
        replayed: false,
        recipient: { type: 'MEMBER', membershipNumber: 'KTB-OTHER' },
      });
      expect(await balance(volunteer)).toBe(1.75);
      expect(await balance(otherVolunteer)).toBe(1.25);
      const legs = await db.query(
        'SELECT tx_type, amount::float AS amount, originating_org_id FROM time_credit_ledger WHERE donation_id=$1 ORDER BY amount',
        [sent.id],
      );
      expect(legs).toEqual([
        { tx_type: 'DONATION_SENT', amount: -1.25, originating_org_id: orgA },
        { tx_type: 'DONATION_RECEIVED', amount: 1.25, originating_org_id: orgA },
      ]);

      // The same key is a replay, not a second gift; a different gift with it is refused.
      const again = await donations.donate(orgA, volunteer, dto);
      expect(again).toMatchObject({ id: sent.id, replayed: true });
      expect(await balance(volunteer)).toBe(1.75);
      await expect(donations.donate(orgA, volunteer, { ...dto, amount: 1 })).rejects.toThrow(
        'already used for a different gift',
      );

      const mine = await ledger.listMyTransactions(volunteer);
      expect(mine.data[0]).toMatchObject({
        amount: -1.25,
        txType: 'DONATION_SENT',
        donation: {
          note: 'For the ward',
          recipient: { type: 'MEMBER', membershipNumber: 'KTB-OTHER' },
        },
      });
      const theirs = await ledger.listMyTransactions(otherVolunteer);
      expect(theirs.data[0]).toMatchObject({
        amount: 1.25,
        txType: 'DONATION_RECEIVED',
        organization: { id: orgA },
        donation: { note: 'For the ward', recipient: null },
      });
      expect(JSON.stringify(theirs)).not.toContain('KTB-VOL');
      const events = await db.query(
        "SELECT actor_id FROM audit_events WHERE event_type='CREDITS_DONATED'",
      );
      expect(events).toEqual([{ actor_id: volunteer }]);
    });

    it('gives across organizations into an approved community pool', async () => {
      const sent = await donations.donate(orgA, volunteer, gift(2, { poolId: pool }));
      expect(sent.recipient).toMatchObject({ type: 'POOL', id: pool, name: 'Elder care pool' });
      const [row] = await db.query(
        'SELECT balance_credits::float AS balance FROM community_credit_pools WHERE id=$1',
        [pool],
      );
      expect(row.balance).toBe(2);
      const [leg] = await db.query(
        "SELECT pool_id, wallet_id, balance_after::float AS after FROM time_credit_ledger WHERE donation_id=$1 AND tx_type='DONATION_RECEIVED'",
        [sent.id],
      );
      expect(leg).toEqual({ pool_id: pool, wallet_id: null, after: 2 });
      const listed = await donations.listPools();
      expect(listed.data).toEqual([
        expect.objectContaining({
          id: pool,
          balanceCredits: 2,
          organization: { id: orgB, name: expect.any(String) },
        }),
      ]);

      await db.query("UPDATE community_credit_pools SET status='CLOSED' WHERE id=$1", [pool]);
      await expect(donations.donate(orgA, volunteer, gift(1, { poolId: pool }))).rejects.toThrow(
        'not accepting credits',
      );
      expect((await donations.listPools()).data).toEqual([]);
    });

    it('refuses unverified, unknown and self recipients, overspending and frozen wallets', async () => {
      await db.query('DELETE FROM verified_identities WHERE user_id=$1', [otherVolunteer]);
      await expect(donations.donate(orgA, volunteer, toMember(1))).rejects.toThrow(
        'No verified member',
      );
      await verify(otherVolunteer);
      await expect(
        donations.donate(orgA, volunteer, toMember(1, { recipientMembershipNumber: 'KTB-NONE' })),
      ).rejects.toThrow('No verified member');
      await expect(
        donations.donate(orgA, volunteer, toMember(1, { recipientMembershipNumber: 'KTB-VOL' })),
      ).rejects.toThrow('cannot give credits to yourself');
      await expect(
        donations.donate(orgA, volunteer, toMember(1, { poolId: pool })),
      ).rejects.toThrow('Choose one recipient');
      await expect(donations.donate(orgA, volunteer, toMember(3.01))).rejects.toThrow(
        'You have 3 credits',
      );
      await expect(donations.donate(orgA, coordinator, toMember(1))).rejects.toThrow(
        'You have 0 credits',
      );

      await fund(otherVolunteer, 0);
      await db.query("UPDATE universal_time_wallets SET status='FROZEN' WHERE user_id=$1", [
        otherVolunteer,
      ]);
      await expect(donations.donate(orgA, volunteer, toMember(1))).rejects.toThrow(
        'cannot receive credits right now',
      );
      await db.query("UPDATE universal_time_wallets SET status='FROZEN' WHERE user_id=$1", [
        volunteer,
      ]);
      await expect(donations.donate(orgA, volunteer, gift(1, { poolId: pool }))).rejects.toThrow(
        'wallet is frozen',
      );
      expect(await balance(volunteer)).toBe(3);
      expect(await db.query('SELECT id FROM credit_donations')).toEqual([]);
    });

    it('lets only one of two simultaneous gifts spend the same credits', async () => {
      await fund(volunteer, 1);
      const results = await race(
        [
          () => donations.donate(orgA, volunteer, toMember(0.75)),
          () => donations.donate(orgA, volunteer, gift(0.75, { poolId: pool })),
        ],
        'universal_time_wallets',
        await walletOf(volunteer),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failure = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(failure.reason.message).toContain('You have 0.25 credits');
      expect(await balance(volunteer)).toBe(0.25);
      const [{ total }] = await db.query(
        'SELECT sum(amount)::float AS total FROM time_credit_ledger WHERE donation_id IS NOT NULL',
      );
      expect(total).toBe(0);
    });

    it('does not deadlock when two members give to each other at once', async () => {
      await fund(otherVolunteer, 2);
      const first = [await walletOf(volunteer), await walletOf(otherVolunteer)].sort()[0];
      const results = await race(
        [
          () => donations.donate(orgA, volunteer, toMember(1)),
          () =>
            donations.donate(
              orgA,
              otherVolunteer,
              gift(0.5, { recipientOrganizationId: orgA, recipientMembershipNumber: 'KTB-VOL' }),
            ),
        ],
        'universal_time_wallets',
        first,
      );
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(await balance(volunteer)).toBe(2.5);
      expect(await balance(otherVolunteer)).toBe(2.5);
    });
  });

  describe('credit spending and reviewed corrections', () => {
    let controls: CreditControlsService;
    let admin: string;
    let source: string;
    let wallet: string;
    let completedRequest: string;
    const amount = (credits = 0.5) => ({
      amount: credits,
      idempotencyKey: randomUUID(),
      reason: 'Verified assistance funding',
    });
    const resolution = (decision: 'RELEASE' | 'CORRECT' = 'RELEASE') => ({
      decision,
      resolution: 'Evidence reviewed and decision authorized',
    });
    const open = (credits = 0.5) =>
      controls.openReview(orgA, coordinator, { ...amount(credits), sourceEntryId: source });
    const balances = async () =>
      (
        await db.query(
          'SELECT balance_credits::float AS balance, frozen_credits::float AS frozen FROM universal_time_wallets WHERE id=$1',
          [wallet],
        )
      )[0];

    beforeEach(async () => {
      controls = new CreditControlsService(db, audit);
      admin = await id("INSERT INTO users(phone_e164) VALUES('+919000000088') RETURNING id");
      const membership = await id(
        "INSERT INTO organization_memberships(organization_id,user_id,status) VALUES($1,$2,'APPROVED') RETURNING id",
        [orgA, admin],
      );
      await db.query(
        "INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,'MUNICIPALITY_ADMIN',$2)",
        [membership, coordinator],
      );
      completedRequest = await request();
      const assignment = await offer(completedRequest);
      const entry = await db.transaction((m) =>
        ledger.postServiceEarning(m, {
          volunteerUserId: volunteer,
          organizationId: orgA,
          serviceRequestId: completedRequest,
          volunteerAssignmentId: assignment,
          minutes: 60,
          policy: { baseCreditRateHourly: 1, creditMultiplier: 1, allowPartialHours: true },
        }),
      );
      source = entry!.id;
      wallet = entry!.walletId!;
      await db.query("UPDATE service_requests SET status='COMPLETED' WHERE id=$1", [
        completedRequest,
      ]);
    });

    it('preserves free assistance without any debit, and funds only by explicit member consent', async () => {
      expect(await db.query('SELECT id FROM credit_operations')).toHaveLength(0);
      expect(await balances()).toEqual({ balance: 1, frozen: 0 });
      // The creator can voluntarily fund the service using only their own credits.
      await db.query('UPDATE service_requests SET created_by_user_id=$2 WHERE id=$1', [
        completedRequest,
        volunteer,
      ]);
      const dto = amount();
      const result = await controls.spend(orgA, volunteer, completedRequest, dto);
      expect(result).toMatchObject({ kind: 'ASSISTANCE_SPENT', replayed: false });
      expect(await balances()).toEqual({ balance: 0.5, frozen: 0 });
      expect((await controls.spend(orgA, volunteer, completedRequest, dto)).replayed).toBe(true);
      await expect(
        controls.spend(orgA, volunteer, completedRequest, { ...dto, amount: 0.2 }),
      ).rejects.toThrow('different operation');
      await expect(controls.spend(orgA, volunteer, completedRequest, amount())).rejects.toThrow(
        'already been funded',
      );
      const history = await ledger.listMyTransactions(volunteer);
      expect(history.data[0]).toMatchObject({
        txType: 'ASSISTANCE_SPENT',
        amount: -0.5,
        operationId: result.id,
      });
      await expect(
        db.query('UPDATE credit_operations SET amount=1 WHERE id=$1', [result.id]),
      ).rejects.toThrow('append-only');
    });

    it('requires completed service, verified funding limits, request privacy and current pool authority', async () => {
      await expect(controls.spend(orgA, volunteer, completedRequest, amount())).rejects.toThrow(
        'recipient or request creator',
      );
      await db.query('UPDATE service_requests SET created_by_user_id=$2 WHERE id=$1', [
        completedRequest,
        volunteer,
      ]);
      await expect(controls.spend(orgA, volunteer, completedRequest, amount(1.01))).rejects.toThrow(
        'exceeds verified',
      );
      await expect(controls.spend(orgB, volunteer, completedRequest, amount())).rejects.toThrow(
        'not found',
      );
      await db.query("UPDATE service_requests SET status='IN_PROGRESS' WHERE id=$1", [
        completedRequest,
      ]);
      await expect(controls.spend(orgA, volunteer, completedRequest, amount())).rejects.toThrow(
        'completed assistance',
      );
      const pool = await donations.createPool(orgA, admin, { name: 'Assistance fund' });
      await expect(
        controls.spend(orgA, coordinator, completedRequest, { ...amount(), poolId: pool.id }),
      ).rejects.toThrow('authority');
      expect(await balances()).toEqual({ balance: 1, frozen: 0 });
    });

    it('spends donated pool credits once and never pays the volunteer twice', async () => {
      const pool = await donations.createPool(orgA, admin, { name: 'Assistance fund' });
      await donations.donate(orgA, volunteer, {
        amount: 1,
        poolId: pool.id,
        idempotencyKey: randomUUID(),
      });
      const dto = { ...amount(0.75), poolId: pool.id };
      await controls.spend(orgA, admin, completedRequest, dto);
      expect((await controls.spend(orgA, admin, completedRequest, dto)).replayed).toBe(true);
      expect(
        (await db.getRepository(CommunityCreditPool).findOneByOrFail({ id: pool.id }))
          .balanceCredits,
      ).toBe(0.25);
      expect(
        await db.query("SELECT id FROM time_credit_ledger WHERE tx_type='SERVICE_EARNED'"),
      ).toHaveLength(1);
      const [{ total }] = await db.query(
        "SELECT sum(amount)::float AS total FROM time_credit_ledger WHERE tx_type='ASSISTANCE_SPENT'",
      );
      expect(total).toBe(-0.75);
    });

    it('rejects another organization’s pool and inactive pools without spending', async () => {
      const pool = await donations.createPool(orgB, admin, { name: 'Other fund' });
      await expect(
        controls.spend(orgA, admin, completedRequest, { ...amount(), poolId: pool.id }),
      ).rejects.toThrow('Pool not found');
      const own = await donations.createPool(orgA, admin, { name: 'Closed fund' });
      await db.query("UPDATE community_credit_pools SET status='CLOSED' WHERE id=$1", [own.id]);
      await expect(
        controls.spend(orgA, admin, completedRequest, { ...amount(), poolId: own.id }),
      ).rejects.toThrow('frozen or closed');
    });

    it('holds disputed credits, requires investigation and independently releases them', async () => {
      const dto = { ...amount(), sourceEntryId: source };
      const review = await controls.openReview(orgA, coordinator, dto);
      expect((await controls.openReview(orgA, coordinator, dto)).replayed).toBe(true);
      expect(await balances()).toEqual({ balance: 0.5, frozen: 0.5 });
      await expect(
        db.query(
          `INSERT INTO time_credit_ledger(wallet_id,amount,balance_after,held,tx_type,originating_org_id,review_id,frozen_delta)
         VALUES($1,0.1,0.6,false,'FRAUD_RELEASED',$2,$3,0)`,
          [wallet, orgA, review.id],
        ),
      ).rejects.toThrow('chk_ledger_control_movement');
      await expect(controls.resolve(orgA, admin, review.id, resolution())).rejects.toThrow(
        'investigate first',
      );
      await expect(
        controls.investigate(orgA, admin, review.id, {
          investigation: 'Reviewed source documents',
        }),
      ).rejects.toThrow('authority');
      await controls.investigate(orgA, coordinator, review.id, {
        investigation: 'Reviewed source documents',
      });
      await expect(controls.resolve(orgA, coordinator, review.id, resolution())).rejects.toThrow(
        'authority',
      );
      await controls.resolve(orgA, admin, review.id, resolution());
      expect((await controls.resolve(orgA, admin, review.id, resolution())).replayed).toBe(true);
      expect(await balances()).toEqual({ balance: 1, frozen: 0 });
      expect((await controls.listReviews(orgA, coordinator)).data).toHaveLength(1);
      await expect(controls.listReviews(orgA, volunteer)).rejects.toThrow('authority');
      const original = await db
        .getRepository(TimeCreditLedgerEntry)
        .findOneByOrFail({ id: source });
      expect(original.amount).toBe(1);
    });

    it('corrects held credits with a compensating entry and preserves the immutable original', async () => {
      const review = await open();
      await controls.investigate(orgA, coordinator, review.id, {
        investigation: 'Evidence confirms fraudulent minutes',
      });
      await controls.resolve(orgA, admin, review.id, resolution('CORRECT'));
      expect(await balances()).toEqual({ balance: 0.5, frozen: 0 });
      await expect(controls.resolve(orgA, admin, review.id, resolution())).rejects.toThrow(
        'already resolved',
      );
      const [row] = await db.query(
        "SELECT amount::float, frozen_delta::float, held FROM time_credit_ledger WHERE tx_type='CREDIT_CORRECTED'",
      );
      expect(row).toEqual({ amount: -0.5, frozen_delta: -0.5, held: true });
      await expect(
        db.query('UPDATE time_credit_ledger SET amount=2 WHERE id=$1', [source]),
      ).rejects.toThrow('append-only');
      await expect(open(0.75)).rejects.toThrow('undisputed source');
    });

    it('denies wrong-tenant cases, over-holds, own-credit reviews and self-authorization', async () => {
      await expect(
        controls.openReview(orgB, coordinator, { ...amount(), sourceEntryId: source }),
      ).rejects.toThrow('authority');
      await expect(open(1.01)).rejects.toThrow('undisputed source');
      await expect(open(-1)).rejects.toThrow('hundredths');
      await db.query(
        "INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,'COORDINATOR',$2)",
        [memberA, coordinator],
      );
      await expect(
        controls.openReview(orgA, volunteer, { ...amount(), sourceEntryId: source }),
      ).rejects.toThrow('own credits');
      const review = await open();
      await controls.investigate(orgA, coordinator, review.id, {
        investigation: 'Reviewed all source documents',
      });
      const coordMembership = (
        await db.query(
          'SELECT id FROM organization_memberships WHERE user_id=$1 AND organization_id=$2',
          [coordinator, orgA],
        )
      )[0].id;
      await db.query(
        "INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,'MUNICIPALITY_ADMIN',$2)",
        [coordMembership, admin],
      );
      await expect(controls.resolve(orgA, coordinator, review.id, resolution())).rejects.toThrow(
        'different administrator',
      );
      await expect(controls.resolve(orgB, admin, review.id, resolution())).rejects.toThrow(
        'authority',
      );
    });

    it('does not release a fraud hold while the owner is suspended', async () => {
      const review = await open();
      await controls.investigate(orgA, coordinator, review.id, {
        investigation: 'Reviewed all source documents',
      });
      await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [volunteer]);
      await expect(controls.resolve(orgA, admin, review.id, resolution())).rejects.toThrow(
        'restricted',
      );
      expect(await balances()).toEqual({ balance: 0.5, frozen: 0.5 });
      await db.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [volunteer]);
      await controls.resolve(orgA, admin, review.id, resolution());
      expect(await balances()).toEqual({ balance: 1, frozen: 0 });
    });

    it('releases only reinstated, locally earned frozen credits and preserves fraud holds', async () => {
      await open(0.25);
      await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [volunteer]);
      const req = await request();
      const assignment = await offer(req);
      await db.transaction((m) =>
        ledger.postServiceEarning(m, {
          volunteerUserId: volunteer,
          organizationId: orgA,
          serviceRequestId: req,
          volunteerAssignmentId: assignment,
          minutes: 60,
          policy: { baseCreditRateHourly: 1, creditMultiplier: 1, allowPartialHours: true },
        }),
      );
      expect(await balances()).toEqual({ balance: 0.75, frozen: 1.25 });
      const dto = amount(1);
      await expect(controls.releaseFrozen(orgA, admin, volunteer, dto)).rejects.toThrow(
        'restricted',
      );
      await db.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [volunteer]);
      await controls.releaseFrozen(orgA, admin, volunteer, dto);
      expect((await controls.releaseFrozen(orgA, admin, volunteer, dto)).replayed).toBe(true);
      expect(await balances()).toEqual({ balance: 1.75, frozen: 0.25 });
      await expect(controls.releaseFrozen(orgA, admin, volunteer, amount(0.01))).rejects.toThrow(
        'held earnings',
      );
      await expect(
        controls.releaseFrozen(orgA, admin, volunteer, { ...dto, amount: 0.5 }),
      ).rejects.toThrow('different operation');
    });

    it('serializes two holds on one source and prevents double correction', async () => {
      const results = await race(
        [() => open(0.75), () => open(0.75)],
        'universal_time_wallets',
        wallet,
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await balances()).toEqual({ balance: 0.25, frozen: 0.75 });
      const review = (await db.query('SELECT id FROM credit_reviews'))[0];
      await controls.investigate(orgA, coordinator, review.id, {
        investigation: 'Reviewed all source documents',
      });
      const decisions = await race(
        [
          () => controls.resolve(orgA, admin, review.id, resolution('CORRECT')),
          () => controls.resolve(orgA, admin, review.id, resolution('CORRECT')),
        ],
        'credit_reviews',
        review.id,
      );
      expect(decisions.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
      expect(
        await db.query("SELECT id FROM time_credit_ledger WHERE tx_type='CREDIT_CORRECTED'"),
      ).toHaveLength(1);
    });

    it('serializes spending and donations against the same balance', async () => {
      await db.query('UPDATE service_requests SET created_by_user_id=$2 WHERE id=$1', [
        completedRequest,
        volunteer,
      ]);
      const pool = await donations.createPool(orgA, admin, { name: 'Donation fund' });
      const results = await race(
        [
          () => controls.spend(orgA, volunteer, completedRequest, amount(0.75)),
          () =>
            donations.donate(orgA, volunteer, {
              amount: 0.75,
              poolId: pool.id,
              idempotencyKey: randomUUID(),
            }),
        ],
        'universal_time_wallets',
        wallet,
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await balances()).toEqual({ balance: 0.25, frozen: 0 });
    });

    it('rolls back holds and spending when audit recording fails after insertion', async () => {
      const realLog = audit.logEvent.bind(audit);
      jest.spyOn(audit, 'logEvent').mockImplementation(async (input, manager) => {
        const event = await realLog(input, manager);
        if (['CREDIT_REVIEW_OPENED', 'ASSISTANCE_CREDITS_SPENT'].includes(input.eventType))
          throw new Error('late credit audit failure');
        return event;
      });
      await expect(open()).rejects.toThrow('late credit audit failure');
      await db.query('UPDATE service_requests SET created_by_user_id=$2 WHERE id=$1', [
        completedRequest,
        volunteer,
      ]);
      await expect(controls.spend(orgA, volunteer, completedRequest, amount())).rejects.toThrow(
        'late credit audit failure',
      );
      expect(await balances()).toEqual({ balance: 1, frozen: 0 });
      expect(await db.query('SELECT id FROM credit_reviews')).toHaveLength(0);
      expect(await db.query('SELECT id FROM credit_operations')).toHaveLength(0);
    });

    it('traces transferred disputed credits into a pool, caps holds, and resolves descendants first', async () => {
      const pool = await donations.createPool(orgA, admin, { name: 'Traceable pool' });
      const donation = await donations.donate(orgA, volunteer, {
        amount: 1,
        poolId: pool.id,
        idempotencyKey: randomUUID(),
      });
      const parent = await open(1);
      expect(Number(parent.held_amount)).toBe(0);
      const [received] = await db.query(
        "SELECT id FROM time_credit_ledger WHERE donation_id=$1 AND tx_type='DONATION_RECEIVED'",
        [donation.id],
      );
      expect((await controls.downstreamTransfers(orgA, coordinator, parent.id)).data).toEqual([
        expect.objectContaining({ source_entry_id: received.id, review_organization_id: orgA }),
      ]);
      const child = await controls.openReview(orgA, coordinator, {
        ...amount(1),
        sourceEntryId: received.id,
        parentReviewId: parent.id,
      });
      const account = await db.getRepository(CommunityCreditPool).findOneByOrFail({ id: pool.id });
      expect(account.balanceCredits).toBe(0);
      expect(account.frozenCredits).toBe(1);
      const history = await controls.poolHistory(orgA, coordinator, pool.id);
      expect(Number(history.frozen_credits)).toBe(1);
      expect(history.total).toBe(2);
      await expect(controls.poolHistory(orgA, volunteer, pool.id)).rejects.toThrow('authority');
      await expect(
        controls.openReview(orgA, coordinator, {
          ...amount(0.01),
          sourceEntryId: received.id,
          parentReviewId: parent.id,
        }),
      ).rejects.toThrow('unallocated');
      await controls.investigate(orgA, coordinator, parent.id, {
        investigation: 'Matched the source credit and the actual donation',
      });
      await controls.investigate(orgA, coordinator, child.id, {
        investigation: 'Matched the source credit and the actual donation',
      });
      await expect(controls.resolve(orgA, admin, parent.id, resolution('CORRECT'))).rejects.toThrow(
        'downstream',
      );
      await controls.resolve(orgA, admin, child.id, resolution('CORRECT'));
      await controls.resolve(orgA, admin, parent.id, resolution('CORRECT'));
      expect(await balances()).toEqual({ balance: 0, frozen: 0 });
      expect(
        (await db.getRepository(CommunityCreditPool).findOneByOrFail({ id: pool.id }))
          .frozenCredits,
      ).toBe(0);
      expect(
        await db.query("SELECT id FROM time_credit_ledger WHERE tx_type='CREDIT_CORRECTED'"),
      ).toHaveLength(1);
    });

    it('never holds more than unspent funds and rejects an unrelated downstream source', async () => {
      const pool = await donations.createPool(orgA, admin, { name: 'Partial transfer' });
      await donations.donate(orgA, volunteer, {
        amount: 0.75,
        poolId: pool.id,
        idempotencyKey: randomUUID(),
      });
      const parent = await open(1);
      expect(Number(parent.held_amount)).toBe(0.25);
      expect(await balances()).toEqual({ balance: 0, frozen: 0.25 });
      await expect(
        controls.openReview(orgA, coordinator, {
          ...amount(0.75),
          sourceEntryId: source,
          parentReviewId: parent.id,
        }),
      ).rejects.toThrow('not a downstream');
      await expect(controls.releaseFrozen(orgA, admin, volunteer, amount(0.25))).rejects.toThrow(
        'held earnings',
      );
    });

    it('checks active restrictions even when the account status still says ACTIVE', async () => {
      await db.query(
        "INSERT INTO global_account_restrictions(user_id,restriction_type,reason_code,authorized_by) VALUES($1,'TEMPORARY_SUSPENSION','REVIEW',$2)",
        [volunteer, admin],
      );
      await db.query('UPDATE service_requests SET created_by_user_id=$2 WHERE id=$1', [
        completedRequest,
        volunteer,
      ]);
      await expect(controls.spend(orgA, volunteer, completedRequest, amount())).rejects.toThrow(
        'active account',
      );
      const pool = await donations.createPool(orgA, admin, { name: 'Restricted gifts' });
      await expect(
        donations.donate(orgA, volunteer, {
          amount: 0.5,
          poolId: pool.id,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow('wallet is frozen');
      expect(await balances()).toEqual({ balance: 1, frozen: 0 });
      const req = await request();
      const assignment = await offer(req);
      await db.transaction((m) =>
        ledger.postServiceEarning(m, {
          volunteerUserId: volunteer,
          organizationId: orgA,
          serviceRequestId: req,
          volunteerAssignmentId: assignment,
          minutes: 60,
          policy: { baseCreditRateHourly: 1, creditMultiplier: 1, allowPartialHours: true },
        }),
      );
      expect(await balances()).toEqual({ balance: 1, frozen: 1 });
    });

    it('allows only global authority to freeze and restore wallets, preserving all balances', async () => {
      const dto = {
        status: 'FROZEN' as const,
        reason: 'Pending global account review',
        idempotencyKey: randomUUID(),
      };
      await expect(controls.changeWalletStatus(orgA, admin, volunteer, dto)).rejects.toThrow(
        'authority',
      );
      const [membership] = await db.query(
        'SELECT id FROM organization_memberships WHERE user_id=$1',
        [admin],
      );
      await db.query(
        "INSERT INTO membership_role_grants(membership_id,role,granted_by) VALUES($1,'SUPER_ADMIN',$2)",
        [membership.id, coordinator],
      );
      await controls.changeWalletStatus(orgA, admin, volunteer, dto);
      expect((await controls.changeWalletStatus(orgA, admin, volunteer, dto)).replayed).toBe(true);
      await expect(
        controls.changeWalletStatus(orgA, admin, volunteer, { ...dto, status: 'ACTIVE' }),
      ).rejects.toThrow('different change');
      const pool = await donations.createPool(orgA, admin, { name: 'Frozen donation target' });
      await expect(
        donations.donate(orgA, volunteer, {
          amount: 0.5,
          poolId: pool.id,
          idempotencyKey: randomUUID(),
        }),
      ).rejects.toThrow('wallet is frozen');
      await db.query("UPDATE users SET status='PERMANENTLY_BANNED' WHERE id=$1", [volunteer]);
      const restore = { ...dto, status: 'ACTIVE' as const, idempotencyKey: randomUUID() };
      await expect(controls.changeWalletStatus(orgA, admin, volunteer, restore)).rejects.toThrow(
        'restricted',
      );
      await db.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [volunteer]);
      await controls.changeWalletStatus(orgA, admin, volunteer, restore);
      expect(await balances()).toEqual({ balance: 1, frozen: 0 });
      expect(
        await db.query("SELECT id FROM audit_events WHERE event_type='TIME_WALLET_STATUS_CHANGED'"),
      ).toHaveLength(2);
    });

    it('reviews already-frozen earnings without double-moving funds or allowing release around the hold', async () => {
      await db.query("UPDATE users SET status='SUSPENDED' WHERE id=$1", [volunteer]);
      const req = await request();
      const assignment = await offer(req);
      const earned = await db.transaction((m) =>
        ledger.postServiceEarning(m, {
          volunteerUserId: volunteer,
          organizationId: orgA,
          serviceRequestId: req,
          volunteerAssignmentId: assignment,
          minutes: 60,
          policy: { baseCreditRateHourly: 1, creditMultiplier: 1, allowPartialHours: true },
        }),
      );
      const review = await controls.openReview(orgA, coordinator, {
        ...amount(0.5),
        sourceEntryId: earned!.id,
      });
      expect(Number(review.held_amount)).toBe(0.5);
      expect(Number(review.pre_frozen_amount)).toBe(0.5);
      expect(await balances()).toEqual({ balance: 1, frozen: 1 });
      await db.query("UPDATE users SET status='ACTIVE' WHERE id=$1", [volunteer]);
      await expect(controls.releaseFrozen(orgA, admin, volunteer, amount(1))).rejects.toThrow(
        'held earnings',
      );
      await controls.releaseFrozen(orgA, admin, volunteer, amount(0.5));
      expect(await balances()).toEqual({ balance: 1.5, frozen: 0.5 });
      await controls.investigate(orgA, coordinator, review.id, {
        investigation: 'The frozen service earning is fraudulent',
      });
      await controls.resolve(orgA, admin, review.id, resolution('CORRECT'));
      expect(await balances()).toEqual({ balance: 1.5, frozen: 0 });
      await expect(controls.releaseFrozen(orgA, admin, volunteer, amount(0.01))).rejects.toThrow(
        'held earnings',
      );
      // A partly released earning is still reviewed through its original source.
      const second = await controls.openReview(orgA, coordinator, {
        ...amount(0.5),
        sourceEntryId: earned!.id,
      });
      expect(Number(second.pre_frozen_amount)).toBe(0);
      expect(await balances()).toEqual({ balance: 1, frozen: 0.5 });
    });

    it('scopes staff wallet histories to approved local members and local credit origins', async () => {
      const req = await request(undefined, orgB);
      const assignment = await offer(req, memberB, orgB);
      await db.transaction((m) =>
        ledger.postServiceEarning(m, {
          volunteerUserId: volunteer,
          organizationId: orgB,
          serviceRequestId: req,
          volunteerAssignmentId: assignment,
          minutes: 120,
          policy: { baseCreditRateHourly: 1, creditMultiplier: 1, allowPartialHours: true },
        }),
      );
      const history = await controls.walletHistory(orgA, coordinator, volunteer);
      expect(history.total).toBe(1);
      expect(history.data[0].id).toBe(source);
      expect(history.wallet?.balanceCredits).toBe(3);
      await expect(controls.walletHistory(orgA, volunteer, otherVolunteer)).rejects.toThrow(
        'authority',
      );
      await expect(controls.walletHistory(orgA, coordinator, randomUUID())).rejects.toThrow(
        'Member not found',
      );
      await db.query("UPDATE organization_memberships SET status='APPLIED' WHERE id=$1", [memberA]);
      await expect(controls.walletHistory(orgA, coordinator, volunteer)).rejects.toThrow(
        'Member not found',
      );
    });

    it('shows verified funding totals and a recorded contribution without exposing the payer', async () => {
      const before = await controls.fundingSummary(orgA, coordinator, completedRequest);
      expect(before).toMatchObject({ verifiedCredits: 1, status: 'COMPLETED', funding: null });
      const pool = await donations.createPool(orgA, admin, { name: 'Dashboard fund' });
      await donations.donate(orgA, volunteer, {
        amount: 1,
        poolId: pool.id,
        idempotencyKey: randomUUID(),
      });
      await controls.spend(orgA, admin, completedRequest, { ...amount(0.5), poolId: pool.id });
      const after = await controls.fundingSummary(orgA, coordinator, completedRequest);
      expect(after.funding).toMatchObject({ amount: 0.5, source: 'Dashboard fund' });
      expect(after.funding).not.toHaveProperty('actor_id');
      await expect(controls.fundingSummary(orgA, volunteer, completedRequest)).rejects.toThrow(
        'authority',
      );
    });

    it('applies signed HTTP authentication, real role guards and strict DTO validation to credit controls', async () => {
      const jwt = new JwtService({ secret: 'disposable-credit-http-test-secret' });
      const fixture = await Test.createTestingModule({
        controllers: [CreditControlsController],
        providers: [
          { provide: CreditControlsService, useValue: controls },
          { provide: AuthorizationService, useValue: authorization },
          { provide: JwtService, useValue: jwt },
          {
            provide: ConfigService,
            useValue: new ConfigService({
              NODE_ENV: 'test',
              JWT_SECRET: 'disposable-credit-http-test-secret',
              AUTH_ALLOW_DEV_HEADERS: 'false',
            }),
          },
          AuthGuard,
          OrganizationAccessGuard,
          RolesGuard,
        ],
      }).compile();
      const app = fixture.createNestApplication();
      app.setGlobalPrefix('api');
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
      );
      await app.init();
      const token = (user: string) =>
        `Bearer ${jwt.sign({ sub: user, roles: ['SUPER_ADMIN'], isSuperAdmin: true })}`;
      const base = `/api/organizations/${orgA}`;
      try {
        await httpRequest(app.getHttpServer()).get(`${base}/credit-reviews`).expect(401);
        await httpRequest(app.getHttpServer())
          .get(`${base}/credit-reviews`)
          .set('Authorization', token(volunteer))
          .expect(403);
        await httpRequest(app.getHttpServer())
          .get(`${base}/wallets/${volunteer}/transactions`)
          .set('Authorization', token(coordinator))
          .expect(200);
        await httpRequest(app.getHttpServer())
          .get(`${base}/wallets/${volunteer}/transactions`)
          .set('Authorization', token(otherVolunteer))
          .expect(403);
        await httpRequest(app.getHttpServer())
          .get(`${base}/requests/${completedRequest}/credit-funding`)
          .set('Authorization', token(coordinator))
          .expect(200);
        await httpRequest(app.getHttpServer())
          .post(`${base}/credit-reviews`)
          .set('Authorization', token(coordinator))
          .send({ ...amount(0.001), sourceEntryId: source })
          .expect(400);
        await httpRequest(app.getHttpServer())
          .post(`${base}/credit-reviews`)
          .set('Authorization', token(coordinator))
          .send({ ...amount(), sourceEntryId: source, walletId: wallet })
          .expect(400);
        const opened = await httpRequest(app.getHttpServer())
          .post(`${base}/credit-reviews`)
          .set('Authorization', token(coordinator))
          .send({ ...amount(), sourceEntryId: source })
          .expect(201);
        const path = `${base}/credit-reviews/${opened.body.id}`;
        await httpRequest(app.getHttpServer())
          .post(`${path}/resolution`)
          .set('Authorization', token(coordinator))
          .send(resolution())
          .expect(403);
        await httpRequest(app.getHttpServer())
          .post(`${path}/investigation`)
          .set('Authorization', token(coordinator))
          .send({ investigation: 'Reviewed the HTTP verification evidence' })
          .expect(201);
        await httpRequest(app.getHttpServer())
          .post(`${path}/resolution`)
          .set('Authorization', token(admin))
          .send(resolution())
          .expect(201);
        await httpRequest(app.getHttpServer())
          .post(`${base}/wallets/${volunteer}/status`)
          .set('Authorization', token(admin))
          .send({ status: 'FROZEN', reason: 'HTTP role test', idempotencyKey: randomUUID() })
          .expect(403);
        const [membership] = await db.query(
          'SELECT id FROM organization_memberships WHERE user_id=$1',
          [admin],
        );
        await db.query(
          "UPDATE membership_role_grants SET status='REVOKED' WHERE membership_id=$1",
          [membership.id],
        );
        await httpRequest(app.getHttpServer())
          .post(`${path}/resolution`)
          .set('Authorization', token(admin))
          .send(resolution())
          .expect(403);
        expect(await balances()).toEqual({ balance: 1, frozen: 0 });
      } finally {
        await app.close();
      }
    });

    it('reverses the new schema only before credit-control records exist', async () => {
      const migration = new CreditControls1729118400010();
      await db.transaction(async (m) => {
        await migration.down(m.queryRunner!);
        await migration.up(m.queryRunner!);
      });
      await open();
      await expect(db.transaction((m) => migration.down(m.queryRunner!))).rejects.toThrow(
        'requires empty',
      );
      expect(await balances()).toEqual({ balance: 0.5, frozen: 0.5 });
    });
  });

  describe('membership applications', () => {
    const memberships = () =>
      new MembershipsService(
        db.getRepository(Organization),
        db.getRepository(User),
        db.getRepository(OrganizationMembership),
        db.getRepository(MembershipRoleGrant),
        db.getRepository(MembershipApproval),
        db.getRepository(MembershipDocument),
        audit,
        authorization,
        new RoleHierarchyService(),
      );
    const applicant = () =>
      id("INSERT INTO users(phone_e164) VALUES('+919000000099') RETURNING id");
    const requireFirstAid = () =>
      db.query('UPDATE global_service_definitions SET required_skill_codes = \'["FIRST_AID"]\'');

    it('stores a volunteer application and seeds availability and unverified skills on approval', async () => {
      await requireFirstAid();
      const user = await applicant();
      const applied = await memberships().apply(orgA, user, {
        requestedRole: 'VOLUNTEER' as any,
        notes: 'Evenings near the market',
        volunteer: {
          maxTravelRadiusKm: 2.5,
          availableAtShortNotice: true,
          usualDays: ['SAT', 'SUN'],
          usualTimes: ['EVENING'],
          skillCodes: ['FIRST_AID'],
        },
      });
      const [row] = await db.query(
        'SELECT requested_role, application_notes, application_details FROM organization_memberships WHERE id=$1',
        [applied.id],
      );
      expect(row.requested_role).toBe('VOLUNTEER');
      expect(row.application_notes).toBe('Evenings near the market');
      expect(row.application_details.volunteer.usualDays).toEqual(['SAT', 'SUN']);

      await memberships().approveMembership(orgA, applied.id, coordinator, {});

      const [grant] = await db.query(
        'SELECT role FROM membership_role_grants WHERE membership_id=$1',
        [applied.id],
      );
      expect(grant.role).toBe('VOLUNTEER');
      const [availability] = await db.query(
        'SELECT max_travel_radius_km, is_available_immediate FROM volunteer_availabilities WHERE membership_id=$1',
        [applied.id],
      );
      expect(Number(availability.max_travel_radius_km)).toBe(2.5);
      expect(availability.is_available_immediate).toBe(true);
      const skills = await db.query(
        'SELECT skill_code, status FROM volunteer_skills WHERE membership_id=$1',
        [applied.id],
      );
      expect(skills).toEqual([{ skill_code: 'FIRST_AID', status: 'PENDING_VERIFICATION' }]);
    });

    it('grants the requested help role and leaves no volunteer profile', async () => {
      const user = await applicant();
      const applied = await memberships().apply(orgA, user, { requestedRole: 'CAREGIVER' as any });
      await memberships().approveMembership(orgA, applied.id, coordinator, {});
      const [grant] = await db.query(
        'SELECT role FROM membership_role_grants WHERE membership_id=$1',
        [applied.id],
      );
      expect(grant.role).toBe('CAREGIVER');
      const availability = await db.query(
        'SELECT 1 FROM volunteer_availabilities WHERE membership_id=$1',
        [applied.id],
      );
      expect(availability).toHaveLength(0);
    });

    it('refuses unknown skills and keeps the database checks on requested roles', async () => {
      await requireFirstAid();
      const user = await applicant();
      await expect(
        memberships().apply(orgA, user, {
          requestedRole: 'VOLUNTEER' as any,
          volunteer: { skillCodes: ['SURGERY'] },
        }),
      ).rejects.toThrow('Unknown skill codes: SURGERY');
      await expect(
        db.query(
          "INSERT INTO organization_memberships(organization_id,user_id,requested_role) VALUES($1,$2,'COORDINATOR')",
          [orgA, user],
        ),
      ).rejects.toThrow(/chk_membership_requested_role/);
      await expect(
        db.query(
          "INSERT INTO organization_memberships(organization_id,user_id,application_details) VALUES($1,$2,'[]')",
          [orgA, user],
        ),
      ).rejects.toThrow(/chk_membership_application_details/);
    });
  });
});

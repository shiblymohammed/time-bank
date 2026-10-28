import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountStatus,
  GlobalRestrictionStatus,
  MembershipStatus,
  RoleGrantStatus,
  ServiceRequestStatus,
  SkillVerificationStatus,
  UrgencyType,
  UserRole,
  VolunteerAssignmentStatus,
  MatchingRoundStatus,
} from '@ktb/shared-types';

import { MatchingService } from './matching.service';
import { VolunteerSkill } from './entities/volunteer-skill.entity';
import { VolunteerAvailability } from './entities/volunteer-availability.entity';
import { VolunteerAssignment } from './entities/volunteer-assignment.entity';
import { OperationalZone } from './entities/operational-zone.entity';
import { VolunteerZoneAssignment } from './entities/volunteer-zone-assignment.entity';
import { MatchingRound } from './entities/matching-round.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { AuditService } from '../audit/audit.service';
import { MatchingConfigService } from './matching-config.service';
import { CANDIDATE_RANKING_STRATEGY } from './ranking/ranking-strategy.interface';
import { DeterministicCandidateRankingStrategy } from './ranking/deterministic-ranking.strategy';

describe('MatchingService (Milestone 3 Phase C)', () => {
  let service: MatchingService;

  const mockSkillRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto) => ({ id: 'skill-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockAvailabilityRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'avail-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockAssignmentRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    create: jest.fn((dto) => ({ id: 'assign-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockZoneRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto) => ({ id: 'zone-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockZoneAssignRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto) => ({ id: 'za-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    remove: jest.fn(),
  };

  const mockRoundRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((dto) => ({ id: 'round-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockRequestRepo = {
    findOne: jest.fn(),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockRestrictionRepo = {
    find: jest.fn(),
  };

  const mockMembershipQueryBuilder = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };

  const mockMembershipRepo = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => mockMembershipQueryBuilder),
  };

  const mockAuditService = {
    logEvent: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };

  const mockTransactionalManager = {
    findOne: jest.fn(),
    count: jest.fn(),
    save: jest.fn((_, entity) => Promise.resolve(entity)),
    create: jest.fn((_, entity) => entity),
    increment: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    createQueryBuilder: jest.fn(() => ({
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    })),
  };

  const mockDataSource = {
    transaction: jest.fn(async (callback) => callback(mockTransactionalManager)),
  };

  it('requires the target request to belong to the organization before matching controls run', async () => {
    mockRequestRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.assertRequestOrganization('org-b', 'request-a')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockRequestRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'request-a', organizationId: 'org-b' },
    });
  });

  it('scopes offer discovery to organization and volunteer membership', async () => {
    mockAssignmentRepo.find.mockResolvedValue([]);
    await service.listMyAssignments('org-1', 'volunteer-1');
    expect(mockAssignmentRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-1', volunteerMembershipId: 'volunteer-1' },
      }),
    );
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingService,
        MatchingConfigService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_k, def) => def ?? 5) },
        },
        {
          provide: CANDIDATE_RANKING_STRATEGY,
          useClass: DeterministicCandidateRankingStrategy,
        },
        { provide: getRepositoryToken(VolunteerSkill), useValue: mockSkillRepo },
        { provide: getRepositoryToken(VolunteerAvailability), useValue: mockAvailabilityRepo },
        { provide: getRepositoryToken(VolunteerAssignment), useValue: mockAssignmentRepo },
        { provide: getRepositoryToken(OperationalZone), useValue: mockZoneRepo },
        { provide: getRepositoryToken(VolunteerZoneAssignment), useValue: mockZoneAssignRepo },
        { provide: getRepositoryToken(MatchingRound), useValue: mockRoundRepo },
        { provide: getRepositoryToken(ServiceRequest), useValue: mockRequestRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: mockMembershipRepo },
        { provide: getRepositoryToken(GlobalAccountRestriction), useValue: mockRestrictionRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<MatchingService>(MatchingService);
  });

  describe('Operational Zones & Volunteer Zone Assignments', () => {
    it('creates operational zone with wards and emits audit event', async () => {
      mockZoneRepo.findOne.mockResolvedValue(null);

      const zone = await service.createZone(
        'org-1',
        {
          code: 'ZONE_NORTH',
          name: 'North Coastal Zone',
          wardNumbers: ['1', '2', '3'],
          radiusKm: 5.0,
        },
        'coord-1',
      );

      expect(zone.code).toBe('ZONE_NORTH');
      expect(mockZoneRepo.save).toHaveBeenCalled();
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'OPERATIONAL_ZONE_CREATED' }),
      );
    });

    it('rejects duplicate zone code with ConflictException', async () => {
      mockZoneRepo.findOne.mockResolvedValue({ id: 'existing-zone', code: 'ZONE_NORTH' });

      await expect(
        service.createZone(
          'org-1',
          { code: 'ZONE_NORTH', name: 'Zone', wardNumbers: [] },
          'coord-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('assigns approved volunteer to operational zone', async () => {
      mockZoneRepo.findOne.mockResolvedValue({ id: 'zone-1', organizationId: 'org-1' });
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        status: MembershipStatus.APPROVED,
      });
      mockZoneAssignRepo.findOne.mockResolvedValue(null);

      const assigned = await service.assignVolunteerToZone(
        'org-1',
        'zone-1',
        { membershipId: 'mem-1', isPrimary: true },
        'coord-1',
      );

      expect(assigned.zoneId).toBe('zone-1');
      expect(assigned.isPrimary).toBe(true);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'VOLUNTEER_ZONE_ASSIGNED' }),
      );
    });
  });

  describe('Candidate Filtering & Multi-Tier Matching (D#7, D#13, D#58, D#60)', () => {
    const mockRequest = {
      id: 'req-1',
      organizationId: 'org-1',
      beneficiaryMembershipId: 'ben-mem-1',
      urgency: UrgencyType.IMMEDIATE,
      preferredVolunteers: 1,
      minVolunteers: 1,
      matchingTier: 1,
      matchingRadiusKm: 3.0,
      locationWardNumber: '4',
      scheduledStartTime: new Date(),
      expectedDurationMinutes: 60,
      allowsCrossOrgVolunteers: false,
      serviceCatalog: {
        requiresCoordinatorDispatch: false,
        globalService: { requiresSkills: false, requiredSkillCodes: [] },
      },
    } as unknown as ServiceRequest;

    it('dispatches assignment offers to eligible volunteers and creates durable matching round', async () => {
      mockRoundRepo.find.mockResolvedValue([]);
      mockMembershipQueryBuilder.getMany.mockResolvedValue([
        {
          id: 'vol-mem-1',
          userId: 'user-vol-1',
          organizationId: 'org-1',
          user: { restrictions: [] },
        },
      ]);
      mockAssignmentRepo.find.mockResolvedValue([]);
      mockAvailabilityRepo.findOne.mockResolvedValue({
        isAvailableImmediate: true,
        preferredWardNumbers: ['4'],
        maxTravelRadiusKm: 5.0,
      });
      mockZoneAssignRepo.find.mockResolvedValue([]);

      const dispatched = await service.findCandidatesAndDispatchOffers(mockRequest);

      expect(dispatched.length).toBe(1);
      expect(dispatched[0]!.status).toBe(VolunteerAssignmentStatus.OFFERED);
      expect(dispatched[0]!.matchingRoundId).toBe('round-1');
      expect(mockRoundRepo.save).toHaveBeenCalled();
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MATCHING_ROUND_DISPATCHED' }),
      );
    });

    it('filters out volunteers with active global account restrictions (D#79, D#82)', async () => {
      mockRoundRepo.find.mockResolvedValue([]);
      mockMembershipQueryBuilder.getMany.mockResolvedValue([
        {
          id: 'vol-mem-banned',
          userId: 'user-banned',
          organizationId: 'org-1',
          user: {
            restrictions: [{ status: GlobalRestrictionStatus.ACTIVE }],
          },
        },
      ]);
      mockAssignmentRepo.find.mockResolvedValue([]);

      const dispatched = await service.findCandidatesAndDispatchOffers(mockRequest);
      expect(dispatched.length).toBe(0);
    });

    it('filters out volunteers who lack required verified skills (D#11, AT-M3-09)', async () => {
      const skilledRequest = {
        ...mockRequest,
        serviceCatalog: {
          requiresCoordinatorDispatch: false,
          globalService: { requiresSkills: true, requiredSkillCodes: ['FIRST_AID'] },
        },
      } as unknown as ServiceRequest;

      mockRoundRepo.find.mockResolvedValue([]);
      mockMembershipQueryBuilder.getMany.mockResolvedValue([
        {
          id: 'vol-mem-unskilled',
          userId: 'user-1',
          organizationId: 'org-1',
          user: { restrictions: [] },
        },
      ]);
      mockAssignmentRepo.find.mockResolvedValue([]);
      mockSkillRepo.find.mockResolvedValue([]); // zero verified skills

      const dispatched = await service.findCandidatesAndDispatchOffers(skilledRequest);
      expect(dispatched.length).toBe(0);
    });

    it('skips automated dispatch for sensitive services requiring coordinator dispatch (D#7)', async () => {
      const sensitiveRequest = {
        ...mockRequest,
        serviceCatalog: {
          requiresCoordinatorDispatch: true,
        },
      } as unknown as ServiceRequest;

      const dispatched = await service.findCandidatesAndDispatchOffers(sensitiveRequest);
      expect(dispatched).toHaveLength(0);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MATCHING_SKIPPED_SENSITIVE_SERVICE' }),
      );
    });

    it('filters out volunteers with overlapping active assignments (Schedule Conflict)', async () => {
      const now = new Date();
      mockRoundRepo.find.mockResolvedValue([]);
      mockMembershipQueryBuilder.getMany.mockResolvedValue([
        {
          id: 'vol-mem-busy',
          userId: 'user-busy',
          organizationId: 'org-1',
          user: { restrictions: [] },
        },
      ]);

      // Overlapping active assignment
      mockAssignmentRepo.find.mockImplementation(async (args) => {
        if (args?.where?.volunteerMembershipId) {
          return [
            {
              status: VolunteerAssignmentStatus.ACCEPTED,
              serviceRequest: {
                scheduledStartTime: now,
                expectedDurationMinutes: 60,
              },
            },
          ];
        }
        return [];
      });

      const dispatched = await service.findCandidatesAndDispatchOffers(mockRequest);
      expect(dispatched.length).toBe(0);
    });

    it('matches volunteer whose assigned operational zone covers the request ward', async () => {
      mockRoundRepo.find.mockResolvedValue([]);
      mockMembershipQueryBuilder.getMany.mockResolvedValue([
        {
          id: 'vol-zone-matched',
          userId: 'user-zone',
          organizationId: 'org-1',
          user: { restrictions: [] },
        },
      ]);
      mockAssignmentRepo.find.mockResolvedValue([]);
      mockAvailabilityRepo.findOne.mockResolvedValue({
        isAvailableImmediate: true,
        preferredWardNumbers: [],
        maxTravelRadiusKm: 5.0,
      });

      // Operational zone covering ward 4
      mockZoneAssignRepo.find.mockResolvedValue([
        {
          zone: { isActive: true, wardNumbers: ['3', '4', '5'] },
        },
      ]);

      const dispatched = await service.findCandidatesAndDispatchOffers(mockRequest);
      expect(dispatched.length).toBe(1);
      expect(dispatched[0]!.volunteerMembershipId).toBe('vol-zone-matched');
    });

    it('enables cross-organization volunteers when allowsCrossOrgVolunteers is true (ITB-006)', async () => {
      const crossOrgRequest = {
        ...mockRequest,
        allowsCrossOrgVolunteers: true,
      } as unknown as ServiceRequest;

      mockRoundRepo.find.mockResolvedValue([]);
      mockMembershipQueryBuilder.getMany.mockResolvedValue([
        {
          id: 'vol-from-neighbor-org',
          userId: 'user-external',
          organizationId: 'org-other',
          user: { restrictions: [] },
        },
      ]);
      mockAssignmentRepo.find.mockResolvedValue([]);
      mockAvailabilityRepo.findOne.mockResolvedValue({
        isAvailableImmediate: true,
        preferredWardNumbers: ['4'],
        maxTravelRadiusKm: 10.0,
      });
      mockZoneAssignRepo.find.mockResolvedValue([]);

      const dispatched = await service.findCandidatesAndDispatchOffers(crossOrgRequest);
      expect(dispatched.length).toBe(1);
      expect(dispatched[0]!.volunteerMembershipId).toBe('vol-from-neighbor-org');
    });
  });

  describe('Offer Acceptance & Idempotency (D#12, D#64, NFR-11)', () => {
    it('accepts offer atomically with clientOperationId and updates request', async () => {
      mockTransactionalManager.findOne.mockResolvedValue({
        id: 'assign-1',
        organizationId: 'org-1',
        serviceRequestId: 'req-1',
        volunteerMembershipId: 'vol-mem-1',
        status: VolunteerAssignmentStatus.OFFERED,
        offerExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        matchingRoundId: 'round-1',
      });

      mockTransactionalManager.createQueryBuilder.mockReturnValue({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          id: 'req-1',
          minVolunteers: 1,
          preferredVolunteers: 1,
          status: ServiceRequestStatus.MATCHING_ACTIVE,
        }),
      });

      mockTransactionalManager.count.mockResolvedValue(0);

      const result = await service.acceptOffer('org-1', 'assign-1', 'vol-mem-1', {
        clientOperationId: 'client-op-123',
      });

      expect(result.status).toBe(VolunteerAssignmentStatus.ACCEPTED);
      expect(result.idempotencyKey).toBe('client-op-123');
      expect(mockTransactionalManager.increment).toHaveBeenCalledWith(
        MatchingRound,
        { id: 'round-1' },
        'offersAcceptedCount',
        1,
      );
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'VOLUNTEER_OFFER_ACCEPTED' }),
      );
    });

    it('returns existing accepted assignment idempotently when retried with same clientOperationId', async () => {
      mockTransactionalManager.findOne.mockResolvedValue({
        id: 'assign-1',
        organizationId: 'org-1',
        serviceRequestId: 'req-1',
        volunteerMembershipId: 'vol-mem-1',
        status: VolunteerAssignmentStatus.ACCEPTED,
        idempotencyKey: 'client-op-123',
      });

      const result = await service.acceptOffer('org-1', 'assign-1', 'vol-mem-1', {
        clientOperationId: 'client-op-123',
      });

      expect(result.status).toBe(VolunteerAssignmentStatus.ACCEPTED);
      expect(mockTransactionalManager.save).not.toHaveBeenCalled();
    });

    it('marks assignment TIMED_OUT and throws ConflictException if offer has expired', async () => {
      mockTransactionalManager.findOne.mockResolvedValue({
        id: 'assign-1',
        organizationId: 'org-1',
        serviceRequestId: 'req-1',
        volunteerMembershipId: 'vol-mem-1',
        status: VolunteerAssignmentStatus.OFFERED,
        offerExpiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      });

      await expect(service.acceptOffer('org-1', 'assign-1', 'vol-mem-1', {})).rejects.toThrow(
        ConflictException,
      );

      expect(mockTransactionalManager.save).toHaveBeenCalledWith(
        VolunteerAssignment,
        expect.objectContaining({ status: VolunteerAssignmentStatus.TIMED_OUT }),
      );
    });
  });

  describe('Multi-Round Progression, Expiry & Escalation (D#7, D#13, FR-MATCH)', () => {
    it('processes expired offers and transitions them to TIMED_OUT', async () => {
      const expiredOffer = {
        id: 'assign-expired',
        status: VolunteerAssignmentStatus.OFFERED,
        offerExpiresAt: new Date(Date.now() - 10000),
      };
      mockAssignmentRepo.find.mockResolvedValue([expiredOffer]);

      const count = await service.processExpiredOffers('req-1');
      expect(count).toBe(1);
      expect(expiredOffer.status).toBe(VolunteerAssignmentStatus.TIMED_OUT);
      expect(mockAssignmentRepo.save).toHaveBeenCalledWith(expiredOffer);
    });

    it('evaluates progression and advances from Tier 1 to Tier 2 when offers are exhausted', async () => {
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        status: ServiceRequestStatus.MATCHING_ACTIVE,
        matchingTier: 1,
        minVolunteers: 1,
        preferredVolunteers: 1,
        urgency: UrgencyType.IMMEDIATE,
        organizationId: 'org-1',
        beneficiaryMembershipId: 'ben-1',
        serviceCatalog: { requiresCoordinatorDispatch: false },
      });

      mockAssignmentRepo.find.mockResolvedValue([]); // zero expired currently
      mockRoundRepo.findOne.mockResolvedValue({
        id: 'round-1',
        tier: 1,
        roundNumber: 1,
        status: MatchingRoundStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 5000), // Expired
      });
      mockAssignmentRepo.count.mockImplementation(async (args) => {
        if (args?.where?.status === VolunteerAssignmentStatus.OFFERED) return 0; // 0 pending offers
        if (args?.where?.status === VolunteerAssignmentStatus.ACCEPTED) return 0; // 0 accepted
        return 0;
      });

      // Mock candidate search for round 2
      mockRoundRepo.find.mockResolvedValue([]);
      mockMembershipQueryBuilder.getMany.mockResolvedValue([]);

      const progressed = await service.evaluateRoundProgression('req-1');
      expect(progressed.matchingTier).toBe(2);
      expect(mockRoundRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: MatchingRoundStatus.EXPIRED }),
      );
    });

    it('escalates to coordinator when Tier 3 matching rounds are exhausted (AT-M3-14)', async () => {
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        status: ServiceRequestStatus.MATCHING_ACTIVE,
        matchingTier: 3,
        minVolunteers: 1,
        preferredVolunteers: 1,
        urgency: UrgencyType.IMMEDIATE,
        organizationId: 'org-1',
        beneficiaryMembershipId: 'ben-1',
        serviceCatalog: { requiresCoordinatorDispatch: false },
      });

      mockAssignmentRepo.find.mockResolvedValue([]);
      mockRoundRepo.findOne.mockResolvedValue({
        id: 'round-3',
        tier: 3,
        roundNumber: 3,
        status: MatchingRoundStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 5000),
      });
      mockAssignmentRepo.count.mockResolvedValue(0);

      const escalated = await service.evaluateRoundProgression('req-1');
      expect(escalated.status).toBe(ServiceRequestStatus.ESCALATED_TO_COORDINATOR);
      expect(escalated.escalatedAt).toBeDefined();
      expect(mockRoundRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: MatchingRoundStatus.ESCALATED }),
      );
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'REQUEST_ESCALATED_TO_COORDINATOR' }),
      );
    });
  });
});

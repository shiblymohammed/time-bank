import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CancellerRole,
  CreationChannel,
  MembershipStatus,
  RoleGrantStatus,
  ServiceRequestStatus,
  UrgencyType,
  UserRole,
  VolunteerAssignmentStatus,
} from '@ktb/shared-types';

import { RequestsService } from './requests.service';
import { ServiceRequest } from './entities/service-request.entity';
import { RequestCancellation } from './entities/request-cancellation.entity';
import { RequestRescheduleHistory } from './entities/request-reschedule.entity';
import { OrganizationServiceCatalog } from '../catalogue/entities/organization-service-catalog.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { VolunteerAssignment } from '../matching/entities/volunteer-assignment.entity';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';
import { MatchingService } from '../matching/matching.service';
import { AuditService } from '../audit/audit.service';
import {
  AuthorizationService,
  EvaluatedMembershipContext,
} from '../authorization/authorization.service';

describe('RequestsService', () => {
  let service: RequestsService;

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'req-1' }], 1]),
  };

  const mockRequestRepo = {
    manager: {
      transaction: jest.fn(async (_isolation, action) =>
        action({
          getRepository: (entity: any) =>
            entity === ServiceRequest
              ? mockRequestRepo
              : entity === VolunteerAssignment
                ? mockAssignmentRepo
                : entity === RequestCancellation
                  ? mockCancellationRepo
                  : mockRescheduleRepo,
        }),
      ),
    },
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'req-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
  };

  const mockCancellationRepo = {
    create: jest.fn((dto) => ({ id: 'canc-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockRescheduleRepo = {
    create: jest.fn((dto) => ({ id: 'resched-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockCatalogRepo = {
    findOne: jest.fn(),
  };

  const mockMembershipRepo = {
    findOne: jest.fn(),
  };

  const mockOrgRepo = {
    findOne: jest.fn(),
  };

  const mockAssignmentRepo = {
    find: jest.fn(),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockBeneficiariesService = {
    checkEligibilityAndQuota: jest.fn().mockResolvedValue({ eligible: true, remainingQuota: 5 }),
    verifyCaregiverProxyAccess: jest.fn().mockResolvedValue({ id: 'auth-1' }),
    listCareRecipientsForCaregiver: jest
      .fn()
      .mockResolvedValue([{ beneficiaryMembershipId: 'ben-mem-1' }]),
  };

  const mockMatchingService = {
    reopenForReschedule: jest.fn().mockResolvedValue(undefined),
    findCandidatesAndDispatchOffers: jest.fn().mockResolvedValue([]),
  };

  const mockAuditService = {
    logEvent: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRequestRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockAssignmentRepo.find.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: getRepositoryToken(ServiceRequest), useValue: mockRequestRepo },
        { provide: getRepositoryToken(RequestCancellation), useValue: mockCancellationRepo },
        { provide: getRepositoryToken(RequestRescheduleHistory), useValue: mockRescheduleRepo },
        { provide: getRepositoryToken(OrganizationServiceCatalog), useValue: mockCatalogRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: mockMembershipRepo },
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
        { provide: getRepositoryToken(VolunteerAssignment), useValue: mockAssignmentRepo },
        { provide: BeneficiariesService, useValue: mockBeneficiariesService },
        { provide: MatchingService, useValue: mockMatchingService },
        { provide: AuditService, useValue: mockAuditService },
        {
          provide: AuthorizationService,
          useValue: {
            evaluateOrganizationAccess: jest.fn().mockResolvedValue({
              isSuperAdmin: false,
              roles: [UserRole.COORDINATOR],
              membershipId: 'coord-1',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RequestsService>(RequestsService);
  });

  describe('createRequest (AT-M3-04, AT-M3-06, AT-M3-08, D#59, D#61)', () => {
    it('creates request with mandatory manual location and triggers matching immediately', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1', code: 'KZK' });
      mockCatalogRepo.findOne.mockResolvedValue({
        id: 'cat-item-1',
        isEnabled: true,
        minVolunteers: 1,
        preferredVolunteers: 1,
        globalService: { categoryId: 'cat-1' },
      });

      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'ben-mem-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.BENEFICIARY, status: RoleGrantStatus.ACTIVE }],
      });
      mockRequestRepo.findOne.mockResolvedValue(null);

      const result = await service.createRequest('org-1', 'user-ben-1', {
        serviceCatalogId: 'cat-item-1',
        urgency: UrgencyType.IMMEDIATE,
        scheduledStartTime: new Date().toISOString(),
        locationAddressText: 'Taluk Hospital OP Counter, Kottakkal',
        locationWardNumber: '14',
        locationPostalCode: '676503',
      });

      expect(result.status).toBe(ServiceRequestStatus.MATCHING_ACTIVE);
      expect(result.locationAddressText).toBe('Taluk Hospital OP Counter, Kottakkal');
      expect(mockBeneficiariesService.checkEligibilityAndQuota).toHaveBeenCalledWith(
        'org-1',
        'ben-mem-1',
        'cat-1',
      );
      expect(mockMatchingService.findCandidatesAndDispatchOffers).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-1' }),
      );
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'SERVICE_REQUEST_CREATED' }),
      );
    });

    it('returns existing request idempotently when idempotencyKey is already present', async () => {
      const existingReq = { id: 'existing-req', idempotencyKey: 'idem-1' };
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1', code: 'KZK' });
      mockRequestRepo.findOne.mockResolvedValueOnce(existingReq);

      const result = await service.createRequest('org-1', 'user-1', {
        idempotencyKey: 'idem-1',
        serviceCatalogId: 'cat-item-1',
        urgency: UrgencyType.IMMEDIATE,
        scheduledStartTime: new Date().toISOString(),
        locationAddressText: 'Some Address',
        locationWardNumber: '1',
        locationPostalCode: '676503',
      });

      expect(result).toBe(existingReq);
      expect(mockRequestRepo.save).not.toHaveBeenCalled();
      expect(mockMatchingService.findCandidatesAndDispatchOffers).not.toHaveBeenCalled();
    });

    it('throws ConflictException on identical active request duplicate without idempotencyKey', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1', code: 'KZK' });
      mockCatalogRepo.findOne.mockResolvedValue({
        id: 'cat-item-1',
        isEnabled: true,
        globalService: { categoryId: 'cat-1' },
      });
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'ben-mem-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.BENEFICIARY, status: RoleGrantStatus.ACTIVE }],
      });
      mockRequestRepo.findOne.mockResolvedValueOnce({ id: 'active-req-1' });

      await expect(
        service.createRequest('org-1', 'user-ben-1', {
          serviceCatalogId: 'cat-item-1',
          urgency: UrgencyType.IMMEDIATE,
          scheduledStartTime: new Date().toISOString(),
          locationAddressText: 'Some Address',
          locationWardNumber: '1',
          locationPostalCode: '676503',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates request via caregiver proxy with verification (AT-M3-06)', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1', code: 'KZK' });
      mockCatalogRepo.findOne.mockResolvedValue({
        id: 'cat-item-1',
        isEnabled: true,
        minVolunteers: 1,
        preferredVolunteers: 2,
        globalService: { categoryId: 'cat-1' },
      });

      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'caregiver-mem-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
      });
      mockRequestRepo.findOne.mockResolvedValue(null);

      const result = await service.createRequest('org-1', 'user-caregiver-1', {
        serviceCatalogId: 'cat-item-1',
        beneficiaryMembershipId: 'ben-mem-1',
        creationChannel: CreationChannel.CAREGIVER_PROXY,
        urgency: UrgencyType.SCHEDULED,
        scheduledStartTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
        locationAddressText: 'Grandmothers Home, Ward 3',
        locationWardNumber: '3',
        locationPostalCode: '676503',
      });

      expect(result.creationChannel).toBe(CreationChannel.CAREGIVER_PROXY);
      expect(mockBeneficiariesService.verifyCaregiverProxyAccess).toHaveBeenCalledWith(
        'org-1',
        'caregiver-mem-1',
        'ben-mem-1',
      );
    });

    it('creates request via coordinator on-behalf (UC-15)', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1', code: 'KZK' });
      mockCatalogRepo.findOne.mockResolvedValue({
        id: 'cat-item-1',
        isEnabled: true,
        minVolunteers: 1,
        preferredVolunteers: 1,
        globalService: { categoryId: 'cat-1' },
      });
      mockRequestRepo.findOne.mockResolvedValue(null);

      const result = await service.createRequest('org-1', 'user-coord-1', {
        serviceCatalogId: 'cat-item-1',
        beneficiaryMembershipId: 'ben-mem-1',
        creationChannel: CreationChannel.COORDINATOR_ON_BEHALF,
        urgency: UrgencyType.SCHEDULED,
        scheduledStartTime: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        locationAddressText: 'Community Hall, Ward 5',
        locationWardNumber: '5',
        locationPostalCode: '676503',
      });

      expect(result.creationChannel).toBe(CreationChannel.COORDINATOR_ON_BEHALF);
      expect(mockBeneficiariesService.checkEligibilityAndQuota).toHaveBeenCalledWith(
        'org-1',
        'ben-mem-1',
        'cat-1',
      );
    });

    it('throws BadRequestException if service is not enabled in org', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1', code: 'KZK' });
      mockCatalogRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createRequest('org-1', 'user-1', {
          serviceCatalogId: 'cat-disabled',
          urgency: UrgencyType.IMMEDIATE,
          scheduledStartTime: new Date().toISOString(),
          locationAddressText: 'Location Text',
          locationWardNumber: '1',
          locationPostalCode: '676503',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException if caller has no approved BENEFICIARY role for direct request', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1', code: 'KZK' });
      mockCatalogRepo.findOne.mockResolvedValue({
        id: 'cat-item-1',
        isEnabled: true,
        globalService: { categoryId: 'cat-1' },
      });
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.VOLUNTEER, status: RoleGrantStatus.ACTIVE }],
      });

      await expect(
        service.createRequest('org-1', 'user-1', {
          serviceCatalogId: 'cat-item-1',
          urgency: UrgencyType.IMMEDIATE,
          scheduledStartTime: new Date().toISOString(),
          locationAddressText: 'Location Text',
          locationWardNumber: '1',
          locationPostalCode: '676503',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException if beneficiaryMembershipId is omitted for caregiver proxy', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1', code: 'KZK' });
      mockCatalogRepo.findOne.mockResolvedValue({
        id: 'cat-item-1',
        isEnabled: true,
        globalService: { categoryId: 'cat-1' },
      });

      await expect(
        service.createRequest('org-1', 'user-1', {
          serviceCatalogId: 'cat-item-1',
          creationChannel: CreationChannel.CAREGIVER_PROXY,
          urgency: UrgencyType.IMMEDIATE,
          scheduledStartTime: new Date().toISOString(),
          locationAddressText: 'Location Text',
          locationWardNumber: '1',
          locationPostalCode: '676503',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('propagates ForbiddenException if beneficiary quota or eligibility check fails', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1', code: 'KZK' });
      mockCatalogRepo.findOne.mockResolvedValue({
        id: 'cat-item-1',
        isEnabled: true,
        globalService: { categoryId: 'cat-1' },
      });
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'ben-mem-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.BENEFICIARY, status: RoleGrantStatus.ACTIVE }],
      });
      mockBeneficiariesService.checkEligibilityAndQuota.mockRejectedValue(
        new ForbiddenException('Monthly assistance request quota reached'),
      );

      await expect(
        service.createRequest('org-1', 'user-ben-1', {
          serviceCatalogId: 'cat-item-1',
          urgency: UrgencyType.IMMEDIATE,
          scheduledStartTime: new Date().toISOString(),
          locationAddressText: 'Location Text',
          locationWardNumber: '1',
          locationPostalCode: '676503',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancelRequest (AT-M3-16, D#29, D#62)', () => {
    it('cancels request, logs hoursBeforeStart, and cancels assignments with CancellerRole enum', async () => {
      const scheduledTime = new Date(Date.now() + 5 * 3600 * 1000);
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        status: ServiceRequestStatus.MATCHING_ACTIVE,
        scheduledStartTime: scheduledTime,
        assignments: [{ id: 'a-1', status: VolunteerAssignmentStatus.OFFERED }],
      });

      const cancelled = await service.cancelRequest(
        'org-1',
        'req-1',
        'user-1',
        CancellerRole.BENEFICIARY,
        {
          reasonCode: 'BENEFICIARY_UNWELL',
          notes: 'Cannot attend today',
        },
      );

      expect(cancelled.status).toBe(ServiceRequestStatus.CANCELLED);
      expect(mockCancellationRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          reasonCode: 'BENEFICIARY_UNWELL',
          hoursBeforeStart: expect.any(Number),
        }),
      );
    });

    it('resolves coordinator role when membership context is provided', async () => {
      const scheduledTime = new Date(Date.now() + 5 * 3600 * 1000);
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        status: ServiceRequestStatus.MATCHING_ACTIVE,
        scheduledStartTime: scheduledTime,
        beneficiaryMembershipId: 'ben-1',
      });

      const coordCtx: EvaluatedMembershipContext = {
        userId: 'user-coord-1',
        membershipId: 'coord-mem-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.COORDINATOR],
      };

      const cancelled = await service.cancelRequest('org-1', 'req-1', 'user-coord-1', coordCtx, {
        reasonCode: 'COORDINATOR_ACTION',
        notes: 'Administrative cancellation',
      });

      expect(cancelled.status).toBe(ServiceRequestStatus.CANCELLED);
      expect(mockCancellationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cancellerRole: CancellerRole.COORDINATOR,
        }),
      );
    });

    it('resolves caregiver role when proxy access is verified', async () => {
      const scheduledTime = new Date(Date.now() + 5 * 3600 * 1000);
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        status: ServiceRequestStatus.MATCHING_ACTIVE,
        scheduledStartTime: scheduledTime,
        beneficiaryMembershipId: 'ben-1',
        createdByUserId: 'other-user',
      });

      const caregiverCtx: EvaluatedMembershipContext = {
        userId: 'user-cg-1',
        membershipId: 'cg-mem-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.CAREGIVER],
      };

      mockBeneficiariesService.verifyCaregiverProxyAccess.mockResolvedValue({ id: 'auth-1' });

      await service.cancelRequest('org-1', 'req-1', 'user-cg-1', caregiverCtx, {
        reasonCode: 'CAREGIVER_REQUESTED',
        notes: 'Beneficiary requested cancellation',
      });

      expect(mockCancellationRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          cancellerRole: CancellerRole.CAREGIVER,
        }),
      );
    });

    it('throws ForbiddenException if cancelling user has no relation to request', async () => {
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        status: ServiceRequestStatus.MATCHING_ACTIVE,
        scheduledStartTime: new Date(Date.now() + 5 * 3600 * 1000),
        beneficiaryMembershipId: 'ben-1',
        createdByUserId: 'other-user',
      });

      const strangerCtx: EvaluatedMembershipContext = {
        userId: 'user-stranger',
        membershipId: 'stranger-mem-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.BENEFICIARY],
      };

      mockBeneficiariesService.verifyCaregiverProxyAccess.mockRejectedValue(new Error());

      await expect(
        service.cancelRequest('org-1', 'req-1', 'user-stranger', strangerCtx, {
          reasonCode: 'RANDOM',
          notes: 'Unauthorized cancel attempt',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('disallows cancellation of completed request', async () => {
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        status: ServiceRequestStatus.COMPLETED,
      });

      await expect(
        service.cancelRequest('org-1', 'req-1', 'user-1', CancellerRole.BENEFICIARY, {
          reasonCode: 'REASON',
          notes: 'notes',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('disallows cancellation of already cancelled request', async () => {
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        status: ServiceRequestStatus.CANCELLED,
      });

      await expect(
        service.cancelRequest('org-1', 'req-1', 'user-1', CancellerRole.BENEFICIARY, {
          reasonCode: 'REASON',
          notes: 'notes',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('rescheduleRequest (D#62)', () => {
    it('reschedules request and triggers new matching dispatch', async () => {
      const oldTime = new Date(Date.now() + 24 * 3600 * 1000);
      const newTime = new Date(Date.now() + 48 * 3600 * 1000);
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        status: ServiceRequestStatus.MATCHING_ACTIVE,
        scheduledStartTime: oldTime,
        beneficiaryMembershipId: 'ben-1',
        createdByUserId: 'user-1',
      });
      mockAssignmentRepo.find.mockResolvedValue([
        { id: 'a-1', status: VolunteerAssignmentStatus.OFFERED },
      ]);

      const result = await service.rescheduleRequest('org-1', 'req-1', 'user-1', undefined, {
        newStartTime: newTime.toISOString(),
        reason: 'Doctor rescheduled appointment to next day',
      });

      expect(result.status).toBe(ServiceRequestStatus.MATCHING_ACTIVE);
      expect(mockRescheduleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Doctor rescheduled appointment to next day',
        }),
      );
      expect(mockMatchingService.reopenForReschedule).toHaveBeenCalled();
    });

    it('throws ForbiddenException if rescheduling caller is not authorized', async () => {
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        status: ServiceRequestStatus.MATCHING_ACTIVE,
        scheduledStartTime: new Date(Date.now() + 24 * 3600 * 1000),
        beneficiaryMembershipId: 'ben-1',
        createdByUserId: 'ben-user',
      });

      const strangerCtx: EvaluatedMembershipContext = {
        userId: 'user-stranger',
        membershipId: 'stranger-mem-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.BENEFICIARY],
      };

      (service as any).authorizationService.evaluateOrganizationAccess.mockResolvedValueOnce(
        strangerCtx,
      );
      mockBeneficiariesService.verifyCaregiverProxyAccess.mockRejectedValue(new Error());

      await expect(
        service.rescheduleRequest('org-1', 'req-1', 'user-stranger', strangerCtx, {
          newStartTime: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
          reason: 'Doctor changed',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('disallows rescheduling of completed request', async () => {
      mockRequestRepo.findOne.mockResolvedValue({
        id: 'req-1',
        organizationId: 'org-1',
        status: ServiceRequestStatus.COMPLETED,
      });

      await expect(
        service.rescheduleRequest('org-1', 'req-1', 'user-1', undefined, {
          newStartTime: new Date().toISOString(),
          reason: 'Reason',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getRequestById', () => {
    it('returns service request with relations for coordinator', async () => {
      const req = { id: 'req-1', organizationId: 'org-1', beneficiaryMembershipId: 'ben-1' };
      mockRequestRepo.findOne.mockResolvedValue(req);

      const coordCtx: EvaluatedMembershipContext = {
        userId: 'user-1',
        membershipId: 'coord-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.COORDINATOR],
      };

      const result = await service.getRequestById('org-1', 'req-1', 'user-1', coordCtx);
      expect(result).toBe(req);
    });

    it('returns request for authorized beneficiary owner', async () => {
      const req = { id: 'req-1', organizationId: 'org-1', beneficiaryMembershipId: 'ben-mem-1' };
      mockRequestRepo.findOne.mockResolvedValue(req);

      const benCtx: EvaluatedMembershipContext = {
        userId: 'user-1',
        membershipId: 'ben-mem-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.BENEFICIARY],
      };

      const result = await service.getRequestById('org-1', 'req-1', 'user-1', benCtx);
      expect(result).toBe(req);
    });

    it('throws ForbiddenException for unauthorized member viewing another beneficiary request', async () => {
      const req = { id: 'req-1', organizationId: 'org-1', beneficiaryMembershipId: 'ben-mem-999' };
      mockRequestRepo.findOne.mockResolvedValue(req);
      mockBeneficiariesService.verifyCaregiverProxyAccess.mockRejectedValue(new Error());

      const otherCtx: EvaluatedMembershipContext = {
        userId: 'user-other',
        membershipId: 'other-mem-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.BENEFICIARY],
      };

      await expect(
        service.getRequestById('org-1', 'req-1', 'user-other', otherCtx),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException if request not found', async () => {
      mockRequestRepo.findOne.mockResolvedValue(null);

      await expect(service.getRequestById('org-1', 'missing-req')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listRequests scoping', () => {
    it('allows coordinator to view all organization requests', async () => {
      const coordCtx: EvaluatedMembershipContext = {
        userId: 'user-coord',
        membershipId: 'coord-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.COORDINATOR],
      };

      const res = await service.listRequests('org-1', 'user-coord', coordCtx, {});
      expect(res.data).toHaveLength(1);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('req.organizationId = :orgId', {
        orgId: 'org-1',
      });
    });

    it('scopes beneficiary to their own membershipId', async () => {
      const benCtx: EvaluatedMembershipContext = {
        userId: 'user-ben',
        membershipId: 'ben-mem-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.BENEFICIARY],
      };

      await service.listRequests('org-1', 'user-ben', benCtx, {});
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('req.beneficiaryMembershipId = :bId', {
        bId: 'ben-mem-1',
      });
    });

    it('throws ForbiddenException if beneficiary attempts to query another beneficiary', async () => {
      const benCtx: EvaluatedMembershipContext = {
        userId: 'user-ben',
        membershipId: 'ben-mem-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.BENEFICIARY],
      };

      await expect(
        service.listRequests('org-1', 'user-ben', benCtx, { beneficiaryMembershipId: 'ben-mem-2' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('scopes caregiver to their own ID and their authorized care recipients', async () => {
      const cgCtx: EvaluatedMembershipContext = {
        userId: 'user-cg',
        membershipId: 'cg-mem-1',
        organizationId: 'org-1',
        membershipStatus: MembershipStatus.APPROVED,
        isSuperAdmin: false,
        roles: [UserRole.CAREGIVER],
      };

      mockBeneficiariesService.listCareRecipientsForCaregiver.mockResolvedValue([
        { beneficiaryMembershipId: 'recipient-1' },
      ]);

      await service.listRequests('org-1', 'user-cg', cgCtx, {});
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'req.beneficiaryMembershipId IN (:...recipientIds)',
        { recipientIds: ['recipient-1', 'cg-mem-1'] },
      );
    });
  });
});

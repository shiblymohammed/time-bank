import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  BeneficiaryEligibilityStatus,
  BeneficiaryEligibilityType,
  CaregiverAuthorizationStatus,
  CaregiverRelationshipType,
  MembershipStatus,
} from '@ktb/shared-types';

import { BeneficiariesService } from './beneficiaries.service';
import { BeneficiaryEligibility } from './entities/beneficiary-eligibility.entity';
import { CaregiverAuthorization } from './entities/caregiver-authorization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { AuditService } from '../audit/audit.service';

describe('BeneficiariesService', () => {
  let service: BeneficiariesService;

  const mockEligibilityRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'elig-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
  };

  const mockCaregiverAuthRepo = {
    findOne: jest.fn(),
    create: jest.fn((dto) => ({ id: 'auth-1', ...dto })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    find: jest.fn(),
  };

  const mockMembershipRepo = {
    findOne: jest.fn(),
  };

  const mockRequestQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
  };

  const mockRequestRepo = {
    createQueryBuilder: jest.fn(() => mockRequestQueryBuilder),
  };

  const mockAuditService = {
    logEvent: jest.fn().mockResolvedValue({ id: 'audit-1' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BeneficiariesService,
        { provide: getRepositoryToken(BeneficiaryEligibility), useValue: mockEligibilityRepo },
        { provide: getRepositoryToken(CaregiverAuthorization), useValue: mockCaregiverAuthRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: mockMembershipRepo },
        { provide: getRepositoryToken(ServiceRequest), useValue: mockRequestRepo },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<BeneficiariesService>(BeneficiariesService);
  });

  describe('grantEligibility (D#24, D#25)', () => {
    it('grants beneficiary eligibility with review due date and quota', async () => {
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
      });
      mockEligibilityRepo.findOne.mockResolvedValue(null);

      const result = await service.grantEligibility(
        'org-1',
        {
          membershipId: 'mem-1',
          eligibilityType: BeneficiaryEligibilityType.ONGOING,
          reviewDueAt: '2027-10-18T00:00:00.000Z',
          monthlyRequestQuota: 10,
        },
        'user-coord-1',
      );

      expect(result.status).toBe(BeneficiaryEligibilityStatus.ACTIVE);
      expect(result.monthlyRequestQuota).toBe(10);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'BENEFICIARY_ELIGIBILITY_GRANTED' }),
      );
    });

    it('updates existing beneficiary eligibility and review due date', async () => {
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
      });
      const existing = {
        id: 'elig-1',
        membershipId: 'mem-1',
        organizationId: 'org-1',
        eligibilityType: BeneficiaryEligibilityType.TEMPORARY,
        status: BeneficiaryEligibilityStatus.ACTIVE,
        reviewDueAt: new Date(),
        monthlyRequestQuota: 5,
      };
      mockEligibilityRepo.findOne.mockResolvedValue(existing);

      const result = await service.grantEligibility(
        'org-1',
        {
          membershipId: 'mem-1',
          eligibilityType: BeneficiaryEligibilityType.ONGOING,
          reviewDueAt: '2028-01-01T00:00:00.000Z',
          monthlyRequestQuota: 12,
          quotaOverrideReason: 'Special chronic medical need',
        },
        'user-coord-1',
      );

      expect(result.monthlyRequestQuota).toBe(12);
      expect(result.quotaOverrideReason).toBe('Special chronic medical need');
    });

    it('throws NotFoundException if membership does not exist', async () => {
      mockMembershipRepo.findOne.mockResolvedValue(null);

      await expect(
        service.grantEligibility(
          'org-1',
          {
            membershipId: 'missing-mem',
            eligibilityType: BeneficiaryEligibilityType.ONGOING,
            reviewDueAt: '2027-10-18T00:00:00.000Z',
          },
          'user-coord-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if membership is not approved', async () => {
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        status: MembershipStatus.APPLIED,
      });

      await expect(
        service.grantEligibility(
          'org-1',
          {
            membershipId: 'mem-1',
            eligibilityType: BeneficiaryEligibilityType.ONGOING,
            reviewDueAt: '2027-10-18T00:00:00.000Z',
          },
          'user-coord-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getEligibility', () => {
    it('returns eligibility record if found', async () => {
      const record = { id: 'elig-1', membershipId: 'mem-1' };
      mockEligibilityRepo.findOne.mockResolvedValue(record);

      const result = await service.getEligibility('org-1', 'mem-1');
      expect(result).toBe(record);
    });

    it('throws NotFoundException if eligibility not found', async () => {
      mockEligibilityRepo.findOne.mockResolvedValue(null);

      await expect(service.getEligibility('org-1', 'missing-mem')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('checkEligibilityAndQuota (AT-M3-20, D#24, D#25, D#26)', () => {
    it('passes when eligibility is active and within quota', async () => {
      const futureDate = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
      mockEligibilityRepo.findOne.mockResolvedValue({
        id: 'elig-1',
        status: BeneficiaryEligibilityStatus.ACTIVE,
        reviewDueAt: futureDate,
        monthlyRequestQuota: 8,
        approvedAssistanceCategories: ['*'],
      });
      mockRequestQueryBuilder.getCount.mockResolvedValue(3);

      const result = await service.checkEligibilityAndQuota('org-1', 'mem-1');
      expect(result.eligible).toBe(true);
      expect(result.remainingQuota).toBe(5);
    });

    it('rejects when eligibility review date has expired (D#25)', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      mockEligibilityRepo.findOne.mockResolvedValue({
        id: 'elig-1',
        status: BeneficiaryEligibilityStatus.ACTIVE,
        reviewDueAt: pastDate,
        monthlyRequestQuota: 8,
      });

      await expect(service.checkEligibilityAndQuota('org-1', 'mem-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when monthly request quota is exceeded (AT-M3-20, D#26)', async () => {
      const futureDate = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
      mockEligibilityRepo.findOne.mockResolvedValue({
        id: 'elig-1',
        status: BeneficiaryEligibilityStatus.ACTIVE,
        reviewDueAt: futureDate,
        monthlyRequestQuota: 8,
      });
      mockRequestQueryBuilder.getCount.mockResolvedValue(8);

      await expect(service.checkEligibilityAndQuota('org-1', 'mem-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects when service category is not permitted for restricted beneficiary (D#24)', async () => {
      const futureDate = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
      mockEligibilityRepo.findOne.mockResolvedValue({
        id: 'elig-1',
        status: BeneficiaryEligibilityStatus.ACTIVE,
        reviewDueAt: futureDate,
        monthlyRequestQuota: 8,
        approvedAssistanceCategories: ['cat-elderly', 'cat-medical'],
      });

      await expect(
        service.checkEligibilityAndQuota('org-1', 'mem-1', 'cat-unauthorized'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows service category if specifically in approvedAssistanceCategories', async () => {
      const futureDate = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
      mockEligibilityRepo.findOne.mockResolvedValue({
        id: 'elig-1',
        status: BeneficiaryEligibilityStatus.ACTIVE,
        reviewDueAt: futureDate,
        monthlyRequestQuota: 8,
        approvedAssistanceCategories: ['cat-elderly', 'cat-medical'],
      });
      mockRequestQueryBuilder.getCount.mockResolvedValue(2);

      const result = await service.checkEligibilityAndQuota('org-1', 'mem-1', 'cat-elderly');
      expect(result.eligible).toBe(true);
      expect(result.remainingQuota).toBe(6);
    });
  });

  describe('createCaregiverAuthorization (D#8, D#37)', () => {
    it('creates caregiver authorization in PENDING_REVIEW status', async () => {
      mockMembershipRepo.findOne
        .mockResolvedValueOnce({ id: 'ben-mem', organizationId: 'org-1', status: MembershipStatus.APPROVED })
        .mockResolvedValueOnce({ id: 'cg-mem', organizationId: 'org-1', status: MembershipStatus.APPROVED });
      mockCaregiverAuthRepo.findOne.mockResolvedValue(null);

      const result = await service.createCaregiverAuthorization(
        'org-1',
        {
          beneficiaryMembershipId: 'ben-mem',
          caregiverMembershipId: 'cg-mem',
          relationshipType: CaregiverRelationshipType.FAMILY_CHILD,
          canInitiateRequests: true,
          canVerifyCompletions: true,
        },
        'user-cg-1',
      );

      expect(result.status).toBe(CaregiverAuthorizationStatus.PENDING_REVIEW);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'CAREGIVER_AUTHORIZATION_REQUESTED' }),
      );
    });

    it('throws NotFoundException if beneficiary membership not approved', async () => {
      mockMembershipRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createCaregiverAuthorization(
          'org-1',
          {
            beneficiaryMembershipId: 'missing-ben',
            caregiverMembershipId: 'cg-mem',
            relationshipType: CaregiverRelationshipType.FAMILY_CHILD,
          },
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if beneficiary and caregiver memberships are identical', async () => {
      mockMembershipRepo.findOne
        .mockResolvedValueOnce({ id: 'same-mem', organizationId: 'org-1', status: MembershipStatus.APPROVED })
        .mockResolvedValueOnce({ id: 'same-mem', organizationId: 'org-1', status: MembershipStatus.APPROVED });

      await expect(
        service.createCaregiverAuthorization(
          'org-1',
          {
            beneficiaryMembershipId: 'same-mem',
            caregiverMembershipId: 'same-mem',
            relationshipType: CaregiverRelationshipType.FAMILY_CHILD,
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if caregiver authorization already approved and active', async () => {
      mockMembershipRepo.findOne
        .mockResolvedValueOnce({ id: 'ben-mem', organizationId: 'org-1', status: MembershipStatus.APPROVED })
        .mockResolvedValueOnce({ id: 'cg-mem', organizationId: 'org-1', status: MembershipStatus.APPROVED });
      mockCaregiverAuthRepo.findOne.mockResolvedValue({
        id: 'auth-active',
        status: CaregiverAuthorizationStatus.APPROVED,
      });

      await expect(
        service.createCaregiverAuthorization(
          'org-1',
          {
            beneficiaryMembershipId: 'ben-mem',
            caregiverMembershipId: 'cg-mem',
            relationshipType: CaregiverRelationshipType.FAMILY_CHILD,
          },
          'user-1',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reviewCaregiverAuthorization', () => {
    it('approves caregiver authorization', async () => {
      const existing = {
        id: 'auth-1',
        organizationId: 'org-1',
        status: CaregiverAuthorizationStatus.PENDING_REVIEW,
      };
      mockCaregiverAuthRepo.findOne.mockResolvedValue(existing);

      const result = await service.reviewCaregiverAuthorization(
        'org-1',
        'auth-1',
        { status: CaregiverAuthorizationStatus.APPROVED },
        'user-coord-1',
      );

      expect(result.status).toBe(CaregiverAuthorizationStatus.APPROVED);
      expect(result.approvedByUserId).toBe('user-coord-1');
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'CAREGIVER_AUTHORIZATION_REVIEWED' }),
      );
    });

    it('revokes caregiver authorization with reason', async () => {
      const existing = {
        id: 'auth-1',
        organizationId: 'org-1',
        status: CaregiverAuthorizationStatus.APPROVED,
      };
      mockCaregiverAuthRepo.findOne.mockResolvedValue(existing);

      const result = await service.reviewCaregiverAuthorization(
        'org-1',
        'auth-1',
        { status: CaregiverAuthorizationStatus.REVOKED, revocationReason: 'Family dispute resolved' },
        'user-coord-1',
      );

      expect(result.status).toBe(CaregiverAuthorizationStatus.REVOKED);
      expect(result.revocationReason).toBe('Family dispute resolved');
    });

    it('throws NotFoundException if caregiver authorization not found', async () => {
      mockCaregiverAuthRepo.findOne.mockResolvedValue(null);

      await expect(
        service.reviewCaregiverAuthorization(
          'org-1',
          'missing-auth',
          { status: CaregiverAuthorizationStatus.APPROVED },
          'user-coord-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('verifyCaregiverProxyAccess (AT-M3-06, AT-M3-07)', () => {
    it('permits authorized caregiver with active permission', async () => {
      mockCaregiverAuthRepo.findOne.mockResolvedValue({
        id: 'auth-1',
        status: CaregiverAuthorizationStatus.APPROVED,
        canInitiateRequests: true,
      });

      const result = await service.verifyCaregiverProxyAccess('org-1', 'caregiver-mem', 'ben-mem');
      expect(result.id).toBe('auth-1');
    });

    it('denies proxy access if caregiver authorization was revoked (AT-M3-07)', async () => {
      mockCaregiverAuthRepo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyCaregiverProxyAccess('org-1', 'caregiver-mem', 'ben-mem'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies proxy access if canInitiateRequests is false', async () => {
      mockCaregiverAuthRepo.findOne.mockResolvedValue({
        id: 'auth-1',
        status: CaregiverAuthorizationStatus.APPROVED,
        canInitiateRequests: false,
      });

      await expect(
        service.verifyCaregiverProxyAccess('org-1', 'caregiver-mem', 'ben-mem'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listCaregiversForBeneficiary', () => {
    it('lists caregivers for beneficiary', async () => {
      mockCaregiverAuthRepo.find.mockResolvedValue([{ id: 'auth-1' }]);

      const result = await service.listCaregiversForBeneficiary('org-1', 'ben-mem');
      expect(result).toHaveLength(1);
      expect(mockCaregiverAuthRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', beneficiaryMembershipId: 'ben-mem' } }),
      );
    });
  });
});

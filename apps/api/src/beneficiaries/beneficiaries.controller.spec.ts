import { Test, TestingModule } from '@nestjs/testing';
import { Request } from 'express';
import { BeneficiariesController } from './beneficiaries.controller';
import { BeneficiariesService } from './beneficiaries.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { RolesGuard } from '../authorization/guards/roles.guard';
import {
  BeneficiaryEligibilityStatus,
  BeneficiaryEligibilityType,
  CaregiverAuthorizationStatus,
  CaregiverRelationshipType,
} from '@ktb/shared-types';
import { ReviewCaregiverAuthorizationDto } from './dto/review-caregiver-authorization.dto';

describe('BeneficiariesController', () => {
  let controller: BeneficiariesController;

  const mockBeneficiariesService = {
    grantEligibility: jest.fn(),
    getEligibility: jest.fn(),
    createCaregiverAuthorization: jest.fn(),
    reviewCaregiverAuthorization: jest.fn(),
    listCaregiversForBeneficiary: jest.fn(),
  };

  const mockRequest = {
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as Request;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BeneficiariesController],
      providers: [{ provide: BeneficiariesService, useValue: mockBeneficiariesService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(OrganizationAccessGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BeneficiariesController>(BeneficiariesController);
  });

  describe('grantEligibility (D#24, D#25)', () => {
    it('grants or renews beneficiary eligibility', async () => {
      const dto = {
        membershipId: 'mem-1',
        eligibilityType: BeneficiaryEligibilityType.ONGOING,
        reviewDueAt: '2027-10-18T00:00:00.000Z',
        monthlyRequestQuota: 10,
      };
      mockBeneficiariesService.grantEligibility.mockResolvedValue({
        id: 'elig-1',
        status: BeneficiaryEligibilityStatus.ACTIVE,
        ...dto,
      });

      const result = await controller.grantEligibility('org-1', dto, 'coord-1', mockRequest);
      expect(result).toEqual(
        expect.objectContaining({ id: 'elig-1', status: BeneficiaryEligibilityStatus.ACTIVE }),
      );
      expect(mockBeneficiariesService.grantEligibility).toHaveBeenCalledWith(
        'org-1',
        dto,
        'coord-1',
        '127.0.0.1',
      );
    });
  });

  describe('getEligibility', () => {
    it('retrieves beneficiary eligibility', async () => {
      mockBeneficiariesService.getEligibility.mockResolvedValue({
        id: 'elig-1',
        membershipId: 'mem-1',
      });

      const result = await controller.getEligibility('org-1', 'mem-1', 'user-1');
      expect(result).toEqual({ id: 'elig-1', membershipId: 'mem-1' });
      expect(mockBeneficiariesService.getEligibility).toHaveBeenCalledWith(
        'org-1',
        'mem-1',
        'user-1',
      );
    });
  });

  describe('createCaregiverAuthorization (D#8, D#37)', () => {
    it('submits caregiver proxy request', async () => {
      const dto = {
        beneficiaryMembershipId: 'ben-mem-1',
        caregiverMembershipId: 'cg-mem-1',
        relationshipType: CaregiverRelationshipType.FAMILY_CHILD,
        canInitiateRequests: true,
      };
      mockBeneficiariesService.createCaregiverAuthorization.mockResolvedValue({
        id: 'auth-1',
        status: CaregiverAuthorizationStatus.PENDING_REVIEW,
        ...dto,
      });

      const result = await controller.createCaregiverAuthorization(
        'org-1',
        dto,
        'user-cg-1',
        mockRequest,
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: 'auth-1',
          status: CaregiverAuthorizationStatus.PENDING_REVIEW,
        }),
      );
      expect(mockBeneficiariesService.createCaregiverAuthorization).toHaveBeenCalledWith(
        'org-1',
        dto,
        'user-cg-1',
        '127.0.0.1',
      );
    });
  });

  describe('reviewCaregiverAuthorization', () => {
    it('approves or revokes caregiver authorization', async () => {
      const dto: ReviewCaregiverAuthorizationDto = {
        status: CaregiverAuthorizationStatus.APPROVED,
      };
      mockBeneficiariesService.reviewCaregiverAuthorization.mockResolvedValue({
        id: 'auth-1',
        status: CaregiverAuthorizationStatus.APPROVED,
      });

      const result = await controller.reviewCaregiverAuthorization(
        'org-1',
        'auth-1',
        dto,
        'coord-1',
        mockRequest,
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 'auth-1', status: CaregiverAuthorizationStatus.APPROVED }),
      );
      expect(mockBeneficiariesService.reviewCaregiverAuthorization).toHaveBeenCalledWith(
        'org-1',
        'auth-1',
        dto,
        'coord-1',
        '127.0.0.1',
      );
    });
  });

  describe('listCaregivers', () => {
    it('lists caregivers for beneficiary', async () => {
      mockBeneficiariesService.listCaregiversForBeneficiary.mockResolvedValue([{ id: 'auth-1' }]);

      const result = await controller.listCaregivers('org-1', 'mem-1', 'user-1');
      expect(result).toHaveLength(1);
      expect(mockBeneficiariesService.listCaregiversForBeneficiary).toHaveBeenCalledWith(
        'org-1',
        'mem-1',
        'user-1',
      );
    });
  });
});

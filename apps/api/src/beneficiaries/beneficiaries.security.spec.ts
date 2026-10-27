import { ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserRole, MembershipStatus, RoleGrantStatus, CreationChannel, UrgencyType } from '@ktb/shared-types';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { AuthorizationService } from '../authorization/authorization.service';
import { RequestsService } from '../requests/requests.service';

describe('Milestone 3 Phase B Security & Boundary Invariants', () => {
  let orgAccessGuard: OrganizationAccessGuard;
  let mockAuthzService: jest.Mocked<Partial<AuthorizationService>>;

  beforeEach(() => {
    mockAuthzService = {
      evaluateOrganizationAccess: jest.fn(),
    };
    orgAccessGuard = new OrganizationAccessGuard(
      mockAuthzService as unknown as AuthorizationService,
    );
  });

  describe('Invariant 1: Cross-Tenant Isolation for Beneficiaries and Requests', () => {
    it('denies user from Tenant A accessing Tenant B requests or beneficiary records', async () => {
      (mockAuthzService.evaluateOrganizationAccess as jest.Mock).mockRejectedValue(
        new ForbiddenException('Access denied: User does not belong to organization org-tenant-b'),
      );

      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'tenant-a-user', isSuperAdmin: false },
            params: { orgId: 'org-tenant-b' },
            headers: {},
          }),
        }),
      } as unknown as ExecutionContext;

      await expect(orgAccessGuard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockAuthzService.evaluateOrganizationAccess).toHaveBeenCalledWith(
        'tenant-a-user',
        'org-tenant-b',
      );
    });

    it('requires organization context in route params or headers', async () => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'user-1' },
            params: {},
            headers: {},
          }),
        }),
      } as unknown as ExecutionContext;

      await expect(orgAccessGuard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Invariant 2: Caregiver Proxy and Beneficiary Role Invariants', () => {
    let requestsService: RequestsService;
    let mockRequestRepo: any;
    let mockCatalogRepo: any;
    let mockMembershipRepo: any;
    let mockOrgRepo: any;
    let mockBeneficiariesService: any;
    let mockMatchingService: any;
    let mockAuditService: any;

    beforeEach(() => {
      mockRequestRepo = {
        create: jest.fn((dto) => ({ id: 'req-1', ...dto })),
        save: jest.fn((entity) => Promise.resolve(entity)),
      };
      mockCatalogRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'cat-1',
          isEnabled: true,
          minVolunteers: 1,
          preferredVolunteers: 1,
          globalService: { categoryId: 'cat-id-1' },
        }),
      };
      mockMembershipRepo = {
        findOne: jest.fn(),
      };
      mockOrgRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'org-1', code: 'KZK' }),
      };
      mockBeneficiariesService = {
        checkEligibilityAndQuota: jest.fn().mockResolvedValue({ eligible: true }),
        verifyCaregiverProxyAccess: jest.fn(),
      };
      mockMatchingService = {
        findCandidatesAndDispatchOffers: jest.fn().mockResolvedValue([]),
      };
      mockAuditService = {
        logEvent: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      };

      requestsService = new RequestsService(
        mockRequestRepo,
        {} as any,
        {} as any,
        mockCatalogRepo,
        mockMembershipRepo,
        mockOrgRepo,
        {} as any,
        mockBeneficiariesService,
        mockMatchingService,
        mockAuditService,
      );
    });

    it('denies direct request creation if user has volunteer role only (no BENEFICIARY role)', async () => {
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'mem-vol-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.VOLUNTEER, status: RoleGrantStatus.ACTIVE }],
      });

      await expect(
        requestsService.createRequest('org-1', 'user-vol-1', {
          serviceCatalogId: 'cat-1',
          urgency: UrgencyType.IMMEDIATE,
          scheduledStartTime: new Date().toISOString(),
          locationAddressText: 'Location Address',
          locationWardNumber: '1',
          locationPostalCode: '676503',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies caregiver proxy if caregiver authorization was revoked or denied', async () => {
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'cg-mem-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
      });
      mockBeneficiariesService.verifyCaregiverProxyAccess.mockRejectedValue(
        new ForbiddenException('Active caregiver authorization not found'),
      );

      await expect(
        requestsService.createRequest('org-1', 'user-cg-1', {
          serviceCatalogId: 'cat-1',
          beneficiaryMembershipId: 'ben-mem-1',
          creationChannel: CreationChannel.CAREGIVER_PROXY,
          urgency: UrgencyType.SCHEDULED,
          scheduledStartTime: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          locationAddressText: 'Location Address',
          locationWardNumber: '1',
          locationPostalCode: '676503',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies request initiation when beneficiary monthly quota is exceeded', async () => {
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
        requestsService.createRequest('org-1', 'user-ben-1', {
          serviceCatalogId: 'cat-1',
          urgency: UrgencyType.IMMEDIATE,
          scheduledStartTime: new Date().toISOString(),
          locationAddressText: 'Location Address',
          locationWardNumber: '1',
          locationPostalCode: '676503',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

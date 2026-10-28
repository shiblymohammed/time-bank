import { ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@ktb/shared-types';
import { RolesGuard } from '../authorization/guards/roles.guard';
import { OrganizationAccessGuard } from '../authorization/guards/organization-access.guard';
import { AuthorizationService } from '../authorization/authorization.service';

describe('Milestone 3 Phase A Security & Boundary Invariants', () => {
  let rolesGuard: RolesGuard;
  let reflector: Reflector;
  let orgAccessGuard: OrganizationAccessGuard;
  let mockAuthzService: jest.Mocked<Partial<AuthorizationService>>;

  beforeEach(() => {
    reflector = new Reflector();

    mockAuthzService = {
      evaluateOrganizationAccess: jest.fn(),
      assertGlobalSuperAdmin: jest.fn().mockResolvedValue(undefined),
    };
    rolesGuard = new RolesGuard(reflector, mockAuthzService as AuthorizationService);
    orgAccessGuard = new OrganizationAccessGuard(
      mockAuthzService as unknown as AuthorizationService,
    );
  });

  describe('Invariant 1: Local organization admin cannot create or approve global service without central approval', () => {
    it('denies local municipality admin from calling central Super Admin endpoint', async () => {
      // Mock route metadata specifying @Roles(UserRole.SUPER_ADMIN)
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.SUPER_ADMIN]);

      // Execution context with local org admin (isSuperAdmin = false, role = MUNICIPALITY_ADMIN)
      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'local-admin-1', isSuperAdmin: false, roles: [] },
            organizationMembership: {
              organizationId: 'org-kozhikode-1',
              roles: [UserRole.MUNICIPALITY_ADMIN],
              isSuperAdmin: false,
            },
          }),
        }),
      } as unknown as ExecutionContext;

      await expect(rolesGuard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('denies local coordinator from calling central proposal review endpoint', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.SUPER_ADMIN]);

      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'local-coord-1', isSuperAdmin: false, roles: [] },
            organizationMembership: {
              organizationId: 'org-kozhikode-1',
              roles: [UserRole.COORDINATOR],
              isSuperAdmin: false,
            },
          }),
        }),
      } as unknown as ExecutionContext;

      await expect(rolesGuard.canActivate(mockExecutionContext)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows central Super Admin to access central catalogue endpoints', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.SUPER_ADMIN]);

      const mockExecutionContext = {
        getHandler: jest.fn(),
        getClass: jest.fn(),
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'super-admin-user', isSuperAdmin: true, roles: [UserRole.SUPER_ADMIN] },
          }),
        }),
      } as unknown as ExecutionContext;

      const canActivate = await rolesGuard.canActivate(mockExecutionContext);
      expect(canActivate).toBe(true);
    });
  });

  describe('Invariant 2: Tenant A cannot mutate Tenant B catalogue configuration', () => {
    it('OrganizationAccessGuard throws ForbiddenException when Tenant A user accesses Tenant B route', async () => {
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

    it('OrganizationAccessGuard requires organization context', async () => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'tenant-a-user' },
            params: {},
            headers: {},
          }),
        }),
      } as unknown as ExecutionContext;

      await expect(orgAccessGuard.canActivate(mockExecutionContext)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('allows valid tenant member to access their own organization route', async () => {
      (mockAuthzService.evaluateOrganizationAccess as jest.Mock).mockResolvedValue({
        organizationId: 'org-tenant-a',
        membershipId: 'mem-1',
        membershipNumber: 'MEM-0001',
        status: 'APPROVED' as any,
        roles: [UserRole.MUNICIPALITY_ADMIN],
        isSuperAdmin: false,
        isMunicipalityAdmin: true,
        isCoordinator: false,
        isVolunteer: false,
        isBeneficiary: false,
      });

      const mockReq: any = {
        user: { id: 'tenant-a-user', isSuperAdmin: false },
        params: { orgId: 'org-tenant-a' },
        headers: {},
      };

      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
      } as unknown as ExecutionContext;

      const result = await orgAccessGuard.canActivate(mockExecutionContext);
      expect(result).toBe(true);
      expect(mockReq.organizationMembership.organizationId).toBe('org-tenant-a');
    });
  });
});

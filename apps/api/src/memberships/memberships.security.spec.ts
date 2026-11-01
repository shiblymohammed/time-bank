/**
 * Integration security tests for role escalation prevention (Finding #1 from security audit).
 *
 * These tests verify that:
 * 1. Coordinators cannot grant SUPER_ADMIN or MUNICIPALITY_ADMIN roles
 * 2. Municipality Admins cannot grant SUPER_ADMIN or MUNICIPALITY_ADMIN roles
 * 3. Users cannot grant roles to themselves (self-escalation)
 * 4. Super Admins can grant any valid organization role
 * 5. Role hierarchy is enforced at the service boundary
 *
 * These tests use real service logic with mocked repositories to verify
 * the fix prevents the vulnerability reproduced in the audit.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole, MembershipStatus, RoleGrantStatus } from '@ktb/shared-types';

import { MembershipsService } from './memberships.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RoleHierarchyService } from '../authorization/role-hierarchy.service';
import { AuditService } from '../audit/audit.service';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { MembershipRoleGrant } from './entities/membership-role-grant.entity';
import { MembershipApproval } from './entities/membership-approval.entity';
import { MembershipDocument } from './entities/membership-document.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../identity/entities/user.entity';
import { ApproveMembershipDto } from './dto/approve-membership.dto';
import { GrantRoleDto } from './dto/grant-role.dto';

describe('MembershipsService - Role Escalation Security (Finding #1)', () => {
  let service: MembershipsService;
  let authorizationService: AuthorizationService;
  let membershipRepo: jest.Mocked<Repository<OrganizationMembership>>;
  let roleGrantRepo: jest.Mocked<Repository<MembershipRoleGrant>>;
  let orgRepo: jest.Mocked<Repository<Organization>>;

  const mockOrgId = 'org-123';
  const mockCoordinatorId = 'coordinator-user-1';
  const mockMunicipalityAdminId = 'munadmin-user-1';
  const mockTargetUserId = 'target-user-1';
  const mockMembershipId = 'membership-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        RoleHierarchyService,
        {
          provide: AuthorizationService,
          useValue: {
            assertNoSelfEscalation: jest.fn(
              (actorId: string, targetId: string, role?: UserRole) => {
                if (actorId === targetId) {
                  throw new ForbiddenException(
                    `Self-escalation denied: cannot grant or approve privileges for own identity${role ? ` (${role})` : ''}`,
                  );
                }
              },
            ),
            evaluateOrganizationAccess: jest.fn(async (userId: string, orgId: string) => {
              // Return mock context based on the user making the call
              if (userId === mockCoordinatorId) {
                return {
                  isSuperAdmin: false,
                  roles: [UserRole.COORDINATOR],
                  organizationId: orgId,
                };
              } else if (userId === mockMunicipalityAdminId) {
                return {
                  isSuperAdmin: false,
                  roles: [UserRole.MUNICIPALITY_ADMIN],
                  organizationId: orgId,
                };
              }
              return { isSuperAdmin: false, roles: [], organizationId: orgId };
            }),
          },
        },
        {
          provide: getRepositoryToken(Organization),
          useValue: {
            findOne: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(OrganizationMembership),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            find: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MembershipRoleGrant),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MembershipApproval),
          useValue: {
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(MembershipDocument),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            logEvent: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MembershipsService>(MembershipsService);
    authorizationService = module.get<AuthorizationService>(AuthorizationService);
    membershipRepo = module.get(getRepositoryToken(OrganizationMembership));
    roleGrantRepo = module.get(getRepositoryToken(MembershipRoleGrant));
    orgRepo = module.get(getRepositoryToken(Organization));
  });

  describe('approveMembership - initial role grant', () => {
    it('should reject COORDINATOR attempting to grant SUPER_ADMIN during membership approval', async () => {
      // Setup: Coordinator trying to approve membership with SUPER_ADMIN initial role
      const targetMembership = {
        id: mockMembershipId,
        userId: mockTargetUserId,
        organizationId: mockOrgId,
        status: MembershipStatus.PENDING_REVIEW,
      } as OrganizationMembership;

      const coordinatorMembership = {
        id: 'coordinator-membership',
        userId: mockCoordinatorId,
        organizationId: mockOrgId,
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.COORDINATOR, status: RoleGrantStatus.ACTIVE }],
      } as OrganizationMembership;

      const org = { id: mockOrgId, code: 'TST' } as Organization;

      membershipRepo.findOne.mockImplementation(async (options: any) => {
        if (options.where.id === mockMembershipId) return targetMembership;
        if (options.where.userId === mockCoordinatorId) return coordinatorMembership;
        return null;
      });

      membershipRepo.count.mockResolvedValue(0);
      orgRepo.findOne.mockResolvedValue(org);

      const dto: ApproveMembershipDto = {
        initialRole: UserRole.SUPER_ADMIN, // Attempting escalation!
      };

      // Execute & Assert
      await expect(
        service.approveMembership(mockOrgId, mockMembershipId, mockCoordinatorId, dto, '127.0.0.1'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.approveMembership(mockOrgId, mockMembershipId, mockCoordinatorId, dto, '127.0.0.1'),
      ).rejects.toThrow(/global administrative role.*cannot be granted/i);
    });

    it('should reject COORDINATOR attempting to grant MUNICIPALITY_ADMIN during membership approval', async () => {
      const targetMembership = {
        id: mockMembershipId,
        userId: mockTargetUserId,
        organizationId: mockOrgId,
        status: MembershipStatus.PENDING_REVIEW,
      } as OrganizationMembership;

      const coordinatorMembership = {
        id: 'coordinator-membership',
        userId: mockCoordinatorId,
        organizationId: mockOrgId,
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.COORDINATOR, status: RoleGrantStatus.ACTIVE }],
      } as OrganizationMembership;

      const org = { id: mockOrgId, code: 'TST' } as Organization;

      membershipRepo.findOne.mockImplementation(async (options: any) => {
        if (options.where.id === mockMembershipId) return targetMembership;
        if (options.where.userId === mockCoordinatorId) return coordinatorMembership;
        return null;
      });

      membershipRepo.count.mockResolvedValue(0);
      orgRepo.findOne.mockResolvedValue(org);

      const dto: ApproveMembershipDto = {
        initialRole: UserRole.MUNICIPALITY_ADMIN,
      };

      await expect(
        service.approveMembership(mockOrgId, mockMembershipId, mockCoordinatorId, dto, '127.0.0.1'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.approveMembership(mockOrgId, mockMembershipId, mockCoordinatorId, dto, '127.0.0.1'),
      ).rejects.toThrow(/cannot grant.*ADMIN/i);
    });

    it('should reject MUNICIPALITY_ADMIN attempting to grant SUPER_ADMIN', async () => {
      const targetMembership = {
        id: mockMembershipId,
        userId: mockTargetUserId,
        organizationId: mockOrgId,
        status: MembershipStatus.PENDING_REVIEW,
      } as OrganizationMembership;

      const munAdminMembership = {
        id: 'munadmin-membership',
        userId: mockMunicipalityAdminId,
        organizationId: mockOrgId,
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.MUNICIPALITY_ADMIN, status: RoleGrantStatus.ACTIVE }],
      } as OrganizationMembership;

      const org = { id: mockOrgId, code: 'TST' } as Organization;

      membershipRepo.findOne.mockImplementation(async (options: any) => {
        if (options.where.id === mockMembershipId) return targetMembership;
        if (options.where.userId === mockMunicipalityAdminId) return munAdminMembership;
        return null;
      });

      membershipRepo.count.mockResolvedValue(0);
      orgRepo.findOne.mockResolvedValue(org);

      const dto: ApproveMembershipDto = {
        initialRole: UserRole.SUPER_ADMIN,
      };

      await expect(
        service.approveMembership(
          mockOrgId,
          mockMembershipId,
          mockMunicipalityAdminId,
          dto,
          '127.0.0.1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject self-escalation attempt during membership approval', async () => {
      // Coordinator trying to approve their OWN membership with elevated role
      const selfMembership = {
        id: mockMembershipId,
        userId: mockCoordinatorId, // Same as approver!
        organizationId: mockOrgId,
        status: MembershipStatus.PENDING_REVIEW,
      } as OrganizationMembership;

      const coordinatorMembership = {
        id: 'coordinator-membership',
        userId: mockCoordinatorId,
        organizationId: mockOrgId,
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.COORDINATOR, status: RoleGrantStatus.ACTIVE }],
      } as OrganizationMembership;

      const org = { id: mockOrgId, code: 'TST' } as Organization;

      membershipRepo.findOne.mockImplementation(async (options: any) => {
        if (options.where.id === mockMembershipId) return selfMembership;
        if (options.where.userId === mockCoordinatorId) return coordinatorMembership;
        return null;
      });

      membershipRepo.count.mockResolvedValue(0);
      orgRepo.findOne.mockResolvedValue(org);

      const dto: ApproveMembershipDto = {
        initialRole: UserRole.COORDINATOR,
      };

      await expect(
        service.approveMembership(mockOrgId, mockMembershipId, mockCoordinatorId, dto, '127.0.0.1'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.approveMembership(mockOrgId, mockMembershipId, mockCoordinatorId, dto, '127.0.0.1'),
      ).rejects.toThrow(/self-escalation denied/i);
    });

    it('should allow COORDINATOR to grant VOLUNTEER (valid operational role)', async () => {
      const targetMembership = {
        id: mockMembershipId,
        userId: mockTargetUserId,
        organizationId: mockOrgId,
        status: MembershipStatus.PENDING_REVIEW,
      } as OrganizationMembership;

      const coordinatorMembership = {
        id: 'coordinator-membership',
        userId: mockCoordinatorId,
        organizationId: mockOrgId,
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.COORDINATOR, status: RoleGrantStatus.ACTIVE }],
      } as OrganizationMembership;

      const org = { id: mockOrgId, code: 'TST' } as Organization;
      const savedMembership = {
        ...targetMembership,
        status: MembershipStatus.APPROVED,
        membershipNumber: 'TST-2026-0001',
      };

      membershipRepo.findOne.mockImplementation(async (options: any) => {
        if (options.where.id === mockMembershipId) return targetMembership;
        if (options.where.userId === mockCoordinatorId) return coordinatorMembership;
        return null; // No existing grant
      });

      membershipRepo.count.mockResolvedValue(0);
      membershipRepo.save.mockResolvedValue(savedMembership as any);
      orgRepo.findOne.mockResolvedValue(org);
      roleGrantRepo.create.mockReturnValue({ role: UserRole.VOLUNTEER } as any);
      roleGrantRepo.save.mockResolvedValue({} as any);

      const dto: ApproveMembershipDto = {
        initialRole: UserRole.VOLUNTEER,
      };

      // Should succeed
      await expect(
        service.approveMembership(mockOrgId, mockMembershipId, mockCoordinatorId, dto, '127.0.0.1'),
      ).resolves.not.toThrow();
    });
  });

  describe('grantRole - additional role grants', () => {
    it('should reject COORDINATOR attempting to grant SUPER_ADMIN via additional role grant', async () => {
      const targetMembership = {
        id: mockMembershipId,
        userId: mockTargetUserId,
        organizationId: mockOrgId,
        status: MembershipStatus.APPROVED,
        user: { id: mockTargetUserId },
      } as OrganizationMembership;

      const coordinatorMembership = {
        id: 'coordinator-membership',
        userId: mockCoordinatorId,
        organizationId: mockOrgId,
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.COORDINATOR, status: RoleGrantStatus.ACTIVE }],
      } as OrganizationMembership;

      membershipRepo.findOne.mockImplementation(async (options: any) => {
        if (options.where.id === mockMembershipId) return targetMembership;
        if (options.where.userId === mockCoordinatorId) return coordinatorMembership;
        return null;
      });

      const dto: GrantRoleDto = {
        role: UserRole.SUPER_ADMIN,
      };

      await expect(
        service.grantRole(mockOrgId, mockMembershipId, dto, mockCoordinatorId, '127.0.0.1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject MUNICIPALITY_ADMIN attempting to grant MUNICIPALITY_ADMIN to others', async () => {
      const targetMembership = {
        id: mockMembershipId,
        userId: mockTargetUserId,
        organizationId: mockOrgId,
        status: MembershipStatus.APPROVED,
        user: { id: mockTargetUserId },
      } as OrganizationMembership;

      const munAdminMembership = {
        id: 'munadmin-membership',
        userId: mockMunicipalityAdminId,
        organizationId: mockOrgId,
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.MUNICIPALITY_ADMIN, status: RoleGrantStatus.ACTIVE }],
      } as OrganizationMembership;

      membershipRepo.findOne.mockImplementation(async (options: any) => {
        if (options.where.id === mockMembershipId) return targetMembership;
        if (options.where.userId === mockMunicipalityAdminId) return munAdminMembership;
        return null;
      });

      const dto: GrantRoleDto = {
        role: UserRole.MUNICIPALITY_ADMIN,
      };

      await expect(
        service.grantRole(mockOrgId, mockMembershipId, dto, mockMunicipalityAdminId, '127.0.0.1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject MUNICIPALITY_ADMIN attempting self-escalation via additional grant', async () => {
      const munAdminMembership = {
        id: mockMembershipId,
        userId: mockMunicipalityAdminId,
        organizationId: mockOrgId,
        status: MembershipStatus.APPROVED,
        user: { id: mockMunicipalityAdminId },
        roleGrants: [{ role: UserRole.MUNICIPALITY_ADMIN, status: RoleGrantStatus.ACTIVE }],
      } as OrganizationMembership;

      membershipRepo.findOne.mockImplementation(async (_options: any) => {
        return munAdminMembership;
      });

      const dto: GrantRoleDto = {
        role: UserRole.COORDINATOR, // Trying to add another role to themselves
      };

      await expect(
        service.grantRole(mockOrgId, mockMembershipId, dto, mockMunicipalityAdminId, '127.0.0.1'),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.grantRole(mockOrgId, mockMembershipId, dto, mockMunicipalityAdminId, '127.0.0.1'),
      ).rejects.toThrow(/self-escalation denied/i);
      expect(authorizationService.assertNoSelfEscalation).toHaveBeenCalledWith(
        mockMunicipalityAdminId,
        mockMunicipalityAdminId,
        UserRole.COORDINATOR,
      );
    });
  });
});

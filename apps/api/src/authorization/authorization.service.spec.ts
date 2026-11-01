import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import {
  AccountStatus,
  MembershipStatus,
  RoleGrantStatus,
  UserRole,
  OrganizationStatus,
  GlobalRestrictionStatus,
  GlobalRestrictionType,
} from '@ktb/shared-types';
import { AuthorizationService } from './authorization.service';
import { User } from '../identity/entities/user.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { MembershipRoleGrant } from '../memberships/entities/membership-role-grant.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';

describe('AuthorizationService', () => {
  let service: AuthorizationService;

  const mockUserRepo = {
    findOne: jest.fn(),
  };
  const mockOrgRepo = {
    findOne: jest.fn(),
  };
  const mockMembershipRepo = {
    findOne: jest.fn(),
  };
  const mockRoleGrantRepo = {
    createQueryBuilder: jest.fn(),
  };
  const mockRestrictionRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthorizationService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: mockMembershipRepo },
        { provide: getRepositoryToken(MembershipRoleGrant), useValue: mockRoleGrantRepo },
        { provide: getRepositoryToken(GlobalAccountRestriction), useValue: mockRestrictionRepo },
      ],
    }).compile();

    service = module.get<AuthorizationService>(AuthorizationService);
  });

  const userId = 'user-uuid-1';
  const kozhikodeOrgId = 'org-kozhikode-uuid';
  const kottakkalOrgId = 'org-kottakkal-uuid';

  describe('evaluateGlobalAccess()', () => {
    it('requires an active account even with a previously issued token', async () => {
      mockUserRepo.findOne.mockResolvedValue({ status: AccountStatus.SUSPENDED });
      await expect(service.evaluateGlobalAccess(userId)).rejects.toThrow(ForbiddenException);
    });
    it('rejects a current global restriction', async () => {
      mockUserRepo.findOne.mockResolvedValue({ status: AccountStatus.ACTIVE });
      mockRestrictionRepo.findOne.mockResolvedValue({ status: GlobalRestrictionStatus.ACTIVE });
      await expect(service.evaluateGlobalAccess(userId)).rejects.toThrow(ForbiddenException);
    });
    it.each([true, false])(
      'checks current approved Super Admin grants (grant exists: %s)',
      async (exists) => {
        mockUserRepo.findOne.mockResolvedValue({ status: AccountStatus.ACTIVE });
        mockRestrictionRepo.findOne.mockResolvedValue(null);
        const qb = {
          innerJoin: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(exists ? {} : null),
        };
        mockRoleGrantRepo.createQueryBuilder.mockReturnValue(qb);
        const result = service.evaluateGlobalAccess(userId);
        await expect(result).resolves.toEqual({
          isSuperAdmin: exists,
          roles: exists ? [UserRole.SUPER_ADMIN] : [],
        });
        expect(qb.andWhere).toHaveBeenCalledWith('m.status = :mStatus', {
          mStatus: MembershipStatus.APPROVED,
        });
        expect(qb.andWhere).toHaveBeenCalledWith('grant.status = :status', {
          status: RoleGrantStatus.ACTIVE,
        });
      },
    );
  });

  describe('evaluateOrganizationAccess()', () => {
    it('should grant access and return roles for an approved member in active organization', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: userId,
        status: AccountStatus.ACTIVE,
      });
      mockRestrictionRepo.findOne.mockResolvedValue(null);
      mockOrgRepo.findOne.mockResolvedValue({
        id: kozhikodeOrgId,
        status: OrganizationStatus.ACTIVE,
      });
      mockRoleGrantRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'membership-1',
        userId,
        organizationId: kozhikodeOrgId,
        status: MembershipStatus.APPROVED,
        roleGrants: [
          { role: UserRole.VOLUNTEER, status: RoleGrantStatus.ACTIVE },
          { role: UserRole.COORDINATOR, status: RoleGrantStatus.REVOKED },
        ],
      });

      const result = await service.evaluateOrganizationAccess(userId, kozhikodeOrgId);

      expect(result.userId).toBe(userId);
      expect(result.organizationId).toBe(kozhikodeOrgId);
      expect(result.membershipStatus).toBe(MembershipStatus.APPROVED);
      expect(result.roles).toEqual([UserRole.VOLUNTEER]);
      expect(result.isSuperAdmin).toBe(false);
    });

    it('should deny access if user is not a member of the organization (AT-M2-04)', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: userId,
        status: AccountStatus.ACTIVE,
      });
      mockRestrictionRepo.findOne.mockResolvedValue(null);
      mockOrgRepo.findOne.mockResolvedValue({
        id: kottakkalOrgId,
        status: OrganizationStatus.ACTIVE,
      });
      mockRoleGrantRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });
      // User is not a member in Kottakkal
      mockMembershipRepo.findOne.mockResolvedValue(null);

      await expect(service.evaluateOrganizationAccess(userId, kottakkalOrgId)).rejects.toThrow(
        new ForbiddenException('Not a member of this organization'),
      );
    });

    it('should deny access if membership is pending review or applied', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: userId,
        status: AccountStatus.ACTIVE,
      });
      mockRestrictionRepo.findOne.mockResolvedValue(null);
      mockOrgRepo.findOne.mockResolvedValue({
        id: kozhikodeOrgId,
        status: OrganizationStatus.ACTIVE,
      });
      mockRoleGrantRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'membership-1',
        userId,
        organizationId: kozhikodeOrgId,
        status: MembershipStatus.APPLIED,
        roleGrants: [],
      });

      await expect(service.evaluateOrganizationAccess(userId, kozhikodeOrgId)).rejects.toThrow(
        new ForbiddenException('Membership in this organization is applied'),
      );
    });

    it('should deny access across all organizations if global account has an active restriction (AT-M2-11)', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: userId,
        status: AccountStatus.ACTIVE,
      });
      mockRestrictionRepo.findOne.mockResolvedValue({
        id: 'restr-1',
        userId,
        restrictionType: GlobalRestrictionType.PERMANENT_BAN,
        status: GlobalRestrictionStatus.ACTIVE,
      });

      await expect(service.evaluateOrganizationAccess(userId, kozhikodeOrgId)).rejects.toThrow(
        new ForbiddenException('Global account restriction active: PERMANENT_BAN'),
      );
    });

    it('should deny access if organization is inactive or suspended (AT-M2-15)', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: userId,
        status: AccountStatus.ACTIVE,
      });
      mockRestrictionRepo.findOne.mockResolvedValue(null);
      mockOrgRepo.findOne.mockResolvedValue({
        id: kozhikodeOrgId,
        status: OrganizationStatus.SUSPENDED,
      });

      await expect(service.evaluateOrganizationAccess(userId, kozhikodeOrgId)).rejects.toThrow(
        new ForbiddenException('Organization is suspended'),
      );
    });

    it('should grant universal access to Super Admin even without explicit local membership', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: userId,
        status: AccountStatus.ACTIVE,
      });
      mockRestrictionRepo.findOne.mockResolvedValue(null);
      mockOrgRepo.findOne.mockResolvedValue({
        id: kottakkalOrgId,
        status: OrganizationStatus.ACTIVE,
      });
      mockRoleGrantRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ role: UserRole.SUPER_ADMIN }),
      });
      mockMembershipRepo.findOne.mockResolvedValue(null);

      const result = await service.evaluateOrganizationAccess(userId, kottakkalOrgId);

      expect(result.isSuperAdmin).toBe(true);
      expect(result.roles).toContain(UserRole.SUPER_ADMIN);
    });
  });

  describe('hasRoleInOrganization()', () => {
    it('should return true when user possesses required role in tenant (AT-M2-06)', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: userId, status: AccountStatus.ACTIVE });
      mockRestrictionRepo.findOne.mockResolvedValue(null);
      mockOrgRepo.findOne.mockResolvedValue({
        id: kozhikodeOrgId,
        status: OrganizationStatus.ACTIVE,
      });
      mockRoleGrantRepo.createQueryBuilder.mockReturnValue({
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      });
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'mem-1',
        status: MembershipStatus.APPROVED,
        roleGrants: [{ role: UserRole.COORDINATOR, status: RoleGrantStatus.ACTIVE }],
      });

      const hasCoordinator = await service.hasRoleInOrganization(userId, kozhikodeOrgId, [
        UserRole.COORDINATOR,
      ]);
      const hasAdmin = await service.hasRoleInOrganization(userId, kozhikodeOrgId, [
        UserRole.MUNICIPALITY_ADMIN,
      ]);

      expect(hasCoordinator).toBe(true);
      expect(hasAdmin).toBe(false);
    });
  });

  describe('assertNoSelfEscalation()', () => {
    it('should throw ForbiddenException if actorId equals targetUserId (AT-M2-09)', () => {
      expect(() =>
        service.assertNoSelfEscalation('actor-1', 'actor-1', UserRole.COORDINATOR),
      ).toThrow(
        new ForbiddenException(
          'Self-escalation denied: cannot grant or approve privileges for own identity (COORDINATOR)',
        ),
      );
    });

    it('should not throw if actorId is different from targetUserId', () => {
      expect(() =>
        service.assertNoSelfEscalation('admin-1', 'volunteer-2', UserRole.COORDINATOR),
      ).not.toThrow();
    });
  });
});

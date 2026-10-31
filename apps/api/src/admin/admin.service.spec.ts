import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import {
  AccountStatus,
  GlobalRestrictionStatus,
  GlobalRestrictionType,
  MembershipStatus,
  OrganizationStatus,
  RoleGrantStatus,
  UserRole,
} from '@ktb/shared-types';

import { AdminService } from './admin.service';
import { User } from '../identity/entities/user.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { MembershipRoleGrant } from '../memberships/entities/membership-role-grant.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RoleHierarchyService } from '../authorization/role-hierarchy.service';

describe('AdminService', () => {
  let service: AdminService;

  const mockUserRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockWalletRepo = {
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockRestrictionRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockOrgRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockMembershipRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockRoleGrantRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAuditService = {
    logEvent: jest.fn().mockResolvedValue(undefined),
    queryEvents: jest.fn().mockResolvedValue({ events: [], total: 0 }),
  };

  const mockAuthorizationService = {
    evaluateGlobalAccess: jest
      .fn()
      .mockResolvedValue({ isSuperAdmin: true, roles: [UserRole.SUPER_ADMIN] }),
    assertNoSelfEscalation: jest.fn(),
    evaluateOrganizationAccess: jest.fn().mockResolvedValue({
      isSuperAdmin: true,
      roles: [UserRole.SUPER_ADMIN],
      organizationId: 'org-123',
    }),
  };

  const mockRoleHierarchyService = {
    assertCanGrantRole: jest.fn(),
    assertValidMembershipRole: jest.fn(),
    isOperationalRole: jest.fn().mockReturnValue(true),
    requiresSuperAdminToGrant: jest.fn().mockReturnValue(false),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(UniversalTimeWallet), useValue: mockWalletRepo },
        { provide: getRepositoryToken(GlobalAccountRestriction), useValue: mockRestrictionRepo },
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: mockMembershipRepo },
        { provide: getRepositoryToken(MembershipRoleGrant), useValue: mockRoleGrantRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: AuthorizationService, useValue: mockAuthorizationService },
        { provide: RoleHierarchyService, useValue: mockRoleHierarchyService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOverviewMetrics', () => {
    it('should aggregate platform-wide overview metrics', async () => {
      mockUserRepo.count.mockResolvedValue(150);
      mockOrgRepo.count
        .mockResolvedValueOnce(3) // total orgs
        .mockResolvedValueOnce(2); // active orgs
      mockWalletRepo.count.mockResolvedValue(150);

      const qb = {
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ totalBalance: '2540.50' }),
      };
      mockWalletRepo.createQueryBuilder.mockReturnValue(qb);
      mockMembershipRepo.count.mockResolvedValue(12);

      const res = await service.getOverviewMetrics();

      expect(res.totalUsers).toBe(150);
      expect(res.totalOrganizations).toBe(3);
      expect(res.activeOrganizations).toBe(2);
      expect(res.totalUniversalWallets).toBe(150);
      expect(res.totalBalanceCredits).toBe(2540.5);
      expect(res.pendingMemberships).toBe(12);
    });
  });

  describe('imposeRestriction', () => {
    it('should throw BadRequestException if admin restricts self', async () => {
      await expect(
        service.imposeRestriction(
          {
            userId: 'admin-1',
            restrictionType: GlobalRestrictionType.PERMANENT_BAN,
            reasonCode: 'TEST',
          },
          'admin-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if target user is not found', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.imposeRestriction(
          {
            userId: 'target-1',
            restrictionType: GlobalRestrictionType.PERMANENT_BAN,
            reasonCode: 'TEST',
          },
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should impose permanent ban, update user status, and record audit event', async () => {
      const user = { id: 'target-1', status: AccountStatus.ACTIVE };
      mockUserRepo.findOne.mockResolvedValueOnce(user);
      mockUserRepo.save.mockResolvedValueOnce(user);

      mockRestrictionRepo.create.mockImplementation((dto) => ({ id: 'r-1', ...dto }));
      mockRestrictionRepo.save.mockImplementation((r) => Promise.resolve(r));

      const res = await service.imposeRestriction(
        {
          userId: 'target-1',
          restrictionType: GlobalRestrictionType.PERMANENT_BAN,
          reasonCode: 'FRAUD_SUSPICION',
        },
        'admin-1',
      );

      expect(res.id).toBe('r-1');
      expect(user.status).toBe(AccountStatus.PERMANENTLY_BANNED);
      expect(mockUserRepo.save).toHaveBeenCalledWith(user);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'GLOBAL_RESTRICTION_IMPOSED' }),
      );
    });
  });

  describe('resolveRestriction', () => {
    it('should throw NotFoundException if restriction not found', async () => {
      mockRestrictionRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.resolveRestriction('missing-r', { resolutionNotes: 'resolved' }, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if restriction is not active', async () => {
      mockRestrictionRepo.findOne.mockResolvedValueOnce({
        id: 'r-1',
        status: GlobalRestrictionStatus.RESOLVED,
      });

      await expect(
        service.resolveRestriction('r-1', { resolutionNotes: 'already done' }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should resolve restriction, restore user status if no other active restrictions, and audit', async () => {
      const restriction = {
        id: 'r-1',
        userId: 'user-1',
        status: GlobalRestrictionStatus.ACTIVE,
      };
      mockRestrictionRepo.findOne.mockResolvedValueOnce(restriction);
      mockRestrictionRepo.save.mockImplementation((r) => Promise.resolve(r));
      mockRestrictionRepo.count.mockResolvedValueOnce(0); // no other active

      const user = { id: 'user-1', status: AccountStatus.SUSPENDED };
      mockUserRepo.findOne.mockResolvedValueOnce(user);
      mockUserRepo.save.mockResolvedValueOnce(user);

      const res = await service.resolveRestriction(
        'r-1',
        { resolutionNotes: 'Documents cleared' },
        'admin-1',
      );

      expect(res.status).toBe(GlobalRestrictionStatus.RESOLVED);
      expect(user.status).toBe(AccountStatus.ACTIVE);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'GLOBAL_RESTRICTION_RESOLVED' }),
      );
    });
  });

  describe('updateOrganizationStatus', () => {
    it('should throw NotFoundException if organization not found', async () => {
      mockOrgRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateOrganizationStatus(
          'missing-org',
          { status: OrganizationStatus.ACTIVE },
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update organization status and log audit event', async () => {
      const org = { id: 'org-1', status: OrganizationStatus.DRAFT };
      mockOrgRepo.findOne.mockResolvedValueOnce(org);
      mockOrgRepo.save.mockImplementation((o) => Promise.resolve(o));

      const res = await service.updateOrganizationStatus(
        'org-1',
        { status: OrganizationStatus.ACTIVE, reason: 'Approved by board' },
        'admin-1',
      );

      expect(res.status).toBe(OrganizationStatus.ACTIVE);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'ORGANIZATION_STATUS_CHANGED' }),
      );
    });
  });

  describe('grantOrganizationRole', () => {
    it('should throw NotFoundException if organization or user not found', async () => {
      mockOrgRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.grantOrganizationRole(
          'org-1',
          { userId: 'u-1', role: UserRole.COORDINATOR },
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user already has an active grant', async () => {
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1' });
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'u-1' });
      mockMembershipRepo.findOne.mockResolvedValueOnce({
        id: 'm-1',
        status: MembershipStatus.APPROVED,
      });
      mockRoleGrantRepo.findOne.mockResolvedValueOnce({
        id: 'g-1',
        status: RoleGrantStatus.ACTIVE,
      });

      await expect(
        service.grantOrganizationRole(
          'org-1',
          { userId: 'u-1', role: UserRole.COORDINATOR },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should grant role and create approved membership if not yet exists', async () => {
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1' });
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'u-1' });
      mockMembershipRepo.findOne.mockResolvedValueOnce(null);
      mockMembershipRepo.create.mockImplementation((dto) => ({ id: 'm-new', ...dto }));
      mockMembershipRepo.save.mockImplementation((m) => Promise.resolve(m));

      mockRoleGrantRepo.findOne.mockResolvedValueOnce(null);
      mockRoleGrantRepo.create.mockImplementation((dto) => ({ id: 'g-new', ...dto }));
      mockRoleGrantRepo.save.mockImplementation((g) => Promise.resolve(g));

      const res = await service.grantOrganizationRole(
        'org-1',
        { userId: 'u-1', role: UserRole.MUNICIPALITY_ADMIN },
        'admin-1',
      );

      expect(res.id).toBe('g-new');
      expect(res.role).toBe(UserRole.MUNICIPALITY_ADMIN);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MEMBERSHIP_ROLE_GRANTED' }),
      );
    });
  });

  describe('revokeOrganizationRole', () => {
    it('should throw NotFoundException if role grant not found', async () => {
      mockRoleGrantRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.revokeOrganizationRole('org-1', 'g-missing', {}, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should revoke role and log audit event', async () => {
      const grant = {
        id: 'g-1',
        membershipId: 'm-1',
        membership: { organizationId: 'org-1' },
        status: RoleGrantStatus.ACTIVE,
        role: UserRole.COORDINATOR,
      };
      mockRoleGrantRepo.findOne.mockResolvedValueOnce(grant);
      mockRoleGrantRepo.save.mockImplementation((g) => Promise.resolve(g));

      const res = await service.revokeOrganizationRole(
        'org-1',
        'g-1',
        { reason: 'Role changed' },
        'admin-1',
      );

      expect(res.status).toBe(RoleGrantStatus.REVOKED);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MEMBERSHIP_ROLE_REVOKED' }),
      );
    });
  });

  describe('queryAuditLogs', () => {
    it('should forward parameters to auditService.queryEvents', async () => {
      const res = await service.queryAuditLogs({
        eventType: 'AUTH_LOGIN',
        limit: 20,
      });

      expect(mockAuditService.queryEvents).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'AUTH_LOGIN', limit: 20 }),
      );
      expect(res.events).toEqual([]);
    });
  });
});

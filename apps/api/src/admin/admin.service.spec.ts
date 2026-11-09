import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
import { RestrictionsService } from '../restrictions/restrictions.service';

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
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  /** What the Super Admin queries see: does the target hold it, and who else does. */
  const superAdmins = { holds: false, remaining: 1 };
  const repositories = new Map<unknown, unknown>();
  const mockManager: Record<string, jest.Mock> = {
    getRepository: jest.fn((entity: unknown) => repositories.get(entity)),
    query: jest.fn(async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('AS remaining')) return [{ remaining: superAdmins.remaining }];
      return superAdmins.holds ? [{ '?column?': 1 }] : [];
    }),
    transaction: jest.fn(async (work: (m: unknown) => unknown): Promise<unknown> =>
      work(mockManager),
    ),
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

  const mockRestrictions = {
    afterDirectRestriction: jest.fn().mockResolvedValue(undefined),
    afterDirectLift: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    superAdmins.holds = false;
    superAdmins.remaining = 1;
    repositories.set(User, mockUserRepo);
    repositories.set(GlobalAccountRestriction, mockRestrictionRepo);
    repositories.set(MembershipRoleGrant, mockRoleGrantRepo);
    repositories.set(OrganizationMembership, mockMembershipRepo);
    Object.assign(mockUserRepo, { manager: mockManager });
    Object.assign(mockRoleGrantRepo, { manager: mockManager });
    Object.assign(mockOrgRepo, {
      query: jest.fn().mockResolvedValue([{ membership_sequence: 7 }]),
    });
    mockRestrictionRepo.count.mockResolvedValue(0);

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
        { provide: RestrictionsService, useValue: mockRestrictions },
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
      mockRoleGrantRepo.findAndCount.mockResolvedValueOnce([
        [
          {
            membershipId: 'm-1',
            membership: {
              organizationId: 'org-1',
              organization: { name: 'Kottakkal' },
              user: { fullName: 'Asha Menon', phoneE164: '+919876543210' },
            },
          },
        ],
        1,
      ]);

      const res = await service.getOverviewMetrics();

      expect(res.totalUsers).toBe(150);
      expect(res.totalOrganizations).toBe(3);
      expect(res.activeOrganizations).toBe(2);
      expect(res.totalUniversalWallets).toBe(150);
      expect(res.totalBalanceCredits).toBe(2540.5);
      expect(res.pendingMemberships).toBe(12);
      expect(res.pendingSuperAdminCount).toBe(1);
      expect(res.pendingSuperAdmins).toEqual([
        {
          membershipId: 'm-1',
          organizationId: 'org-1',
          organizationName: 'Kottakkal',
          fullName: 'Asha Menon',
          phoneE164: '+919876543210',
        },
      ]);
    });
  });

  describe('imposeRestriction', () => {
    it('should throw BadRequestException if admin restricts self', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'admin-1', status: AccountStatus.ACTIVE });
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
        mockManager,
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
        mockManager,
      );
      expect(mockRestrictions.afterDirectLift).toHaveBeenCalledWith(
        mockManager,
        res,
        true,
        'admin-1',
        'Documents cleared',
        undefined,
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
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'u-1', status: AccountStatus.ACTIVE });
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
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1', code: 'KTB' });
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'u-1', status: AccountStatus.ACTIVE });
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
      expect(mockMembershipRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ membershipNumber: `KTB-${new Date().getFullYear()}-0007` }),
      );
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
      mockMembershipRepo.findOne.mockResolvedValueOnce({ id: 'm-1', organizationId: 'org-1' });
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
        mockManager,
      );
    });
  });

  describe('Super Admin and member safeguards', () => {
    const restrict = () =>
      service.imposeRestriction(
        {
          userId: 'other-admin',
          restrictionType: GlobalRestrictionType.TEMPORARY_SUSPENSION,
          reasonCode: 'TEST',
        },
        'admin-1',
      );

    it('refuses to restrict the last active Super Admin', async () => {
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'other-admin',
        status: AccountStatus.ACTIVE,
      });
      superAdmins.holds = true;
      superAdmins.remaining = 0;

      await expect(restrict()).rejects.toThrow(ConflictException);
      expect(mockRestrictionRepo.save).not.toHaveBeenCalled();
    });

    it('restricts a Super Admin while another one remains', async () => {
      const user = { id: 'other-admin', status: AccountStatus.ACTIVE };
      mockUserRepo.findOne.mockResolvedValueOnce(user);
      mockRestrictionRepo.create.mockImplementation((dto) => ({ id: 'r-2', ...dto }));
      mockRestrictionRepo.save.mockImplementation((r) => Promise.resolve(r));
      superAdmins.holds = true;

      await expect(restrict()).resolves.toMatchObject({ id: 'r-2' });
      expect(mockManager.query).toHaveBeenCalledWith(
        expect.stringContaining('pg_advisory_xact_lock'),
      );
    });

    it('refuses to revoke the last Super Admin grant', async () => {
      mockRoleGrantRepo.findOne.mockResolvedValueOnce({
        id: 'g-sa',
        membershipId: 'm-1',
        status: RoleGrantStatus.ACTIVE,
        role: UserRole.SUPER_ADMIN,
      });
      mockMembershipRepo.findOne.mockResolvedValueOnce({ id: 'm-1', organizationId: 'org-1' });
      superAdmins.remaining = 0;

      await expect(service.revokeOrganizationRole('org-1', 'g-sa', {}, 'admin-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockRoleGrantRepo.save).not.toHaveBeenCalled();
    });

    it.each([
      MembershipStatus.REJECTED,
      MembershipStatus.SUSPENDED,
      MembershipStatus.PENDING_REVIEW,
    ])('does not approve a %s membership by granting it a role', async (status) => {
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1', code: 'KTB' });
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'u-1', status: AccountStatus.ACTIVE });
      mockMembershipRepo.findOne.mockResolvedValueOnce({ id: 'm-1', status });

      await expect(
        service.grantOrganizationRole(
          'org-1',
          { userId: 'u-1', role: UserRole.COORDINATOR },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockMembershipRepo.save).not.toHaveBeenCalled();
      expect(mockRoleGrantRepo.save).not.toHaveBeenCalled();
    });

    it('does not grant roles to a suspended or restricted account', async () => {
      mockOrgRepo.findOne.mockResolvedValue({ id: 'org-1', code: 'KTB' });
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'u-1', status: AccountStatus.SUSPENDED });
      await expect(
        service.grantOrganizationRole(
          'org-1',
          { userId: 'u-1', role: UserRole.COORDINATOR },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);

      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'u-1', status: AccountStatus.ACTIVE });
      mockRestrictionRepo.count.mockResolvedValueOnce(1);
      await expect(
        service.grantOrganizationRole(
          'org-1',
          { userId: 'u-1', role: UserRole.COORDINATOR },
          'admin-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(mockRoleGrantRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('Super Admin second approval', () => {
    const appoint = () => {
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1', code: 'KTB' });
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'u-1', status: AccountStatus.ACTIVE });
      mockMembershipRepo.findOne.mockResolvedValueOnce({
        id: 'm-1',
        status: MembershipStatus.APPROVED,
      });
      mockRoleGrantRepo.findOne.mockResolvedValueOnce(null);
      mockRoleGrantRepo.create.mockImplementation((dto) => ({ id: 'g-new', ...dto }));
      mockRoleGrantRepo.save.mockImplementation((g) => Promise.resolve(g));
      return service.grantOrganizationRole(
        'org-1',
        { userId: 'u-1', role: UserRole.SUPER_ADMIN },
        'admin-1',
      );
    };
    const waiting = (extra = {}) => ({
      id: 'g-wait',
      membershipId: 'm-1',
      role: UserRole.SUPER_ADMIN,
      status: RoleGrantStatus.PENDING_APPROVAL,
      grantedBy: 'admin-1',
      ...extra,
    });
    const target = () =>
      mockMembershipRepo.findOne.mockResolvedValueOnce({
        id: 'm-1',
        organizationId: 'org-1',
        userId: 'u-1',
        status: MembershipStatus.APPROVED,
      });

    it('waits for a second Super Admin when another one exists', async () => {
      superAdmins.remaining = 1;
      await expect(appoint()).resolves.toMatchObject({ status: RoleGrantStatus.PENDING_APPROVAL });
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'SUPER_ADMIN_APPROVAL_REQUESTED' }),
      );
    });

    it('lets the only Super Admin appoint the next one directly', async () => {
      superAdmins.remaining = 0;
      await expect(appoint()).resolves.toMatchObject({ status: RoleGrantStatus.ACTIVE });
    });

    it('refuses an approval by the Super Admin who asked', async () => {
      mockRoleGrantRepo.findOne.mockResolvedValueOnce(waiting());
      target();
      await expect(service.approveOrganizationRole('org-1', 'g-wait', 'admin-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockRoleGrantRepo.save).not.toHaveBeenCalled();
    });

    it('refuses an approval by the person being appointed', async () => {
      mockRoleGrantRepo.findOne.mockResolvedValueOnce(waiting());
      target();
      await expect(service.approveOrganizationRole('org-1', 'g-wait', 'u-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('turns the role on when a second Super Admin approves', async () => {
      mockRoleGrantRepo.findOne.mockResolvedValueOnce(waiting());
      target();
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'u-1', status: AccountStatus.ACTIVE });
      mockRoleGrantRepo.save.mockImplementation((g) => Promise.resolve(g));

      await expect(
        service.approveOrganizationRole('org-1', 'g-wait', 'admin-2'),
      ).resolves.toMatchObject({ status: RoleGrantStatus.ACTIVE });
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ requestedBy: 'admin-1', approvedBy: 'admin-2' }),
        }),
        mockManager,
      );
    });

    it('refuses to approve a role that is not waiting', async () => {
      mockRoleGrantRepo.findOne.mockResolvedValueOnce(waiting({ status: RoleGrantStatus.ACTIVE }));
      target();
      await expect(service.approveOrganizationRole('org-1', 'g-wait', 'admin-2')).rejects.toThrow(
        ConflictException,
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

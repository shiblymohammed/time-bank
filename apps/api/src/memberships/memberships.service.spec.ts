import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentReviewStatus,
  MembershipStatus,
  OrganizationStatus,
  RoleGrantStatus,
  UserRole,
} from '@ktb/shared-types';

import { MembershipsService } from './memberships.service';
import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../identity/entities/user.entity';
import { OrganizationMembership } from './entities/organization-membership.entity';
import { MembershipRoleGrant } from './entities/membership-role-grant.entity';
import { MembershipApproval } from './entities/membership-approval.entity';
import { MembershipDocument } from './entities/membership-document.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { RoleHierarchyService } from '../authorization/role-hierarchy.service';

describe('MembershipsService', () => {
  let service: MembershipsService;

  const mockOrgRepo = {
    findOne: jest.fn(),
  };

  const mockUserRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  // Repositories reached through membershipRepo.manager: services, availability, skills.
  const mockServiceRepo = { find: jest.fn() };
  const mockAvailabilityRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
  const skillInsert = {
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  const mockManager = {
    getRepository: jest.fn((entity: { name: string }) =>
      entity.name === 'GlobalServiceDefinition' ? mockServiceRepo : mockAvailabilityRepo,
    ),
    createQueryBuilder: jest.fn(() => skillInsert),
  };

  const mockMembershipRepo = {
    count: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    manager: mockManager,
  };

  // DataSource mock for approveMembership transaction
  // Routes manager calls back through the individual repo mocks so existing tests
  // that mock mockMembershipRepo.findOne etc. continue to work unchanged.
  const mockDataSource = {
    transaction: jest.fn(async (_isolation: string, action: any) =>
      action({
        findOne: jest.fn(async (entity: any, options: any) => {
          const name: string = entity?.name ?? '';
          if (name === 'OrganizationMembership') return mockMembershipRepo.findOne(options);
          if (name === 'MembershipRoleGrant') return mockRoleGrantRepo.findOne(options);
          return null;
        }),
        count: jest.fn(async () => mockMembershipRepo.count()),
        save: jest.fn(async (entity: any, row: any) => {
          const name: string = entity?.name ?? '';
          if (name === 'MembershipRoleGrant') return mockRoleGrantRepo.save(row);
          if (name === 'MembershipApproval') return mockApprovalRepo.save(row);
          return mockMembershipRepo.save(row ?? entity);
        }),
        create: jest.fn((entity: any, data: any) => {
          const name: string = entity?.name ?? '';
          if (name === 'MembershipRoleGrant') return mockRoleGrantRepo.create(data);
          if (name === 'MembershipApproval') return mockApprovalRepo.create(data);
          return data ?? entity;
        }),
        createQueryBuilder: jest.fn(() => ({
          select: jest.fn().mockReturnThis(),
          from: jest.fn().mockReturnThis(),
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ '?column?': 1 }),
        })),
        increment: jest.fn().mockResolvedValue(undefined),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
    ),
    getRepository: jest.fn(() => mockRoleGrantRepo),
  };

  const mockRoleGrantRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockApprovalRepo = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockDocumentRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockAuditService = {
    logEvent: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuthorizationService = {
    assertNoSelfEscalation: jest.fn(),
    evaluateOrganizationAccess: jest.fn().mockResolvedValue({
      isSuperAdmin: false,
      roles: [UserRole.MUNICIPALITY_ADMIN],
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
    mockRoleHierarchyService.assertValidMembershipRole.mockReset();
    mockRoleHierarchyService.assertCanGrantRole.mockReset();
    mockAuthorizationService.assertNoSelfEscalation.mockReset();
    mockAuthorizationService.evaluateOrganizationAccess.mockResolvedValue({
      isSuperAdmin: false,
      roles: [UserRole.MUNICIPALITY_ADMIN],
      organizationId: 'org-123',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        { provide: getRepositoryToken(Organization), useValue: mockOrgRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(OrganizationMembership), useValue: mockMembershipRepo },
        { provide: getRepositoryToken(MembershipRoleGrant), useValue: mockRoleGrantRepo },
        { provide: getRepositoryToken(MembershipApproval), useValue: mockApprovalRepo },
        { provide: getRepositoryToken(MembershipDocument), useValue: mockDocumentRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: AuditService, useValue: mockAuditService },
        { provide: AuthorizationService, useValue: mockAuthorizationService },
        { provide: RoleHierarchyService, useValue: mockRoleHierarchyService },
      ],
    }).compile();

    service = module.get<MembershipsService>(MembershipsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMembershipById', () => {
    it('loads documents and review history within the requested organization', async () => {
      const membership = {
        id: 'member-1',
        organizationId: 'org-1',
        documents: [{ id: 'doc-1', reviewStatus: 'PENDING' }],
        approvals: [],
        roleGrants: [],
      };
      mockMembershipRepo.findOne.mockResolvedValue(membership);

      await expect(service.getMembershipById('org-1', 'member-1')).resolves.toEqual(membership);
      expect(mockMembershipRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'member-1', organizationId: 'org-1' },
        relations: ['user', 'roleGrants', 'approvals', 'documents'],
      });
    });

    it('rejects a membership absent from the requested organization', async () => {
      mockMembershipRepo.findOne.mockResolvedValue(null);
      await expect(service.getMembershipById('other-org', 'member-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('apply', () => {
    it('should throw NotFoundException if organization does not exist', async () => {
      mockOrgRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.apply('missing-org', 'u-1', {})).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if organization is not active', async () => {
      mockOrgRepo.findOne.mockResolvedValueOnce({
        id: 'org-1',
        status: OrganizationStatus.SUSPENDED,
      });

      await expect(service.apply('org-1', 'u-1', {})).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if user is already an approved member', async () => {
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1', status: OrganizationStatus.ACTIVE });
      mockMembershipRepo.findOne.mockResolvedValueOnce({
        id: 'm-1',
        status: MembershipStatus.APPROVED,
      });

      await expect(service.apply('org-1', 'u-1', {})).rejects.toThrow(ConflictException);
    });

    it('should return existing membership if application is already pending', async () => {
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1', status: OrganizationStatus.ACTIVE });
      const pending = { id: 'm-1', status: MembershipStatus.APPLIED };
      mockMembershipRepo.findOne.mockResolvedValueOnce(pending);

      const res = await service.apply('org-1', 'u-1', {});
      expect(res).toBe(pending);
    });

    it('should create new membership and set user primaryOrgId if null', async () => {
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1', status: OrganizationStatus.ACTIVE });
      mockMembershipRepo.findOne.mockResolvedValueOnce(null);

      mockMembershipRepo.create.mockImplementation((dto) => ({ id: 'm-new', ...dto }));
      mockMembershipRepo.save.mockImplementation((m) => Promise.resolve(m));

      const user = { id: 'u-1', primaryOrgId: null };
      mockUserRepo.findOne.mockResolvedValueOnce(user);
      mockUserRepo.save.mockResolvedValueOnce(user);

      const res = await service.apply('org-1', 'u-1', { notes: 'Ward 4' });

      expect(res.id).toBe('m-new');
      expect(res.status).toBe(MembershipStatus.APPLIED);
      expect(user.primaryOrgId).toBe('org-1');
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MEMBERSHIP_APPLIED' }),
      );
    });

    const activeOrgAndNoMembership = () => {
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1', status: OrganizationStatus.ACTIVE });
      mockMembershipRepo.findOne.mockResolvedValueOnce(null);
      mockMembershipRepo.create.mockImplementation((dto) => ({ id: 'm-new', ...dto }));
      mockMembershipRepo.save.mockImplementation((m) => Promise.resolve(m));
      mockUserRepo.findOne.mockResolvedValueOnce({ id: 'u-1', primaryOrgId: 'org-1' });
    };

    it('stores the requested role and volunteer answers with known skills', async () => {
      activeOrgAndNoMembership();
      mockServiceRepo.find.mockResolvedValueOnce([{ requiredSkillCodes: ['FIRST_AID'] }]);

      const res = await service.apply('org-1', 'u-1', {
        requestedRole: UserRole.VOLUNTEER,
        notes: 'Weekends',
        volunteer: { maxTravelRadiusKm: 3, usualDays: ['SAT'], skillCodes: ['FIRST_AID'] },
      });

      expect(res).toEqual(
        expect.objectContaining({
          requestedRole: UserRole.VOLUNTEER,
          applicationNotes: 'Weekends',
          applicationDetails: {
            volunteer: {
              maxTravelRadiusKm: 3,
              availableAtShortNotice: false,
              usualDays: ['SAT'],
              usualTimes: [],
              skillCodes: ['FIRST_AID'],
            },
          },
        }),
      );
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ requestedRole: 'VOLUNTEER' }),
        }),
      );
    });

    it('refuses volunteer answers for someone asking for help', async () => {
      activeOrgAndNoMembership();
      await expect(
        service.apply('org-1', 'u-1', {
          requestedRole: UserRole.BENEFICIARY,
          volunteer: { maxTravelRadiusKm: 3 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses skills no active service asks for', async () => {
      activeOrgAndNoMembership();
      mockServiceRepo.find.mockResolvedValueOnce([{ requiredSkillCodes: ['FIRST_AID'] }]);
      await expect(
        service.apply('org-1', 'u-1', {
          requestedRole: UserRole.VOLUNTEER,
          volunteer: { skillCodes: ['SURGERY'] },
        }),
      ).rejects.toThrow('Unknown skill codes: SURGERY');
    });

    it('lets a pending applicant change what they asked for', async () => {
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1', status: OrganizationStatus.ACTIVE });
      const pending = { id: 'm-1', status: MembershipStatus.APPLIED, requestedRole: null };
      mockMembershipRepo.findOne.mockResolvedValueOnce(pending);
      mockMembershipRepo.save.mockImplementation((m) => Promise.resolve(m));

      const res = await service.apply('org-1', 'u-1', { requestedRole: UserRole.CAREGIVER });
      expect(res.requestedRole).toBe(UserRole.CAREGIVER);
      expect(res.status).toBe(MembershipStatus.APPLIED);
    });
  });

  describe('approveMembership', () => {
    it('should throw NotFoundException if membership does not exist', async () => {
      mockMembershipRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.approveMembership('org-1', 'm-missing', 'admin-1', {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if membership is already approved', async () => {
      mockMembershipRepo.findOne.mockResolvedValueOnce({
        id: 'm-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
      });

      await expect(service.approveMembership('org-1', 'm-1', 'admin-1', {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should approve membership, assign formatted membership number, grant role, and audit', async () => {
      const membership = {
        id: 'm-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPLIED,
      };
      mockMembershipRepo.findOne
        .mockResolvedValueOnce(membership) // initial lookup
        .mockResolvedValueOnce({ ...membership, status: MembershipStatus.APPROVED }); // reload after save
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1', code: 'KOTTAKKAL' });
      mockMembershipRepo.count.mockResolvedValueOnce(4); // 4 existing approved
      mockMembershipRepo.save.mockImplementation((m) => Promise.resolve(m));

      mockRoleGrantRepo.findOne.mockResolvedValueOnce(null);
      mockRoleGrantRepo.create.mockImplementation((dto) => ({ id: 'g-1', ...dto }));
      mockRoleGrantRepo.save.mockImplementation((g) => Promise.resolve(g));

      mockApprovalRepo.create.mockImplementation((dto) => ({ id: 'app-1', ...dto }));
      mockApprovalRepo.save.mockImplementation((a) => Promise.resolve(a));

      const res = await service.approveMembership('org-1', 'm-1', 'admin-1', {
        initialRole: UserRole.VOLUNTEER,
      });

      expect(res.status).toBe(MembershipStatus.APPROVED);
      expect(membership).toEqual(
        expect.objectContaining({
          status: MembershipStatus.APPROVED,
          membershipNumber: expect.stringMatching(/^KOTTAKKAL-\d{4}-0005$/),
        }),
      );
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MEMBERSHIP_APPROVED' }),
        expect.anything(), // EntityManager passed inside transaction
      );
    });
  });

  describe('approveMembership with application answers', () => {
    const approvable = (extra: object) => {
      const membership = {
        id: 'm-1',
        organizationId: 'org-1',
        userId: 'u-1',
        status: MembershipStatus.APPLIED,
        ...extra,
      };
      mockMembershipRepo.findOne
        .mockResolvedValueOnce(membership)
        .mockResolvedValueOnce({ ...membership, status: MembershipStatus.APPROVED });
      mockOrgRepo.findOne.mockResolvedValueOnce({ id: 'org-1', code: 'KOTTAKKAL' });
      mockMembershipRepo.count.mockResolvedValueOnce(0);
      mockMembershipRepo.save.mockImplementation((m) => Promise.resolve(m));
      mockRoleGrantRepo.findOne.mockResolvedValueOnce(null);
      mockRoleGrantRepo.create.mockImplementation((dto) => dto);
      mockRoleGrantRepo.save.mockImplementation((g) => Promise.resolve(g));
      mockApprovalRepo.create.mockImplementation((dto) => dto);
      mockApprovalRepo.save.mockImplementation((a) => Promise.resolve(a));
    };
    const volunteerAnswers = (skillCodes: string[]) => ({
      volunteer: {
        maxTravelRadiusKm: 3,
        availableAtShortNotice: true,
        usualDays: [],
        usualTimes: [],
        skillCodes,
      },
    });

    it('grants the requested role when the approver names none', async () => {
      approvable({ requestedRole: UserRole.BENEFICIARY, applicationDetails: {} });
      await service.approveMembership('org-1', 'm-1', 'admin-1', {});
      expect(mockRoleGrantRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.BENEFICIARY }),
      );
      expect(mockAvailabilityRepo.save).not.toHaveBeenCalled();
    });

    it('turns volunteer answers into availability and unverified skills', async () => {
      approvable({
        requestedRole: UserRole.VOLUNTEER,
        applicationDetails: volunteerAnswers(['FIRST_AID']),
      });
      mockAvailabilityRepo.findOne.mockResolvedValueOnce(null);
      mockAvailabilityRepo.create.mockImplementation((dto) => dto);
      mockAvailabilityRepo.save.mockImplementation((a) => Promise.resolve(a));

      await service.approveMembership('org-1', 'm-1', 'admin-1', {});

      expect(mockAvailabilityRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ maxTravelRadiusKm: 3, isAvailableImmediate: true }),
      );
      expect(skillInsert.values).toHaveBeenCalledWith([
        expect.objectContaining({ skillCode: 'FIRST_AID', status: 'PENDING_VERIFICATION' }),
      ]);
      expect(skillInsert.orIgnore).toHaveBeenCalled();
    });

    it('keeps volunteer answers aside when the approver grants another role', async () => {
      approvable({ requestedRole: UserRole.VOLUNTEER, applicationDetails: volunteerAnswers([]) });
      await service.approveMembership('org-1', 'm-1', 'admin-1', {
        initialRole: UserRole.BENEFICIARY,
      });
      expect(mockAvailabilityRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('rejectMembership', () => {
    it('should reject membership with reason notes and record audit event', async () => {
      const membership = {
        id: 'm-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPLIED,
        rejectionReason: null as string | null,
      };
      mockMembershipRepo.findOne.mockResolvedValueOnce(membership);
      mockMembershipRepo.save.mockImplementation((m) => Promise.resolve(m));
      mockApprovalRepo.create.mockImplementation((dto) => ({ id: 'app-1', ...dto }));
      mockApprovalRepo.save.mockImplementation((a) => Promise.resolve(a));

      const res = await service.rejectMembership('org-1', 'm-1', 'admin-1', {
        reason: 'Out of area',
      });

      expect(res.status).toBe(MembershipStatus.REJECTED);
      expect(res.rejectionReason).toBe('Out of area');
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MEMBERSHIP_REJECTED' }),
      );
    });
  });

  describe('uploadDocument', () => {
    it('should throw ForbiddenException if user uploads for another member', async () => {
      mockMembershipRepo.findOne.mockResolvedValueOnce({
        id: 'm-1',
        organizationId: 'org-1',
        userId: 'other-user',
      });

      await expect(
        service.uploadDocument('org-1', 'm-1', 'current-user', {
          documentType: 'PROOF',
          storageKey: 'key',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should upload document successfully', async () => {
      mockMembershipRepo.findOne.mockResolvedValueOnce({
        id: 'm-1',
        organizationId: 'org-1',
        userId: 'current-user',
      });
      mockDocumentRepo.create.mockImplementation((dto) => ({ id: 'doc-1', ...dto }));
      mockDocumentRepo.save.mockImplementation((d) => Promise.resolve(d));

      const res = await service.uploadDocument('org-1', 'm-1', 'current-user', {
        documentType: 'RESIDENCE_PROOF',
        storageKey: 'uploads/res.pdf',
      });

      expect(res.id).toBe('doc-1');
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MEMBERSHIP_DOCUMENT_UPLOADED' }),
      );
    });
  });

  describe('reviewDocument', () => {
    it('should update review status of document and audit', async () => {
      const doc = {
        id: 'doc-1',
        reviewStatus: 'PENDING',
        membership: { organizationId: 'org-1', userId: 'target-1' },
      };
      mockDocumentRepo.findOne.mockResolvedValueOnce(doc);
      mockDocumentRepo.save.mockImplementation((d) => Promise.resolve(d));

      const res = await service.reviewDocument('org-1', 'doc-1', 'reviewer-1', {
        status: DocumentReviewStatus.APPROVED,
        notes: 'Verified',
      });

      expect(res.reviewStatus).toBe(DocumentReviewStatus.APPROVED);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MEMBERSHIP_DOCUMENT_REVIEWED' }),
      );
    });
  });

  describe('grantRole and revokeRole', () => {
    it('should grant role to approved member', async () => {
      mockMembershipRepo.findOne.mockResolvedValueOnce({
        id: 'm-1',
        organizationId: 'org-1',
        status: MembershipStatus.APPROVED,
      });
      mockRoleGrantRepo.findOne.mockResolvedValueOnce(null);
      mockRoleGrantRepo.create.mockImplementation((dto) => ({ id: 'g-1', ...dto }));
      mockRoleGrantRepo.save.mockImplementation((g) => Promise.resolve(g));

      const res = await service.grantRole('org-1', 'm-1', { role: UserRole.VOLUNTEER }, 'admin-1');

      expect(res.id).toBe('g-1');
      expect(res.role).toBe(UserRole.VOLUNTEER);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MEMBERSHIP_ROLE_GRANTED' }),
      );
    });

    it('should revoke role from member', async () => {
      const grant = {
        id: 'g-1',
        membershipId: 'm-1',
        membership: { organizationId: 'org-1' },
        status: RoleGrantStatus.ACTIVE,
        role: UserRole.VOLUNTEER,
      };
      mockRoleGrantRepo.findOne.mockResolvedValueOnce(grant);
      mockRoleGrantRepo.save.mockImplementation((g) => Promise.resolve(g));

      const res = await service.revokeRole(
        'org-1',
        'm-1',
        'g-1',
        { reason: 'Stepped down' },
        'admin-1',
      );

      expect(res.status).toBe(RoleGrantStatus.REVOKED);
      expect(mockAuditService.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'MEMBERSHIP_ROLE_REVOKED' }),
      );
    });
  });
  it.each([UserRole.SUPER_ADMIN, UserRole.MUNICIPALITY_ADMIN, UserRole.COORDINATOR])(
    'enforces role hierarchy for %s through membership grants and approvals',
    async (role) => {
      const hierarchy = new RoleHierarchyService();
      mockRoleHierarchyService.assertValidMembershipRole.mockImplementation((target) =>
        hierarchy.assertValidMembershipRole(target),
      );
      mockRoleHierarchyService.assertCanGrantRole.mockImplementation((actor, target) =>
        hierarchy.assertCanGrantRole(actor, target),
      );
      mockAuthorizationService.evaluateOrganizationAccess.mockResolvedValue({
        isSuperAdmin: false,
        roles: [UserRole.COORDINATOR],
        organizationId: 'org',
      });
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'm',
        userId: 'target',
        status: MembershipStatus.APPROVED,
      });
      await expect(service.grantRole('org', 'm', { role }, 'actor')).rejects.toThrow(
        ForbiddenException,
      );
      mockMembershipRepo.findOne.mockResolvedValue({
        id: 'm',
        userId: 'target',
        status: MembershipStatus.APPLIED,
      });
      await expect(
        service.approveMembership('org', 'm', 'actor', { initialRole: role }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockMembershipRepo.save).not.toHaveBeenCalled();
      expect(mockRoleGrantRepo.save).not.toHaveBeenCalled();
    },
  );
  it('rejects self approval and self role grants', async () => {
    mockAuthorizationService.assertNoSelfEscalation.mockImplementation((actor, target) => {
      if (actor === target) throw new ForbiddenException('Self-escalation denied');
    });
    mockMembershipRepo.findOne.mockResolvedValue({
      id: 'm',
      userId: 'actor',
      status: MembershipStatus.APPLIED,
    });
    await expect(service.approveMembership('org', 'm', 'actor', {})).rejects.toThrow(
      ForbiddenException,
    );
    mockMembershipRepo.findOne.mockResolvedValue({
      id: 'm',
      userId: 'actor',
      status: MembershipStatus.APPROVED,
    });
    await expect(
      service.grantRole('org', 'm', { role: UserRole.VOLUNTEER }, 'actor'),
    ).rejects.toThrow(ForbiddenException);
  });
});

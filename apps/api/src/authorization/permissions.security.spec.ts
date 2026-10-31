import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  AccountStatus,
  BeneficiaryEligibilityStatus,
  CaregiverAuthorizationStatus,
  CaregiverRelationshipType,
  CreationChannel,
  GlobalRestrictionStatus,
  MembershipStatus,
  OrganizationStatus,
  RoleGrantStatus,
  ServiceRequestStatus,
  UrgencyType,
  UserRole,
} from '@ktb/shared-types';
import { AuthorizationService } from './authorization.service';
import { RoleHierarchyService } from './role-hierarchy.service';
import { RolesGuard } from './guards/roles.guard';
import { OrganizationAccessGuard } from './guards/organization-access.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { MembershipsService } from '../memberships/memberships.service';
import { MembershipsController } from '../memberships/memberships.controller';
import { MatchingService } from '../matching/matching.service';
import { MatchingController } from '../matching/matching.controller';
import { BeneficiariesService } from '../beneficiaries/beneficiaries.service';
import { BeneficiariesController } from '../beneficiaries/beneficiaries.controller';
import { RequestsService } from '../requests/requests.service';
import { RequestsController } from '../requests/requests.controller';
import { AdminService } from '../admin/admin.service';
import { OrganizationsController } from '../organizations/organizations.controller';
import { AdminController } from '../admin/admin.controller';

// Exercise signed production authentication, real route guard metadata and real services.
// Only persistence and unrelated matching delivery are replaced; no socket or database is needed.
function repository(rows: any[] = []) {
  const matches = (row: any, where: any) =>
    Object.entries(where ?? {}).every(([key, value]) =>
      value instanceof Date ? new Date(row[key]).getTime() === value.getTime() : row[key] === value,
    );
  return {
    rows,
    findOne: jest.fn(
      async (options: any) => rows.find((row) => matches(row, options.where)) ?? null,
    ),
    find: jest.fn(async (options: any) => rows.filter((row) => matches(row, options.where))),
    count: jest.fn(
      async (options: any) => rows.filter((row) => matches(row, options.where)).length,
    ),
    create: jest.fn((input: any) => ({ id: `new-${rows.length}`, ...input })),
    save: jest.fn(async (row: any) => {
      if (!rows.includes(row)) rows.push(row);
      return row;
    }),
  };
}

function fixture() {
  const orgId = 'organization-a';
  const otherOrgId = 'organization-b';
  const members = [
    ['coordinator', UserRole.COORDINATOR],
    ['municipality-admin', UserRole.MUNICIPALITY_ADMIN],
    ['volunteer', UserRole.VOLUNTEER],
    ['beneficiary', UserRole.BENEFICIARY],
    ['caregiver', UserRole.CAREGIVER],
  ].map(([id, role]) => ({
    id: `${id}-membership`,
    userId: id,
    organizationId: orgId,
    status: MembershipStatus.APPROVED,
    roleGrants: [{ id: `${id}-grant`, role, status: RoleGrantStatus.ACTIVE }],
  }));
  const target = {
    id: 'pending-membership',
    userId: 'applicant',
    organizationId: orgId,
    status: MembershipStatus.PENDING_REVIEW,
    roleGrants: [] as any[],
  };
  members.push(
    target,
    {
      id: 'global-membership',
      userId: 'global-admin',
      organizationId: otherOrgId,
      status: MembershipStatus.APPROVED,
      roleGrants: [
        { id: 'global-grant', role: UserRole.SUPER_ADMIN, status: RoleGrantStatus.ACTIVE },
      ],
    },
    {
      id: 'foreign-membership',
      userId: 'foreign-user',
      organizationId: otherOrgId,
      status: MembershipStatus.APPROVED,
      roleGrants: [],
    },
  );
  const users = repository(
    members.map((member) => ({ id: member.userId, status: AccountStatus.ACTIVE })),
  );
  const organizations = repository([
    { id: orgId, code: 'ORG_A', status: OrganizationStatus.ACTIVE },
    { id: otherOrgId, code: 'ORG_B', status: OrganizationStatus.ACTIVE },
  ]);
  const memberships = repository(members);
  const restrictions = repository();
  const grants = Object.assign(repository(), {
    createQueryBuilder: jest.fn(() => {
      let userId: string;
      const query: any = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn((_sql: string, params: any) => {
          userId = params.userId;
          return query;
        }),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn(
          async () =>
            members
              .filter(
                (member) => member.userId === userId && member.status === MembershipStatus.APPROVED,
              )
              .flatMap((member) => member.roleGrants)
              .find(
                (grant) =>
                  grant.role === UserRole.SUPER_ADMIN && grant.status === RoleGrantStatus.ACTIVE,
              ) ?? null,
        ),
      };
      return query;
    }),
  });
  const audit = { logEvent: jest.fn() } as any;
  const authz = new AuthorizationService(
    users as any,
    organizations as any,
    memberships as any,
    grants as any,
    restrictions as any,
  );
  const hierarchy = new RoleHierarchyService();
  const documents = repository();
  const membershipService = new MembershipsService(
    organizations as any,
    users as any,
    memberships as any,
    grants as any,
    repository() as any,
    documents as any,
    audit,
    authz,
    hierarchy,
  );
  const requestRepo = Object.assign(
    repository([
      {
        id: 'foreign-request',
        organizationId: otherOrgId,
        status: ServiceRequestStatus.MATCHING_ACTIVE,
      },
    ]),
    {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getCount: jest.fn(async () => 0),
      })),
    },
  );
  const availability = repository();
  const skillRepo = repository();
  const assignmentRepo = repository();
  const matching = new MatchingService(
    skillRepo as any,
    availability as any,
    assignmentRepo as any,
    repository() as any,
    repository() as any,
    repository() as any,
    requestRepo as any,
    memberships as any,
    restrictions as any,
    {} as any,
    {} as any,
    {
      transaction: async (_isolation: string, action: any) =>
        action({ getRepository: () => requestRepo }),
    } as any,
    audit,
    authz,
  );
  const eligibility = repository([
    {
      id: 'eligibility',
      organizationId: orgId,
      membershipId: 'beneficiary-membership',
      status: BeneficiaryEligibilityStatus.ACTIVE,
      reviewDueAt: new Date('2100-01-01'),
      monthlyRequestQuota: 8,
    },
  ]);
  const relationships = repository();
  const beneficiaries = new BeneficiariesService(
    eligibility as any,
    relationships as any,
    memberships as any,
    requestRepo as any,
    audit,
    authz,
    documents as any,
  );
  const delivery = { findCandidatesAndDispatchOffers: jest.fn(async () => []) };
  const requests = new RequestsService(
    requestRepo as any,
    repository() as any,
    repository() as any,
    repository([
      {
        id: 'catalogue',
        organizationId: orgId,
        isEnabled: true,
        minVolunteers: 1,
        preferredVolunteers: 1,
        globalService: { categoryId: 'category' },
      },
    ]) as any,
    memberships as any,
    organizations as any,
    repository() as any,
    beneficiaries,
    delivery as any,
    audit,
    authz,
  );
  const admin = new AdminService(
    users as any,
    repository() as any,
    restrictions as any,
    organizations as any,
    memberships as any,
    grants as any,
    audit,
    authz,
    hierarchy,
  );
  const jwt = new JwtService({ secret: 'permission-regression-test-secret' });
  const config = new ConfigService();
  const configValues: Record<string, string> = {
    NODE_ENV: 'production',
    JWT_SECRET: 'permission-regression-test-secret',
  };
  jest.spyOn(config, 'get').mockImplementation((key: string) => configValues[key]);
  const guards = new Map<any, any>([
    [AuthGuard, new AuthGuard(jwt, config)],
    [OrganizationAccessGuard, new OrganizationAccessGuard(authz)],
    [RolesGuard, new RolesGuard(new Reflector(), authz)],
  ]);
  async function authorize(controller: any, method: string, userId: string, claims = {}) {
    const request: any = {
      headers: { authorization: `Bearer ${await jwt.signAsync({ sub: userId, ...claims })}` },
      params: { id: orgId },
      ip: '127.0.0.1',
      socket: {},
    };
    const handler = controller.prototype[method];
    const context = {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const declared = [
      ...(Reflect.getMetadata(GUARDS_METADATA, controller) ?? []),
      ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? []),
    ];
    expect(declared).toContain(AuthGuard);
    for (const guard of declared) await guards.get(guard).canActivate(context);
    return request;
  }
  return {
    orgId,
    otherOrgId,
    target,
    users,
    members,
    memberships,
    grants,
    restrictions,
    availability,
    assignmentRepo,
    documents,
    relationships,
    eligibility,
    requestRepo,
    delivery,
    authz,
    hierarchy,
    authorize,
    membershipService,
    matching,
    beneficiaries,
    requests,
    admin,
  };
}

describe('Permission boundaries with real guards and services', () => {
  let f: ReturnType<typeof fixture>;
  beforeEach(() => {
    f = fixture();
  });

  it.each([UserRole.SUPER_ADMIN, UserRole.MUNICIPALITY_ADMIN, UserRole.COORDINATOR])(
    'rejects coordinator approval with %s before changing any record',
    async (initialRole) => {
      const req = await f.authorize(MembershipsController, 'approveMembership', 'coordinator', {
        isSuperAdmin: true,
      });
      const controller = new MembershipsController(f.membershipService);
      await expect(
        controller.approveMembership(f.orgId, f.target.id, { initialRole }, req.user.id, req),
      ).rejects.toThrow(ForbiddenException);
      expect(f.target.status).toBe(MembershipStatus.PENDING_REVIEW);
      expect(f.memberships.save).not.toHaveBeenCalled();
      expect(f.grants.save).not.toHaveBeenCalled();
    },
  );

  it('allows coordinator approval of an operational role', async () => {
    const req = await f.authorize(MembershipsController, 'approveMembership', 'coordinator');
    await new MembershipsController(f.membershipService).approveMembership(
      f.orgId,
      f.target.id,
      { initialRole: UserRole.VOLUNTEER },
      req.user.id,
      req,
    );
    expect(f.target.status).toBe(MembershipStatus.APPROVED);
    expect(f.grants.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.VOLUNTEER }),
    );
  });

  it('allows global admin without a local membership to approve an operational member', async () => {
    await f.membershipService.approveMembership(f.orgId, f.target.id, 'global-admin', {});
    expect(f.target.status).toBe(MembershipStatus.APPROVED);
  });

  it('prohibits global roles in local grant workflows even for a global admin', async () => {
    await expect(
      f.membershipService.grantRole(
        f.orgId,
        'volunteer-membership',
        { role: UserRole.SUPER_ADMIN },
        'global-admin',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(f.grants.save).not.toHaveBeenCalled();
  });

  it('prevents municipality admin self-promotion through the guarded route', async () => {
    const req = await f.authorize(MembershipsController, 'grantRole', 'municipality-admin');
    await expect(
      new MembershipsController(f.membershipService).grantRole(
        f.orgId,
        'municipality-admin-membership',
        { role: UserRole.SUPER_ADMIN },
        req.user.id,
        req,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(f.grants.save).not.toHaveBeenCalled();
  });

  it('prevents self-grants even when the requested role is lower', async () => {
    await expect(
      f.membershipService.grantRole(
        f.orgId,
        'municipality-admin-membership',
        { role: UserRole.COORDINATOR },
        'municipality-admin',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(f.grants.save).not.toHaveBeenCalled();
  });

  it('allows municipality admin to grant coordinator to another member', async () => {
    await expect(
      f.membershipService.grantRole(
        f.orgId,
        'volunteer-membership',
        { role: UserRole.COORDINATOR },
        'municipality-admin',
      ),
    ).resolves.toMatchObject({ role: UserRole.COORDINATOR });
  });

  it('allows an administrator to remove their own operational role without granting privileges', async () => {
    f.grants.rows.push({
      id: 'own-volunteer-grant',
      membershipId: 'municipality-admin-membership',
      membership: f.members.find((member) => member.userId === 'municipality-admin'),
      role: UserRole.VOLUNTEER,
      status: RoleGrantStatus.ACTIVE,
    });
    await expect(
      f.membershipService.revokeRole(
        f.orgId,
        'municipality-admin-membership',
        'own-volunteer-grant',
        {},
        'municipality-admin',
      ),
    ).resolves.toMatchObject({ status: RoleGrantStatus.REVOKED });
  });

  it('rejects unknown roles even when the caller is a global administrator', () => {
    expect(() =>
      f.hierarchy.assertCanGrantRole(UserRole.SUPER_ADMIN, 'UNKNOWN' as UserRole),
    ).toThrow(ForbiddenException);
  });

  it.each([AccountStatus.SUSPENDED, AccountStatus.PERMANENTLY_BANNED])(
    'denies an existing admin token after account becomes %s',
    async (status) => {
      f.users.rows.find((user) => user.id === 'global-admin').status = status;
      await expect(
        f.authorize(AdminController, 'resolveRestriction', 'global-admin', {
          isSuperAdmin: true,
          roles: [UserRole.SUPER_ADMIN],
        }),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it('denies a restricted admin even if account status has not yet been updated', async () => {
    f.restrictions.rows.push({ userId: 'global-admin', status: GlobalRestrictionStatus.ACTIVE });
    await expect(
      f.authorize(AdminController, 'getOverview', 'global-admin', { isSuperAdmin: true }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('does not trust a stale or forged admin role claim', async () => {
    f.members.find((member) => member.userId === 'global-admin')!.roleGrants[0]!.status =
      RoleGrantStatus.REVOKED;
    await expect(
      f.authorize(AdminController, 'getOverview', 'global-admin', {
        isSuperAdmin: true,
        roles: [UserRole.SUPER_ADMIN],
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies global privileges when the granting membership is no longer approved', async () => {
    f.members.find((member) => member.userId === 'global-admin')!.status =
      MembershipStatus.PENDING_REVIEW;
    await expect(
      f.authorize(AdminController, 'getOverview', 'global-admin', { isSuperAdmin: true }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a currently active global admin without requiring a token role claim', async () => {
    await expect(
      f.authorize(AdminController, 'getOverview', 'global-admin'),
    ).resolves.toBeDefined();
  });

  it('rejects missing actor identity before querying persistence', async () => {
    await expect(f.authz.evaluateGlobalAccess(undefined as unknown as string)).rejects.toThrow(
      ForbiddenException,
    );
    expect(f.users.findOne).not.toHaveBeenCalled();
  });

  it('prevents restriction self-resolution at the service boundary', async () => {
    f.restrictions.rows.push({
      id: 'own-restriction',
      userId: 'global-admin',
      status: GlobalRestrictionStatus.ACTIVE,
    });
    await expect(
      f.admin.resolveRestriction('own-restriction', { resolutionNotes: 'clear' }, 'global-admin'),
    ).rejects.toThrow(ForbiddenException);
    expect(f.restrictions.save).not.toHaveBeenCalled();
  });

  it.each(['expandRadius', 'evaluateProgression'])(
    'scopes %s to the organization authorized by the guards',
    async (method) => {
      await f.authorize(MatchingController, method, 'coordinator');
      const controller = new MatchingController(f.matching);
      await expect((controller as any)[method](f.orgId, 'foreign-request')).rejects.toThrow(
        NotFoundException,
      );
      expect(f.requestRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'foreign-request', organizationId: f.orgId },
        }),
      );
      expect(f.requestRepo.save).not.toHaveBeenCalled();
    },
  );

  it.each(['getAvailability', 'updateAvailability'])(
    'denies %s for another volunteer despite organization membership',
    async (method) => {
      const req = await f.authorize(MatchingController, method, 'beneficiary');
      const controller = new MatchingController(f.matching);
      const action =
        method === 'getAvailability'
          ? controller.getAvailability(f.orgId, 'volunteer-membership', req.user.id)
          : controller.updateAvailability(
              f.orgId,
              'volunteer-membership',
              { isAvailableImmediate: false },
              req.user.id,
            );
      await expect(action).rejects.toThrow(ForbiddenException);
      expect(f.availability.findOne).not.toHaveBeenCalled();
      expect(f.availability.save).not.toHaveBeenCalled();
    },
  );

  it('allows a volunteer to update and read their own availability', async () => {
    await f.matching.updateAvailability(
      f.orgId,
      'volunteer-membership',
      { isAvailableImmediate: false },
      'volunteer',
    );
    await expect(
      f.matching.getAvailability(f.orgId, 'volunteer-membership', 'volunteer'),
    ).resolves.toMatchObject({ isAvailableImmediate: false });
  });

  it('discovers only the caller’s assignments through the mobile endpoint', async () => {
    f.assignmentRepo.rows.push(
      {
        id: 'own-offer',
        organizationId: f.orgId,
        volunteerMembershipId: 'volunteer-membership',
        serviceRequestId: 'request',
        status: 'OFFERED',
        serviceRequest: {
          id: 'request',
          requestNumber: 'REQ-1',
          locationAddressText: 'Community centre',
          beneficiaryNotes: 'private health notes',
          beneficiaryMembership: { user: { phoneE164: 'private' } },
        },
      },
      { id: 'another-offer', organizationId: f.orgId, volunteerMembershipId: 'another-member' },
      {
        id: 'foreign-offer',
        organizationId: f.otherOrgId,
        volunteerMembershipId: 'volunteer-membership',
      },
    );
    const req = await f.authorize(MatchingController, 'listMyAssignments', 'volunteer');
    const result = await new MatchingController(f.matching).listMyAssignments(f.orgId, req.user.id);
    expect(result.map((row) => row.id)).toEqual(['own-offer']);
    expect(result[0]!.serviceRequest).toMatchObject({ requestNumber: 'REQ-1' });
    expect(result[0]!.serviceRequest).not.toHaveProperty('beneficiaryNotes');
    expect(result[0]!.serviceRequest).not.toHaveProperty('beneficiaryMembership');
  });

  it('rejects offer discovery without a current volunteer role', async () => {
    await expect(f.matching.listMyAssignments(f.orgId, 'beneficiary')).rejects.toThrow(
      ForbiddenException,
    );
    expect(f.assignmentRepo.find).not.toHaveBeenCalled();
  });

  it('discovers only approved recipients with request permission for the caller', async () => {
    const relation = {
      organizationId: f.orgId,
      beneficiaryMembershipId: 'beneficiary-membership',
      caregiverMembershipId: 'caregiver-membership',
      status: CaregiverAuthorizationStatus.APPROVED,
      canInitiateRequests: true,
      beneficiaryMembership: {
        id: 'beneficiary-membership',
        membershipNumber: 'MEM-1',
        user: { phoneE164: 'private' },
      },
      authorizationDocument: { storageKey: 'private' },
    };
    f.relationships.rows.push(
      { id: 'own', ...relation },
      { id: 'revoked', ...relation, status: CaregiverAuthorizationStatus.REVOKED },
      { id: 'other-caregiver', ...relation, caregiverMembershipId: 'another-member' },
      { id: 'foreign', ...relation, organizationId: f.otherOrgId },
      { id: 'verification-only', ...relation, canInitiateRequests: false },
    );
    const req = await f.authorize(BeneficiariesController, 'listMyCareRecipients', 'caregiver');
    const result = await new BeneficiariesController(f.beneficiaries).listMyCareRecipients(
      f.orgId,
      req.user.id,
    );
    expect(result.map((row) => row.id)).toEqual(['own']);
    expect(result[0]!.beneficiaryMembership).toEqual({
      id: 'beneficiary-membership',
      membershipNumber: 'MEM-1',
    });
    expect(result[0]).not.toHaveProperty('authorizationDocument');
  });

  it('rejects recipient discovery without a current caregiver role', async () => {
    await expect(f.beneficiaries.listMyCareRecipients(f.orgId, 'volunteer')).rejects.toThrow(
      ForbiddenException,
    );
    expect(f.relationships.find).not.toHaveBeenCalled();
  });

  it('allows a coordinator to update local volunteer availability', async () => {
    await expect(
      f.matching.updateAvailability(f.orgId, 'volunteer-membership', {}, 'coordinator'),
    ).resolves.toBeDefined();
  });

  it('rejects a foreign membership even when a global admin supplies a local organization URL', async () => {
    await expect(
      f.matching.updateAvailability(f.orgId, 'foreign-membership', {}, 'global-admin'),
    ).rejects.toThrow(ForbiddenException);
    expect(f.availability.save).not.toHaveBeenCalled();
  });

  it.each(['listSkills', 'listVolunteerZones'])(
    'protects private volunteer records through %s',
    async (method) => {
      const req = await f.authorize(MatchingController, method, 'beneficiary');
      await expect(
        (new MatchingController(f.matching) as any)[method](
          f.orgId,
          'volunteer-membership',
          req.user.id,
        ),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it('denies unrelated members access to beneficiary eligibility', async () => {
    const req = await f.authorize(BeneficiariesController, 'getEligibility', 'volunteer');
    await expect(
      new BeneficiariesController(f.beneficiaries).getEligibility(
        f.orgId,
        'beneficiary-membership',
        req.user.id,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(f.eligibility.findOne).not.toHaveBeenCalled();
  });

  it.each(['beneficiary', 'coordinator'])(
    'allows eligibility access for %s without loading private approver details',
    async (actor) => {
      await expect(
        f.beneficiaries.getEligibility(f.orgId, 'beneficiary-membership', actor),
      ).resolves.toBeDefined();
      expect(f.eligibility.findOne.mock.calls[0]![0]).not.toHaveProperty('relations');
    },
  );

  it('allows an approved caregiver to read eligibility and only their own relationship', async () => {
    f.relationships.rows.push({
      id: 'relationship',
      organizationId: f.orgId,
      beneficiaryMembershipId: 'beneficiary-membership',
      caregiverMembershipId: 'caregiver-membership',
      status: CaregiverAuthorizationStatus.APPROVED,
    });
    await expect(
      f.beneficiaries.getEligibility(f.orgId, 'beneficiary-membership', 'caregiver'),
    ).resolves.toBeDefined();
    const result = await f.beneficiaries.listCaregiversForBeneficiary(
      f.orgId,
      'beneficiary-membership',
      'caregiver',
    );
    expect(result.map((row) => row.id)).toEqual(['relationship']);
    expect(f.relationships.find).toHaveBeenCalledWith({
      where: {
        organizationId: f.orgId,
        beneficiaryMembershipId: 'beneficiary-membership',
        caregiverMembershipId: 'caregiver-membership',
        status: CaregiverAuthorizationStatus.APPROVED,
      },
    });
  });

  it('denies a revoked caregiver access to beneficiary records', async () => {
    f.relationships.rows.push({
      organizationId: f.orgId,
      beneficiaryMembershipId: 'beneficiary-membership',
      caregiverMembershipId: 'caregiver-membership',
      status: CaregiverAuthorizationStatus.REVOKED,
    });
    await expect(
      f.beneficiaries.getEligibility(f.orgId, 'beneficiary-membership', 'caregiver'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('denies foreign authorization documents before saving a caregiver request', async () => {
    f.documents.rows.push({
      id: 'foreign-document',
      membershipId: 'foreign-membership',
      membership: f.members.find((member) => member.id === 'foreign-membership'),
    });
    await expect(
      f.beneficiaries.createCaregiverAuthorization(
        f.orgId,
        {
          beneficiaryMembershipId: 'beneficiary-membership',
          caregiverMembershipId: 'caregiver-membership',
          relationshipType: CaregiverRelationshipType.FAMILY_CHILD,
          authorizationDocumentId: 'foreign-document',
        },
        'caregiver',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(f.relationships.save).not.toHaveBeenCalled();
  });

  it('allows a caregiver to submit their own local authorization document', async () => {
    f.documents.rows.push({
      id: 'own-document',
      membershipId: 'caregiver-membership',
      membership: f.members.find((member) => member.id === 'caregiver-membership'),
    });
    await expect(
      f.beneficiaries.createCaregiverAuthorization(
        f.orgId,
        {
          beneficiaryMembershipId: 'beneficiary-membership',
          caregiverMembershipId: 'caregiver-membership',
          relationshipType: CaregiverRelationshipType.FAMILY_CHILD,
          authorizationDocumentId: 'own-document',
        },
        'caregiver',
      ),
    ).resolves.toMatchObject({ status: CaregiverAuthorizationStatus.PENDING_REVIEW });
  });

  it('denies unrelated members from creating caregiver relationships for others', async () => {
    await expect(
      f.beneficiaries.createCaregiverAuthorization(
        f.orgId,
        {
          beneficiaryMembershipId: 'beneficiary-membership',
          caregiverMembershipId: 'caregiver-membership',
          relationshipType: CaregiverRelationshipType.FAMILY_CHILD,
        },
        'volunteer',
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(f.relationships.save).not.toHaveBeenCalled();
  });

  const requestDto = {
    serviceCatalogId: 'catalogue',
    beneficiaryMembershipId: 'beneficiary-membership',
    creationChannel: CreationChannel.COORDINATOR_ON_BEHALF,
    urgency: UrgencyType.SCHEDULED,
    scheduledStartTime: '2030-01-01T10:00:00.000Z',
    locationAddressText: 'Community centre',
    locationWardNumber: '1',
    locationPostalCode: '676503',
  };

  it('rejects coordinator request impersonation by an ordinary member', async () => {
    const req = await f.authorize(RequestsController, 'createRequest', 'volunteer', {
      isSuperAdmin: true,
    });
    await expect(
      new RequestsController(f.requests).createRequest(f.orgId, requestDto, req.user.id, req),
    ).rejects.toThrow(ForbiddenException);
    expect(f.requestRepo.save).not.toHaveBeenCalled();
    expect(f.delivery.findCandidatesAndDispatchOffers).not.toHaveBeenCalled();
  });

  it('allows a coordinator to submit on behalf of an eligible beneficiary', async () => {
    await expect(
      f.requests.createRequest(f.orgId, 'coordinator', requestDto),
    ).resolves.toMatchObject({ beneficiaryMembershipId: 'beneficiary-membership' });
  });

  it('prevents idempotency keys from exposing another creator’s request', async () => {
    f.requestRepo.rows.push({
      id: 'private-request',
      organizationId: f.orgId,
      idempotencyKey: 'known-key',
      createdByUserId: 'beneficiary',
    } as any);
    await expect(
      f.requests.createRequest(f.orgId, 'volunteer', {
        ...requestDto,
        creationChannel: CreationChannel.DIRECT_BENEFICIARY,
        idempotencyKey: 'known-key',
      }),
    ).rejects.toThrow(ForbiddenException);
  });
  it('allows current global admins to provision an organization without an existing tenant', async () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      OrganizationsController.prototype.createOrganization,
    );
    expect(guards).toContain(AuthGuard);
    expect(guards).toContain(RolesGuard);
    expect(guards).not.toContain(OrganizationAccessGuard);
    await expect(
      f.authorize(OrganizationsController, 'createOrganization', 'global-admin'),
    ).resolves.toBeDefined();
    await expect(
      f.authorize(OrganizationsController, 'createOrganization', 'coordinator'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('requires staff authority and the correct tenant to list membership documents', async () => {
    await expect(f.authorize(MembershipsController, 'listDocuments', 'volunteer')).rejects.toThrow(
      ForbiddenException,
    );
    await f.authorize(MembershipsController, 'listDocuments', 'coordinator');
    const controller = new MembershipsController(f.membershipService);
    await expect(controller.listDocuments(f.orgId, 'volunteer-membership')).resolves.toEqual([]);
    await expect(controller.listDocuments(f.otherOrgId, 'volunteer-membership')).rejects.toThrow(
      NotFoundException,
    );
  });
});

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
  MembershipStatus,
  RoleGrantStatus,
  ServiceRequestStatus,
  TeamInvitationStatus,
  UserRole,
  VolunteerAssignmentStatus,
} from '@ktb/shared-types';

import { TeamService } from './team.service';
import { TeamInvitation } from './entities/team-invitation.entity';
import { VolunteerAssignment } from './entities/volunteer-assignment.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { MatchingConfigService } from './matching-config.service';
import { ConfigService } from '@nestjs/config';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ORG = 'org-1';
const REQUEST_ID = 'req-1';
const INVITER_USER = 'user-inviter';
const INVITEE_MEM = 'mem-invitee';
const INVITER_MEM = 'mem-inviter';

function makeRequest(overrides: Partial<ServiceRequest> = {}): ServiceRequest {
  return {
    id: REQUEST_ID,
    organizationId: ORG,
    status: ServiceRequestStatus.FULLY_MATCHED,
    minVolunteers: 2,
    preferredVolunteers: 3,
    scheduledStartTime: new Date(Date.now() + 60 * 60 * 1000),
    expectedDurationMinutes: 60,
    beneficiaryMembershipId: 'mem-beneficiary',
    urgency: 'IMMEDIATE',
    ...overrides,
  } as ServiceRequest;
}

function makeAssignment(overrides: Partial<VolunteerAssignment> = {}): VolunteerAssignment {
  return {
    id: 'assign-1',
    organizationId: ORG,
    serviceRequestId: REQUEST_ID,
    volunteerMembershipId: INVITER_MEM,
    status: VolunteerAssignmentStatus.ACCEPTED,
    ...overrides,
  } as VolunteerAssignment;
}

function makeInviteeMembership(overrides: object = {}): OrganizationMembership {
  return {
    id: INVITEE_MEM,
    organizationId: ORG,
    userId: 'user-invitee',
    status: MembershipStatus.APPROVED,
    roleGrants: [{ role: UserRole.VOLUNTEER, status: RoleGrantStatus.ACTIVE }],
    ...overrides,
  } as OrganizationMembership;
}

// ─── Test setup ──────────────────────────────────────────────────────────────

async function buildService(mocks: {
  invitation?: Partial<typeof mockInvitationRepo>;
  assignment?: Partial<typeof mockAssignmentRepo>;
  request?: Partial<typeof mockRequestRepo>;
  membership?: Partial<typeof mockMembershipRepo>;
  dataSource?: Partial<typeof mockDataSource>;
} = {}) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      TeamService,
      MatchingConfigService,
      { provide: ConfigService, useValue: { get: jest.fn((_k, def) => def ?? 5) } },
      { provide: getRepositoryToken(TeamInvitation), useValue: { ...mockInvitationRepo, ...mocks.invitation } },
      { provide: getRepositoryToken(VolunteerAssignment), useValue: { ...mockAssignmentRepo, ...mocks.assignment } },
      { provide: getRepositoryToken(ServiceRequest), useValue: { ...mockRequestRepo, ...mocks.request } },
      { provide: getRepositoryToken(OrganizationMembership), useValue: { ...mockMembershipRepo, ...mocks.membership } },
      { provide: DataSource, useValue: { ...mockDataSource, ...mocks.dataSource } },
      { provide: AuditService, useValue: mockAuditService },
      { provide: AuthorizationService, useValue: {} },
    ],
  }).compile();
  return module.get(TeamService);
}

const mockAuditService = { logEvent: jest.fn().mockResolvedValue(undefined) };

const mockInvitationRepo = {
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  save: jest.fn(async (inv: any) => inv),
  create: jest.fn((data: any) => data),
};

const mockAssignmentRepo = {
  findOne: jest.fn(),
};

const mockRequestRepo = {
  findOne: jest.fn(),
};

const mockMembershipRepo = {
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
};

// Default transaction mock — calls the callback with a mock EntityManager
// that routes operations through the individual repo mocks.
const mockDataSource = {
  transaction: jest.fn(async (_isolation: string, action: any) =>
    action({
      createQueryBuilder: jest.fn((_entity?: any) => ({
        setLock: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ '?column?': 1 }),
        getOne: jest.fn(async () => makeRequest()),
      })),
      findOne: jest.fn(async (entity: any, options: any) => {
        const name: string = entity?.name ?? '';
        if (name === 'TeamInvitation') return mockInvitationRepo.findOne(options);
        if (name === 'VolunteerAssignment') return mockAssignmentRepo.findOne(options);
        if (name === 'OrganizationMembership') return mockMembershipRepo.findOne(options);
        return null;
      }),
      count: jest.fn().mockResolvedValue(1), // 1 accepted already
      save: jest.fn(async (_entity: any, row: any) => row ?? _entity),
      create: jest.fn((_entity: any, data: any) => data),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    }),
  ),
};

// ─── inviteTeammate ───────────────────────────────────────────────────────────

describe('TeamService — inviteTeammate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a pending invitation when all checks pass', async () => {
    const ds = {
      transaction: jest.fn(async (_isolation: string, action: any) =>
        action({
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(makeRequest()),
          })),
          findOne: jest.fn().mockImplementation(async (entity: any, options: any) => {
            const name: string = entity?.name ?? '';
            if (name === 'OrganizationMembership' && options?.where?.userId === INVITER_USER) {
              return { id: INVITER_MEM, userId: INVITER_USER, organizationId: ORG };
            }
            if (name === 'VolunteerAssignment') {
              // Return active inviter assignment for the inviter, null for the duplicate check
              if (options?.where?.volunteerMembershipId === INVITER_MEM) {
                return makeAssignment();
              }
              return null;
            }
            if (name === 'OrganizationMembership' && options?.where?.id === INVITEE_MEM) {
              return makeInviteeMembership();
            }
            if (name === 'TeamInvitation') return null;
            return null;
          }),
          count: jest.fn().mockResolvedValue(1), // 1 accepted < 3 preferred
          save: jest.fn(async (_e: any, row: any) => ({ id: 'inv-1', ...row })),
          create: jest.fn((_e: any, data: any) => data),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    const result = await service.inviteTeammate(ORG, REQUEST_ID, { inviteeMembershipId: INVITEE_MEM }, INVITER_USER);

    expect(result.status).toBe(TeamInvitationStatus.PENDING);
    expect(ds.transaction).toHaveBeenCalled();
  });

  it('throws ForbiddenException when inviter has no accepted assignment on the request', async () => {
    const ds = {
      transaction: jest.fn(async (_i: string, action: any) =>
        action({
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getRawOne: jest.fn().mockResolvedValue(null),
            getOne: jest.fn().mockResolvedValue(makeRequest()),
          })),
          findOne: jest.fn().mockImplementation(async (entity: any, _options: any) => {
            const name: string = entity?.name ?? '';
            if (name === 'OrganizationMembership') return { id: INVITER_MEM, userId: INVITER_USER };
            if (name === 'VolunteerAssignment') return null; // NOT assigned
            return null;
          }),
          count: jest.fn().mockResolvedValue(0),
          save: jest.fn(),
          create: jest.fn((_e: any, data: any) => data),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    await expect(
      service.inviteTeammate(ORG, REQUEST_ID, { inviteeMembershipId: INVITEE_MEM }, INVITER_USER),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ConflictException when all preferred slots are already filled', async () => {
    const ds = {
      transaction: jest.fn(async (_i: string, action: any) =>
        action({
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(makeRequest()),
          })),
          findOne: jest.fn().mockImplementation(async (entity: any, _options: any) => {
            const name: string = entity?.name ?? '';
            if (name === 'OrganizationMembership') return { id: INVITER_MEM, userId: INVITER_USER };
            if (name === 'VolunteerAssignment') return makeAssignment(); // inviter is assigned
            return null;
          }),
          count: jest.fn().mockResolvedValue(3), // 3 accepted = preferredVolunteers (3)
          save: jest.fn(),
          create: jest.fn((_e: any, data: any) => data),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    await expect(
      service.inviteTeammate(ORG, REQUEST_ID, { inviteeMembershipId: INVITEE_MEM }, INVITER_USER),
    ).rejects.toThrow(ConflictException);
  });

  it('throws BadRequestException when trying to invite the beneficiary', async () => {
    const BENEFICIARY_MEM = 'mem-beneficiary';
    const ds = {
      transaction: jest.fn(async (_i: string, action: any) =>
        action({
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(makeRequest()), // beneficiaryMembershipId: 'mem-beneficiary'
          })),
          findOne: jest.fn().mockImplementation(async (entity: any, options: any) => {
            const name: string = entity?.name ?? '';
            if (name === 'OrganizationMembership' && options?.where?.userId === INVITER_USER) {
              return { id: INVITER_MEM, userId: INVITER_USER };
            }
            if (name === 'VolunteerAssignment') return makeAssignment();
            if (name === 'OrganizationMembership') {
              return { ...makeInviteeMembership(), id: BENEFICIARY_MEM };
            }
            return null;
          }),
          count: jest.fn().mockResolvedValue(1),
          save: jest.fn(),
          create: jest.fn((_e: any, data: any) => data),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    await expect(
      service.inviteTeammate(ORG, REQUEST_ID, { inviteeMembershipId: BENEFICIARY_MEM }, INVITER_USER),
    ).rejects.toThrow(BadRequestException);
  });
});

// ─── acceptInvitation ────────────────────────────────────────────────────────

describe('TeamService — acceptInvitation', () => {
  beforeEach(() => jest.clearAllMocks());

  const pendingInvitation = {
    id: 'inv-1',
    organizationId: ORG,
    serviceRequestId: REQUEST_ID,
    inviteeMembershipId: INVITEE_MEM,
    inviterMembershipId: INVITER_MEM,
    slotNumber: 2,
    status: TeamInvitationStatus.PENDING,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  };

  it('creates an ACCEPTED assignment and marks invitation accepted', async () => {
    const ds = {
      transaction: jest.fn(async (_i: string, action: any) =>
        action({
          findOne: jest.fn().mockImplementation(async (entity: any, _options: any) => {
            const name: string = entity?.name ?? '';
            if (name === 'TeamInvitation') return { ...pendingInvitation };
            if (name === 'OrganizationMembership') {
              return { id: INVITEE_MEM, userId: 'user-invitee' };
            }
            return null;
          }),
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(makeRequest()),
          })),
          count: jest.fn().mockResolvedValue(1), // 1 < minVolunteers(2) so PARTIALLY_ACCEPTED
          save: jest.fn(async (_e: any, row: any) => ({ id: 'new-assign', ...row })),
          create: jest.fn((_e: any, data: any) => ({ id: 'new-assign', ...data })),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    const result = await service.acceptInvitation(ORG, 'inv-1', 'user-invitee');

    expect(result.status).toBe(VolunteerAssignmentStatus.ACCEPTED);
  });

  it('throws ForbiddenException when caller is not the invitee', async () => {
    const ds = {
      transaction: jest.fn(async (_i: string, action: any) =>
        action({
          findOne: jest.fn().mockImplementation(async (entity: any) => {
            if (entity?.name === 'TeamInvitation') return { ...pendingInvitation };
            return { id: INVITEE_MEM, userId: 'different-user' }; // different userId
          }),
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(makeRequest()),
          })),
          count: jest.fn().mockResolvedValue(0),
          save: jest.fn(),
          create: jest.fn((_e: any, data: any) => data),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    await expect(
      service.acceptInvitation(ORG, 'inv-1', 'wrong-user'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ConflictException when invitation has already been accepted', async () => {
    const ds = {
      transaction: jest.fn(async (_i: string, action: any) =>
        action({
          findOne: jest.fn().mockResolvedValue({
            ...pendingInvitation,
            status: TeamInvitationStatus.ACCEPTED,
          }),
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(makeRequest()),
          })),
          count: jest.fn().mockResolvedValue(0),
          save: jest.fn(),
          create: jest.fn((_e: any, data: any) => data),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    await expect(
      service.acceptInvitation(ORG, 'inv-1', 'user-invitee'),
    ).rejects.toThrow(ConflictException);
  });

  it('throws ConflictException when invitation has expired', async () => {
    const ds = {
      transaction: jest.fn(async (_i: string, action: any) =>
        action({
          findOne: jest.fn().mockImplementation(async (entity: any) => {
            if (entity?.name === 'TeamInvitation') {
              return {
                ...pendingInvitation,
                expiresAt: new Date(Date.now() - 1000), // already expired
              };
            }
            return { id: INVITEE_MEM, userId: 'user-invitee' };
          }),
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(makeRequest()),
          })),
          count: jest.fn().mockResolvedValue(0),
          save: jest.fn(async (_e: any, row: any) => row ?? _e),
          create: jest.fn((_e: any, data: any) => data),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    await expect(
      service.acceptInvitation(ORG, 'inv-1', 'user-invitee'),
    ).rejects.toThrow(ConflictException);
  });
});

// ─── declineInvitation ────────────────────────────────────────────────────────

describe('TeamService — declineInvitation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sets invitation to DECLINED when called by the invitee', async () => {
    mockInvitationRepo.findOne.mockResolvedValue({
      id: 'inv-1',
      organizationId: ORG,
      inviteeMembershipId: INVITEE_MEM,
      status: TeamInvitationStatus.PENDING,
    });
    mockMembershipRepo.findOne.mockResolvedValue({ id: INVITEE_MEM, userId: 'user-invitee' });
    mockInvitationRepo.save.mockImplementation(async (inv: any) => inv);

    const service = await buildService();
    const result = await service.declineInvitation(ORG, 'inv-1', 'user-invitee', {});

    expect(result.status).toBe(TeamInvitationStatus.DECLINED);
  });

  it('throws ForbiddenException when caller is not the invitee', async () => {
    mockInvitationRepo.findOne.mockResolvedValue({
      id: 'inv-1',
      organizationId: ORG,
      inviteeMembershipId: INVITEE_MEM,
      status: TeamInvitationStatus.PENDING,
    });
    mockMembershipRepo.findOne.mockResolvedValue({ id: INVITEE_MEM, userId: 'correct-user' });

    const service = await buildService();
    await expect(
      service.declineInvitation(ORG, 'inv-1', 'wrong-user', {}),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFoundException when invitation does not exist', async () => {
    mockInvitationRepo.findOne.mockResolvedValue(null);

    const service = await buildService();
    await expect(
      service.declineInvitation(ORG, 'ghost-inv', 'any-user', {}),
    ).rejects.toThrow(NotFoundException);
  });
});

// ─── handleSubMinimumAfterWithdrawal ──────────────────────────────────────────

describe('TeamService — handleSubMinimumAfterWithdrawal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('re-activates matching when active count drops below minVolunteers during IN_PROGRESS', async () => {
    const savedRequest = makeRequest({ status: ServiceRequestStatus.IN_PROGRESS });
    const ds = {
      transaction: jest.fn(async (_i: string, action: any) =>
        action({
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(savedRequest),
          })),
          count: jest.fn().mockResolvedValue(0), // 0 active < minVolunteers(2)
          save: jest.fn(async (_e: any, row: any) => row ?? _e),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    await service.handleSubMinimumAfterWithdrawal(ORG, REQUEST_ID, 'mem-1');

    expect(ds.transaction).toHaveBeenCalled();
    expect(mockAuditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TEAM_SUB_MINIMUM_ALERT' }),
      expect.anything(),
    );
  });

  it('does not throw when the request is already in a terminal state', async () => {
    const ds = {
      transaction: jest.fn(async (_i: string, action: any) =>
        action({
          createQueryBuilder: jest.fn(() => ({
            setLock: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(
              makeRequest({ status: ServiceRequestStatus.COMPLETED }),
            ),
          })),
          count: jest.fn().mockResolvedValue(0),
          save: jest.fn(),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    await expect(
      service.handleSubMinimumAfterWithdrawal(ORG, REQUEST_ID, 'mem-1'),
    ).resolves.toBeUndefined();
  });
});

// ─── recordTransfer ────────────────────────────────────────────────────────────

describe('TeamService — recordTransfer', () => {
  it('marks old assignment as REPLACED and links to replacement', async () => {
    const oldAssignment = makeAssignment({ status: VolunteerAssignmentStatus.ACCEPTED });
    const ds = {
      transaction: jest.fn(async (_i: string, action: any) =>
        action({
          findOne: jest.fn().mockResolvedValue(oldAssignment),
          save: jest.fn(async (_e: any, row: any) => row ?? _e),
        }),
      ),
    };

    const service = await buildService({ dataSource: ds as any });
    await service.recordTransfer(ORG, 'assign-old', 'assign-new', 'coordinator-1');

    expect(ds.transaction).toHaveBeenCalled();
    expect(mockAuditService.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'VOLUNTEER_TRANSFERRED' }),
      expect.anything(),
    );
  });
});

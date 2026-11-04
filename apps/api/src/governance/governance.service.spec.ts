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
  AccountClosureStatus,
  AccountClosureType,
  AccountStatus,
  AppealStatus,
  AppealSubjectType,
  ComplaintStatus,
  ComplaintTargetRole,
  GlobalRestrictionStatus,
  GlobalRestrictionType,
  SafetyAlertStatus,
  SafetyAlertRaisedBy,
  UserRole,
} from '@ktb/shared-types';

import { GovernanceService } from './governance.service';
import { SafetyAlert } from './entities/safety-alert.entity';
import { Complaint } from './entities/complaint.entity';
import { Appeal } from './entities/appeal.entity';
import { DeathNominee } from './entities/death-nominee.entity';
import { AccountClosure } from './entities/account-closure.entity';
import { User } from '../identity/entities/user.entity';
import { UniversalTimeWallet } from '../identity/entities/universal-time-wallet.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { AuditService } from '../audit/audit.service';
import { AuthorizationService } from '../authorization/authorization.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ORG = 'org-1';
const USER = 'user-1';

const mockAudit = { logEvent: jest.fn().mockResolvedValue(undefined) };

function makeAuthz(roles: UserRole[] = [UserRole.COORDINATOR], isSuperAdmin = false) {
  return {
    evaluateOrganizationAccess: jest.fn().mockResolvedValue({ isSuperAdmin, roles }),
    evaluateGlobalAccess: jest.fn().mockResolvedValue({ isSuperAdmin }),
  };
}

function makeRepo(overrides: object = {}) {
  return {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn((d: any) => d),
    save: jest.fn(async (e: any) => ({ id: 'saved-1', ...e })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue({ c: '5' }),
      getCount: jest.fn().mockResolvedValue(0),
    })),
    ...overrides,
  };
}

const mockDataSource = {
  transaction: jest.fn(async (_iso: string, action: any) =>
    action({
      findOne: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      save: jest.fn(async (_e: any, row: any) => ({ id: 'saved-tx', ...row })),
      create: jest.fn((_e: any, data: any) => data),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    }),
  ),
};

async function buildService(overrides: {
  alert?: any; complaint?: any; appeal?: any; nominee?: any;
  closure?: any; user?: any; wallet?: any; restriction?: any;
  membership?: any; request?: any; authz?: any; ds?: any;
} = {}) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      GovernanceService,
      { provide: getRepositoryToken(SafetyAlert), useValue: overrides.alert ?? makeRepo() },
      { provide: getRepositoryToken(Complaint), useValue: overrides.complaint ?? makeRepo() },
      { provide: getRepositoryToken(Appeal), useValue: overrides.appeal ?? makeRepo() },
      { provide: getRepositoryToken(DeathNominee), useValue: overrides.nominee ?? makeRepo() },
      { provide: getRepositoryToken(AccountClosure), useValue: overrides.closure ?? makeRepo() },
      { provide: getRepositoryToken(User), useValue: overrides.user ?? makeRepo() },
      { provide: getRepositoryToken(UniversalTimeWallet), useValue: overrides.wallet ?? makeRepo() },
      { provide: getRepositoryToken(GlobalAccountRestriction), useValue: overrides.restriction ?? makeRepo() },
      { provide: getRepositoryToken(OrganizationMembership), useValue: overrides.membership ?? makeRepo() },
      { provide: getRepositoryToken(ServiceRequest), useValue: overrides.request ?? makeRepo() },
      { provide: DataSource, useValue: overrides.ds ?? mockDataSource },
      { provide: AuditService, useValue: mockAudit },
      { provide: AuthorizationService, useValue: overrides.authz ?? makeAuthz() },
    ],
  }).compile();
  return module.get(GovernanceService);
}

beforeEach(() => jest.clearAllMocks());

// ─── Safety Alerts ────────────────────────────────────────────────────────────

describe('GovernanceService — raiseSafetyAlert', () => {
  it('creates an alert for an IN_PROGRESS request', async () => {
    const requestRepo = makeRepo({
      findOne: jest.fn().mockResolvedValue({ id: 'req-1', status: 'IN_PROGRESS', assignedCoordinatorId: 'coord-1' }),
    });
    const alertRepo = makeRepo();
    const service = await buildService({ request: requestRepo, alert: alertRepo });

    const result = await service.raiseSafetyAlert(ORG, USER, {
      serviceRequestId: 'req-1',
      raisedByRole: SafetyAlertRaisedBy.VOLUNTEER,
      description: 'Feeling unsafe',
    });

    expect(result.status).toBe(SafetyAlertStatus.RAISED);
    expect(mockAudit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'SAFETY_ALERT_RAISED' }),
    );
  });

  it('throws ConflictException when service is not IN_PROGRESS', async () => {
    const requestRepo = makeRepo({
      findOne: jest.fn().mockResolvedValue({ id: 'req-1', status: 'MATCHING_ACTIVE' }),
    });
    const service = await buildService({ request: requestRepo });
    await expect(
      service.raiseSafetyAlert(ORG, USER, {
        serviceRequestId: 'req-1',
        raisedByRole: SafetyAlertRaisedBy.VOLUNTEER,
        description: 'test',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws NotFoundException when request not found', async () => {
    const requestRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = await buildService({ request: requestRepo });
    await expect(
      service.raiseSafetyAlert(ORG, USER, {
        serviceRequestId: 'ghost',
        raisedByRole: SafetyAlertRaisedBy.BENEFICIARY,
        description: 'help',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('GovernanceService — acknowledgeAlert', () => {
  it('moves alert to ACKNOWLEDGED', async () => {
    const alert = { id: 'alert-1', organizationId: ORG, status: SafetyAlertStatus.RAISED };
    const alertRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(alert) });
    const service = await buildService({ alert: alertRepo });
    const result = await service.acknowledgeAlert(ORG, 'alert-1', 'coord-1');
    expect(result.status).toBe(SafetyAlertStatus.ACKNOWLEDGED);
  });

  it('throws ConflictException when alert is already resolved', async () => {
    const alertRepo = makeRepo({
      findOne: jest.fn().mockResolvedValue({ id: 'alert-1', status: SafetyAlertStatus.RESOLVED }),
    });
    const service = await buildService({ alert: alertRepo });
    await expect(service.acknowledgeAlert(ORG, 'alert-1', 'coord-1')).rejects.toThrow(ConflictException);
  });
});

// ─── Complaints ───────────────────────────────────────────────────────────────

describe('GovernanceService — submitComplaint', () => {
  it('creates a SUBMITTED complaint with correct routing', async () => {
    const userRepo = makeRepo({ findOne: jest.fn().mockResolvedValue({ id: 'target-1' }) });
    const complaintRepo = makeRepo();
    const service = await buildService({ user: userRepo, complaint: complaintRepo });

    const result = await service.submitComplaint(ORG, USER, {
      targetUserId: 'target-1',
      targetRole: ComplaintTargetRole.COORDINATOR,
      subject: 'Inappropriate behaviour',
      description: 'A long description of the incident that provides enough context.',
    });

    expect(result.status).toBe(ComplaintStatus.SUBMITTED);
    expect(result.targetRole).toBe(ComplaintTargetRole.COORDINATOR);
  });

  it('throws BadRequestException when complaining about yourself', async () => {
    const service = await buildService();
    await expect(
      service.submitComplaint(ORG, USER, {
        targetUserId: USER,
        targetRole: ComplaintTargetRole.COORDINATOR,
        subject: 'Self',
        description: 'Long enough description for validation check.',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when target user does not exist', async () => {
    const userRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = await buildService({ user: userRepo });
    await expect(
      service.submitComplaint(ORG, USER, {
        targetUserId: 'ghost',
        targetRole: ComplaintTargetRole.COORDINATOR,
        subject: 'Missing user',
        description: 'Long enough description for validation check.',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('GovernanceService — resolveComplaint', () => {
  it('allows Municipality Admin to resolve a coordinator complaint', async () => {
    const complaint = {
      id: 'c-1',
      organizationId: ORG,
      targetRole: ComplaintTargetRole.COORDINATOR,
      status: ComplaintStatus.SUBMITTED,
    };
    const complaintRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(complaint) });
    const service = await buildService({
      complaint: complaintRepo,
      authz: makeAuthz([UserRole.MUNICIPALITY_ADMIN]),
    });

    const result = await service.resolveComplaint(ORG, 'c-1', 'admin-1', {
      status: ComplaintStatus.RESOLVED,
      resolutionNotes: 'Reviewed and resolved.',
    });

    expect(result.status).toBe(ComplaintStatus.RESOLVED);
  });

  it('throws ForbiddenException when coordinator tries to resolve admin complaint', async () => {
    const complaint = {
      id: 'c-1',
      organizationId: ORG,
      targetRole: ComplaintTargetRole.MUNICIPALITY_ADMIN,
      status: ComplaintStatus.SUBMITTED,
    };
    const complaintRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(complaint) });
    // Coordinator — cannot resolve admin complaints
    const service = await buildService({
      complaint: complaintRepo,
      authz: { evaluateOrganizationAccess: jest.fn().mockResolvedValue({ isSuperAdmin: false, roles: [UserRole.COORDINATOR] }), evaluateGlobalAccess: jest.fn().mockResolvedValue({ isSuperAdmin: false }) },
    });
    await expect(
      service.resolveComplaint(ORG, 'c-1', 'coord-1', { status: ComplaintStatus.RESOLVED }),
    ).rejects.toThrow(ForbiddenException);
  });
});

// ─── Appeals ─────────────────────────────────────────────────────────────────

describe('GovernanceService — submitAppeal', () => {
  it('creates a SUBMITTED appeal', async () => {
    const appealRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) }); // no existing appeal
    const service = await buildService({ appeal: appealRepo });

    const result = await service.submitAppeal(ORG, USER, {
      subjectType: AppealSubjectType.SUSPENSION,
      subjectReferenceId: 'restriction-1',
      grounds: 'I believe the suspension was unjustified. This is a detailed ground for appeal.',
    });

    expect(result.status).toBe(AppealStatus.SUBMITTED);
  });

  it('throws ConflictException when an open appeal already exists for same subject', async () => {
    const appealRepo = makeRepo({
      findOne: jest.fn().mockResolvedValue({ id: 'existing', status: AppealStatus.SUBMITTED }),
    });
    const service = await buildService({ appeal: appealRepo });
    await expect(
      service.submitAppeal(ORG, USER, {
        subjectType: AppealSubjectType.BAN,
        subjectReferenceId: 'restriction-1',
        grounds: 'Appealing again with detailed grounds that meet minimum length.',
      }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('GovernanceService — reviewAppeal', () => {
  it('upholds a BAN appeal, resolves restriction, and restores user status', async () => {
    const appeal = {
      id: 'appeal-1',
      organizationId: ORG,
      subjectType: AppealSubjectType.BAN,
      subjectReferenceId: 'restriction-1',
      status: AppealStatus.SUBMITTED,
    };
    const restriction = {
      id: 'restriction-1',
      userId: 'banned-user',
      restrictionType: GlobalRestrictionType.PERMANENT_BAN,
      status: GlobalRestrictionStatus.ACTIVE,
    };
    const bannedUser = { id: 'banned-user', status: AccountStatus.PERMANENTLY_BANNED };

    const ds = {
      transaction: jest.fn(async (_iso: string, action: any) =>
        action({
          findOne: jest.fn().mockImplementation(async (entity: any, _opts: any) => {
            if (entity?.name === 'Appeal') return { ...appeal };
            if (entity?.name === 'GlobalAccountRestriction') return { ...restriction };
            if (entity?.name === 'User') return { ...bannedUser };
            return null;
          }),
          count: jest.fn().mockResolvedValue(0), // no remaining restrictions
          save: jest.fn(async (_e: any, row: any) => row ?? _e),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
          create: jest.fn((_e: any, d: any) => d),
        }),
      ),
    };

    const service = await buildService({
      ds,
      authz: makeAuthz([], true), // Super Admin
    });

    const result = await service.reviewAppeal(ORG, 'appeal-1', 'super-admin', {
      status: AppealStatus.UPHELD,
      outcomeNotes: 'Appeal upheld — insufficient evidence for ban.',
    });

    expect(result.status).toBe(AppealStatus.UPHELD);
  });

  it('throws ForbiddenException when non-Super-Admin tries to review', async () => {
    const service = await buildService({
      authz: makeAuthz([UserRole.MUNICIPALITY_ADMIN], false),
    });
    await expect(
      service.reviewAppeal(ORG, 'appeal-1', 'admin-1', { status: AppealStatus.DISMISSED }),
    ).rejects.toThrow(ForbiddenException);
  });
});

// ─── Death Nominees ───────────────────────────────────────────────────────────

describe('GovernanceService — setNominee', () => {
  it('creates a new nominee when none exists', async () => {
    const nomineeRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = await buildService({ nominee: nomineeRepo });
    const result = await service.setNominee(USER, { nomineeName: 'Jane Doe', nomineePhone: '+919876543210' });
    expect(result.nomineeName).toBe('Jane Doe');
    expect(result.updatedByOtp).toBe(true);
  });

  it('updates existing nominee', async () => {
    const existing = { id: 'nom-1', userId: USER, nomineeName: 'Old Name', nomineePhone: '+910000000000' };
    const nomineeRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(existing) });
    const service = await buildService({ nominee: nomineeRepo });
    const result = await service.setNominee(USER, { nomineeName: 'New Name', nomineePhone: '+919876543210' });
    expect(result.nomineeName).toBe('New Name');
  });
});

// ─── Account Closures ─────────────────────────────────────────────────────────

describe('GovernanceService — requestClosure', () => {
  it('creates PENDING_REVIEW closure for a deceased account', async () => {
    const userRepo = makeRepo({ findOne: jest.fn().mockResolvedValue({ id: USER }) });
    const closureRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = await buildService({ user: userRepo, closure: closureRepo });

    const result = await service.requestClosure(ORG, USER, 'coord-1', { closureType: AccountClosureType.DECEASED });
    expect(result.status).toBe(AccountClosureStatus.PENDING_REVIEW);
    expect(result.closureType).toBe(AccountClosureType.DECEASED);
  });

  it('throws BadRequestException for DUPLICATE closure without primary userId', async () => {
    const userRepo = makeRepo({ findOne: jest.fn().mockResolvedValue({ id: USER }) });
    const closureRepo = makeRepo({ findOne: jest.fn().mockResolvedValue(null) });
    const service = await buildService({ user: userRepo, closure: closureRepo });
    await expect(
      service.requestClosure(ORG, USER, 'coord-1', { closureType: AccountClosureType.DUPLICATE }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ConflictException when closure already exists', async () => {
    const userRepo = makeRepo({ findOne: jest.fn().mockResolvedValue({ id: USER }) });
    const closureRepo = makeRepo({
      findOne: jest.fn().mockResolvedValue({ id: 'existing-closure' }),
    });
    const service = await buildService({ user: userRepo, closure: closureRepo });
    await expect(
      service.requestClosure(ORG, USER, 'coord-1', { closureType: AccountClosureType.DECEASED }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('GovernanceService — reviewClosure', () => {
  it('approves a deceased closure — freezes user and wallet', async () => {
    const closure = {
      id: 'closure-1',
      userId: USER,
      organizationId: ORG,
      closureType: AccountClosureType.DECEASED,
      status: AccountClosureStatus.PENDING_REVIEW,
    };
    const ds = {
      transaction: jest.fn(async (_iso: string, action: any) =>
        action({
          findOne: jest.fn().mockImplementation(async (entity: any) => {
            if (entity?.name === 'AccountClosure') return { ...closure };
            if (entity?.name === 'DeathNominee') return null; // no nominee
            return null;
          }),
          save: jest.fn(async (_e: any, row: any) => row ?? _e),
          update: jest.fn().mockResolvedValue({ affected: 1 }),
          create: jest.fn((_e: any, d: any) => d),
        }),
      ),
    };
    const service = await buildService({
      ds,
      authz: makeAuthz([UserRole.MUNICIPALITY_ADMIN]),
    });

    const result = await service.reviewClosure(ORG, 'closure-1', 'admin-1', {
      status: AccountClosureStatus.APPROVED,
    });

    expect(result.status).toBe(AccountClosureStatus.APPROVED);
    expect(ds.transaction).toHaveBeenCalled();
  });

  it('throws BadRequestException when rejecting without a reason', async () => {
    const closure = { id: 'c-1', status: AccountClosureStatus.PENDING_REVIEW };
    const ds = {
      transaction: jest.fn(async (_iso: string, action: any) =>
        action({
          findOne: jest.fn().mockResolvedValue({ ...closure }),
          save: jest.fn(),
          update: jest.fn(),
          create: jest.fn(),
        }),
      ),
    };
    const service = await buildService({
      ds,
      authz: makeAuthz([UserRole.MUNICIPALITY_ADMIN]),
    });
    await expect(
      service.reviewClosure(ORG, 'c-1', 'admin-1', { status: AccountClosureStatus.REJECTED }),
    ).rejects.toThrow(BadRequestException);
  });
});

// ─── Reports ─────────────────────────────────────────────────────────────────

describe('GovernanceService — getOrgDashboard', () => {
  it('returns aggregate org metrics without exposing individual records', async () => {
    const membershipRepo = makeRepo({ count: jest.fn().mockResolvedValue(50) });
    const requestRepo = makeRepo({ count: jest.fn().mockResolvedValue(200) });
    const alertRepo = makeRepo({ count: jest.fn().mockResolvedValue(2) });
    const closureRepo = makeRepo({ count: jest.fn().mockResolvedValue(1) });
    const service = await buildService({
      membership: membershipRepo,
      request: requestRepo,
      alert: alertRepo,
      closure: closureRepo,
    });

    const result = await service.getOrgDashboard(ORG);

    expect(result.organizationId).toBe(ORG);
    expect(result).toHaveProperty('members');
    expect(result).toHaveProperty('requests');
    expect(result).toHaveProperty('safety');
    expect(result).toHaveProperty('governance');
  });
});

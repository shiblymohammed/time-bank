import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  AppealOutcome,
  AppealStatus,
  ComplaintLevel,
  ComplaintOutcome,
  ComplaintStatus,
  GlobalRestrictionStatus,
  GlobalRestrictionType,
  MembershipStatus,
  RestrictionCaseEventType,
  RestrictionCaseStatus,
  RestrictionScope,
  UserRole,
} from '@ktb/shared-types';
import { ComplaintsService } from '../complaints/complaints.service';
import { Complaint } from '../complaints/entities/complaint.entity';
import { GlobalAccountRestriction } from '../identity/entities/global-account-restriction.entity';
import { User } from '../identity/entities/user.entity';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { AppealsService } from './appeals.service';
import { APPEAL_WINDOW_DAYS } from './appeal-window';
import { Appeal } from './entities/appeal.entity';
import { RestrictionCaseEvent } from './entities/restriction-case-event.entity';
import { RestrictionCase } from './entities/restriction-case.entity';
import { RestrictionsService } from './restrictions.service';

const ORG = 'org';
const person = (userId: string, roles: UserRole[], isSuperAdmin = false) =>
  ({
    userId,
    organizationId: ORG,
    membershipId: `m-${userId}`,
    roles,
    isSuperAdmin,
    membershipStatus: 'APPROVED',
  }) as never;
const coordinator = person('coordinator', [UserRole.COORDINATOR]);
const admin = person('admin', [UserRole.MUNICIPALITY_ADMIN]);
const otherAdmin = person('admin-2', [UserRole.MUNICIPALITY_ADMIN]);
const central = person('central', [UserRole.SUPER_ADMIN], true);
const otherCentral = person('central-2', [UserRole.SUPER_ADMIN], true);
const member = person('subject', [UserRole.BENEFICIARY]);
const DAY = 24 * 60 * 60 * 1000;
const REASON = 'Took money from a beneficiary during a visit';
const MESSAGE = 'Your account is suspended while we look into a concern.';

describe('Restrictions and appeals', () => {
  let tables: Map<unknown, Record<string, any>[]>;
  let roles: Record<string, string[]>;
  let notifications: { notifyUsers: jest.Mock; notifyCoordinators: jest.Mock };
  let audit: { logEvent: jest.Mock };
  let requests: { cancelForRestriction: jest.Mock };
  let credits: { releaseRestrictionHolds: jest.Mock };
  let complaints: {
    canHandle: jest.Mock;
    addAppealEvent: jest.Mock;
    notifyHandlers: jest.Mock;
  };
  let service: RestrictionsService;
  let appeals: AppealsService;
  let nextId: number;

  const rows = (entity: unknown) => {
    if (!tables.has(entity)) tables.set(entity, []);
    return tables.get(entity)!;
  };
  const matches = (row: Record<string, any>, where: Record<string, any> = {}) =>
    Object.entries(where).every(([key, wanted]) => {
      if (wanted?._type === 'in') return wanted._value.includes(row[key]);
      if (wanted?._type === 'lessThanOrEqual') return row[key] && row[key] <= wanted._value;
      if (wanted?._type === 'isNull') return row[key] === null || row[key] === undefined;
      return row[key] === wanted;
    });
  const stored = (entity: unknown, value: Record<string, any>) => {
    const table = rows(entity);
    if (!value['id']) value['id'] = `id-${nextId++}`;
    if (!value['createdAt']) value['createdAt'] = new Date();
    if (!table.includes(value)) table.push(value);
    return value;
  };
  const repository = (entity: unknown) => ({
    create: (value: Record<string, any>) => ({ ...value }),
    save: async (value: Record<string, any>) => stored(entity, value),
    findOne: async ({ where }: any) => rows(entity).find((row) => matches(row, where)) ?? null,
    count: async ({ where }: any) => rows(entity).filter((row) => matches(row, where)).length,
    find: async ({ where }: any = {}) => rows(entity).filter((row) => matches(row, where)),
  });
  const manager: Record<string, any> = {
    query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('pg_advisory')) return [];
      if (sql.includes('COUNT(DISTINCT')) return [{ remaining: superAdminsLeft }];
      if (sql.includes('SELECT DISTINCT g.role')) {
        return (roles[parameters[0] as string] ?? []).map((role) => ({ role }));
      }
      if (sql.includes("g.role = 'MUNICIPALITY_ADMIN'")) {
        return localAdmins.map((user_id) => ({ user_id }));
      }
      if (sql.includes("g.role = 'SUPER_ADMIN'")) {
        return ['central', 'central-2'].map((user_id) => ({ user_id }));
      }
      if (sql.includes('g.role = $2') && sql.includes('om.user_id = $1')) {
        return (roles[parameters[0] as string] ?? []).includes(UserRole.SUPER_ADMIN) ? [{}] : [];
      }
      if (sql.includes('SELECT id FROM organization_memberships')) {
        return rows(OrganizationMembership)
          .filter((row) => row['userId'] === parameters[0])
          .map((row) => ({ id: row['id'] }));
      }
      if (sql.includes('JOIN users u ON u.id = m.user_id')) {
        const found = rows(OrganizationMembership).find(
          (row) =>
            row['organizationId'] === parameters[0] &&
            row['membershipNumber'] === parameters[1] &&
            ['APPROVED', 'SUSPENDED'].includes(row['status']),
        );
        return found ? [{ id: found['id'] }] : [];
      }
      if (sql.includes('volunteer_assignments a')) return helping;
      return [];
    }),
    getRepository: (entity: unknown) => repository(entity),
    findOne: (entity: unknown, options: any) => repository(entity).findOne(options),
    find: (entity: unknown, options: any) => repository(entity).find(options),
    exists: async (entity: unknown, { where }: any) =>
      rows(entity).some((row) => matches(row, where)),
    create: (_entity: unknown, value: Record<string, any>) => ({ ...value }),
    save: async (entity: unknown, value: Record<string, any>) => stored(entity, value),
    insert: async (entity: unknown, value: Record<string, any>) => {
      stored(entity, value);
    },
    update: async (entity: unknown, where: any, change: any) => {
      rows(entity)
        .filter((row) => matches(row, where))
        .forEach((row) => Object.assign(row, change));
    },
  };
  let superAdminsLeft: number;
  let localAdmins: string[];
  let helping: { organization_id: string }[];

  const events = (caseId: string) =>
    rows(RestrictionCaseEvent)
      .filter((row) => row['caseId'] === caseId)
      .map((row) => row['type']);
  const subject = () => rows(User).find((row) => row['id'] === 'subject')!;
  const membership = () => rows(OrganizationMembership).find((row) => row['id'] === 'm-subject')!;
  const recommend = (
    actor = coordinator,
    restrictionType = GlobalRestrictionType.TEMPORARY_SUSPENSION,
  ) =>
    service.recommend(ORG, actor, {
      member: 'KTB-1',
      restrictionType,
      reason: REASON,
    });
  const approve = (caseId: string, actor = admin, scope = RestrictionScope.PLATFORM) =>
    service.approve(ORG, caseId, actor, { scope, notes: 'Looked into it', memberMessage: MESSAGE });
  const inForce = async (scope = RestrictionScope.PLATFORM) => {
    const made = await recommend();
    await approve(made.id, admin, scope);
    return made.id;
  };
  const stands = { outcome: AppealOutcome.STANDS, notes: 'It stands', memberMessage: 'It stands.' };
  const overturned = {
    outcome: AppealOutcome.OVERTURNED,
    notes: 'It was wrong',
    memberMessage: 'We got this wrong.',
  };

  beforeEach(() => {
    tables = new Map();
    roles = { subject: [UserRole.BENEFICIARY] };
    superAdminsLeft = 1;
    localAdmins = ['admin', 'admin-2'];
    helping = [];
    nextId = 1;
    rows(User).push({ id: 'subject', status: AccountStatus.ACTIVE, phoneE164: '+919000000000' });
    rows(OrganizationMembership).push({
      id: 'm-subject',
      userId: 'subject',
      organizationId: ORG,
      membershipNumber: 'KTB-1',
      status: MembershipStatus.APPROVED,
    });
    notifications = {
      notifyUsers: jest.fn().mockResolvedValue(undefined),
      notifyCoordinators: jest.fn().mockResolvedValue(undefined),
    };
    audit = { logEvent: jest.fn().mockResolvedValue({ id: 'audit' }) };
    requests = {
      cancelForRestriction: jest.fn().mockResolvedValue({ cancelled: 0, underWay: [] }),
    };
    credits = { releaseRestrictionHolds: jest.fn().mockResolvedValue(0) };
    complaints = {
      canHandle: jest.fn().mockResolvedValue(true),
      addAppealEvent: jest.fn().mockResolvedValue(undefined),
      notifyHandlers: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      manager,
      getRepository: (entity: unknown) => repository(entity),
      transaction: (...args: any[]) => args[args.length - 1](manager),
    };
    service = new RestrictionsService(
      dataSource as never,
      notifications as never,
      audit as never,
      requests as never,
      credits as never,
      complaints as unknown as ComplaintsService,
    );
    appeals = new AppealsService(
      dataSource as never,
      service,
      {} as never,
      complaints as unknown as ComplaintsService,
      notifications as never,
      audit as never,
    );
  });

  describe('recommending', () => {
    it('lets a coordinator recommend, and tells the administrators without naming anyone', async () => {
      const made = await recommend();
      expect(made.status).toBe(RestrictionCaseStatus.RECOMMENDED);
      expect(subject()['status']).toBe(AccountStatus.ACTIVE);
      expect(notifications.notifyUsers.mock.calls[0]![1]).toEqual(['admin', 'admin-2']);
      expect(JSON.stringify(notifications.notifyUsers.mock.calls)).not.toContain(REASON);
    });

    it('refuses someone who is only a member', async () => {
      await expect(recommend(member)).rejects.toThrow(ForbiddenException);
    });

    it('refuses recommending yourself', async () => {
      rows(OrganizationMembership)[0]!['userId'] = 'coordinator';
      await expect(recommend()).rejects.toThrow(ForbiddenException);
    });

    it('sends a case about a coordinator past other coordinators', async () => {
      roles['subject'] = [UserRole.COORDINATOR];
      await expect(recommend()).rejects.toThrow(ForbiddenException);
      const made = await recommend(admin);
      expect(made.level).toBe(ComplaintLevel.MUNICIPALITY_ADMIN);
      await expect(service.detail(ORG, made.id, coordinator)).rejects.toThrow(NotFoundException);
    });

    it('sends a case about an administrator to Super Admins alone', async () => {
      roles['subject'] = [UserRole.MUNICIPALITY_ADMIN];
      await expect(recommend(admin)).rejects.toThrow(ForbiddenException);
      const made = await recommend(central);
      expect(made.level).toBe(ComplaintLevel.SUPER_ADMIN);
      await expect(approve(made.id, admin)).rejects.toThrow(NotFoundException);
    });

    it('refuses a second recommendation while one is waiting', async () => {
      await recommend();
      await expect(recommend()).rejects.toThrow(ConflictException);
    });

    it('finds the first case on a retry', async () => {
      const dto = {
        member: 'KTB-1',
        restrictionType: GlobalRestrictionType.TEMPORARY_SUSPENSION,
        reason: REASON,
        clientOperationId: 'operation-1',
      };
      const first = await service.recommend(ORG, coordinator, dto);
      const second = await service.recommend(ORG, coordinator, dto);
      expect(second.id).toBe(first.id);
      expect(rows(RestrictionCase)).toHaveLength(1);
    });

    it('will not link a complaint this person cannot reach', async () => {
      rows(Complaint).push({ id: 'c1', reference: 'CMP-1', organizationId: ORG });
      complaints.canHandle.mockResolvedValue(false);
      await expect(
        service.recommend(ORG, coordinator, {
          member: 'KTB-1',
          restrictionType: GlobalRestrictionType.TEMPORARY_SUSPENSION,
          reason: REASON,
          complaintReference: 'CMP-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('tells a Super Admin when the community has no administrator', async () => {
      localAdmins = [];
      await recommend();
      expect(notifications.notifyUsers.mock.calls[0]![1]).toEqual(['central', 'central-2']);
    });
  });

  describe('deciding', () => {
    it('does not let a coordinator approve', async () => {
      const made = await recommend();
      await expect(approve(made.id, coordinator)).rejects.toThrow(ForbiddenException);
    });

    it('does not let whoever recommended it approve it', async () => {
      const made = await recommend(admin);
      await expect(approve(made.id, admin)).rejects.toThrow(ForbiddenException);
      await approve(made.id, otherAdmin);
      expect(subject()['status']).toBe(AccountStatus.SUSPENDED);
    });

    it('hides a case from the person it is about, even a Super Admin', async () => {
      const made = await recommend();
      rows(RestrictionCase)[0]!['subjectUserId'] = 'central';
      await expect(approve(made.id, central)).rejects.toThrow(NotFoundException);
      await expect(service.detail(ORG, made.id, central)).rejects.toThrow(NotFoundException);
    });

    it('stops an administrator who is part of the complaint behind it', async () => {
      const made = await recommend();
      rows(RestrictionCase)[0]!['complaintId'] = 'c1';
      complaints.canHandle.mockResolvedValue(false);
      await expect(approve(made.id)).rejects.toThrow(ForbiddenException);
    });

    it('blocks the person everywhere when it covers all communities', async () => {
      const made = await recommend();
      await approve(made.id);
      expect(subject()['status']).toBe(AccountStatus.SUSPENDED);
      const [restriction] = rows(GlobalAccountRestriction);
      expect(restriction!['status']).toBe(GlobalRestrictionStatus.ACTIVE);
      expect(restriction!['authorizedBy']).toBe('admin');
      expect(membership()['status']).toBe(MembershipStatus.APPROVED);
      expect(rows(RestrictionCase)[0]!['status']).toBe(RestrictionCaseStatus.ACTIVE);
      expect(manager['query']).toHaveBeenCalledWith('DELETE FROM push_devices WHERE user_id = $1', [
        'subject',
      ]);
    });

    it('leaves the account and wallet alone when it covers one community', async () => {
      const made = await recommend();
      await approve(made.id, admin, RestrictionScope.COMMUNITY);
      expect(membership()['status']).toBe(MembershipStatus.SUSPENDED);
      expect(subject()['status']).toBe(AccountStatus.ACTIVE);
      expect(rows(GlobalAccountRestriction)).toHaveLength(0);
    });

    it('makes a ban cover every community, with no review date', async () => {
      const made = await recommend(coordinator, GlobalRestrictionType.PERMANENT_BAN);
      await expect(approve(made.id, admin, RestrictionScope.COMMUNITY)).rejects.toThrow(
        BadRequestException,
      );
      await expect(
        service.approve(ORG, made.id, admin, {
          scope: RestrictionScope.PLATFORM,
          notes: 'Looked into it',
          memberMessage: MESSAGE,
          reviewOn: new Date(Date.now() + DAY).toISOString(),
        }),
      ).rejects.toThrow(BadRequestException);
      await approve(made.id);
      expect(subject()['status']).toBe(AccountStatus.PERMANENTLY_BANNED);
    });

    it('cannot remove the last Super Admin', async () => {
      roles['subject'] = [UserRole.SUPER_ADMIN];
      const made = await recommend(central);
      superAdminsLeft = 0;
      await expect(approve(made.id, otherCentral)).rejects.toThrow(ConflictException);
    });

    it('cannot be approved twice', async () => {
      const made = await recommend();
      await approve(made.id);
      await expect(approve(made.id, otherAdmin)).rejects.toThrow(ConflictException);
    });

    it('stops their bookings and alerts coordinators to a visit under way', async () => {
      requests.cancelForRestriction.mockResolvedValue({
        cancelled: 2,
        underWay: [{ organizationId: ORG, id: 'r1' }],
      });
      const made = await recommend();
      await approve(made.id);
      expect(requests.cancelForRestriction).toHaveBeenCalledWith(
        manager,
        ['m-subject'],
        'admin',
        undefined,
      );
      expect(notifications.notifyCoordinators).toHaveBeenCalledTimes(1);
      expect(notifications.notifyCoordinators.mock.calls[0]![1]).toMatchObject({
        organizationId: ORG,
        type: 'RESTRICTION_VISIT_UNDER_WAY',
      });
      expect(notifications.notifyCoordinators.mock.calls[0]![2]).toEqual(['subject']);
    });

    it('alerts coordinators when they were helping on a visit under way', async () => {
      helping = [{ organization_id: ORG }];
      await inForce();
      expect(notifications.notifyCoordinators).toHaveBeenCalledTimes(1);
    });

    it('keeps the words out of the audit trail and push text', async () => {
      await inForce();
      const sent = JSON.stringify([
        audit.logEvent.mock.calls,
        notifications.notifyUsers.mock.calls,
      ]);
      expect(sent).not.toContain(REASON);
      expect(sent).not.toContain(MESSAGE);
    });

    it('can be refused, and nothing happens to the person', async () => {
      const made = await recommend();
      await service.refuse(ORG, made.id, admin, { notes: 'Not enough to go on' });
      expect(rows(RestrictionCase)[0]!['status']).toBe(RestrictionCaseStatus.REFUSED);
      expect(subject()['status']).toBe(AccountStatus.ACTIVE);
      expect(events(made.id)).toContain(RestrictionCaseEventType.REFUSED);
    });
  });

  describe('reinstatement', () => {
    const note = { notes: 'They have put it right' };

    it('needs a recommendation, and the recommender cannot also approve', async () => {
      const id = await inForce();
      await expect(service.reinstate(ORG, id, admin, note)).rejects.toThrow(ConflictException);
      await service.recommendReinstatement(ORG, id, admin, note);
      await expect(service.reinstate(ORG, id, admin, note)).rejects.toThrow(ForbiddenException);
      await service.reinstate(ORG, id, otherAdmin, note);
      expect(subject()['status']).toBe(AccountStatus.ACTIVE);
      expect(rows(GlobalAccountRestriction)[0]!['status']).toBe(GlobalRestrictionStatus.RESOLVED);
      expect(rows(RestrictionCase)[0]!['status']).toBe(RestrictionCaseStatus.REINSTATED);
    });

    it('does not let a coordinator approve it', async () => {
      const id = await inForce();
      await service.recommendReinstatement(ORG, id, coordinator, note);
      await expect(service.reinstate(ORG, id, coordinator, note)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('never restores anyone when the review date passes', async () => {
      const made = await recommend();
      await service.approve(ORG, made.id, admin, {
        scope: RestrictionScope.PLATFORM,
        notes: 'Looked into it',
        memberMessage: MESSAGE,
        reviewOn: new Date(Date.now() + DAY).toISOString(),
      });
      const later = new Date(Date.now() + 2 * DAY);
      expect(await service.sendDueReviewReminders(later)).toBe(1);
      expect(subject()['status']).toBe(AccountStatus.SUSPENDED);
      expect(rows(RestrictionCase)[0]!['status']).toBe(RestrictionCaseStatus.ACTIVE);
      expect(await service.sendDueReviewReminders(later)).toBe(0);
    });

    it('leaves a ban to an appeal or a Super Admin', async () => {
      const made = await recommend(coordinator, GlobalRestrictionType.PERMANENT_BAN);
      await approve(made.id);
      await expect(service.recommendReinstatement(ORG, made.id, coordinator, note)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.reinstate(ORG, made.id, admin, note)).rejects.toThrow(ConflictException);
      await service.reinstate(ORG, made.id, central, note);
      expect(subject()['status']).toBe(AccountStatus.ACTIVE);
    });

    it('stays blocked while another restriction remains', async () => {
      const id = await inForce();
      rows(GlobalAccountRestriction).push({
        id: 'other',
        userId: 'subject',
        restrictionType: GlobalRestrictionType.FRAUD_INVESTIGATION_HOLD,
        status: GlobalRestrictionStatus.ACTIVE,
      });
      await service.reinstate(ORG, id, central, note);
      expect(subject()['status']).toBe(AccountStatus.SUSPENDED);
      expect(credits.releaseRestrictionHolds).not.toHaveBeenCalled();
    });

    it('gives back what was held when access returns', async () => {
      const id = await inForce();
      await service.reinstate(ORG, id, central, note);
      expect(credits.releaseRestrictionHolds).toHaveBeenCalledWith(
        manager,
        'subject',
        expect.any(Date),
        'central',
        expect.stringMatching(/^RST-/),
      );
    });

    it('restores a community membership', async () => {
      const id = await inForce(RestrictionScope.COMMUNITY);
      await service.reinstate(ORG, id, central, note);
      expect(membership()['status']).toBe(MembershipStatus.APPROVED);
      expect(credits.releaseRestrictionHolds).not.toHaveBeenCalled();
    });
  });

  describe('a direct restriction', () => {
    it('becomes a case its owner can appeal', async () => {
      const restriction = {
        id: 'direct',
        userId: 'subject',
        restrictionType: GlobalRestrictionType.PERMANENT_BAN,
        reasonCode: 'FRAUD',
        status: GlobalRestrictionStatus.ACTIVE,
      };
      rows(GlobalAccountRestriction).push(restriction);
      await service.afterDirectRestriction(
        manager as never,
        restriction as never,
        subject() as never,
        {},
        'central',
      );
      const [made] = rows(RestrictionCase);
      expect(made).toMatchObject({
        scope: RestrictionScope.PLATFORM,
        status: RestrictionCaseStatus.ACTIVE,
        decidedByUserId: 'central',
        restrictionId: 'direct',
        level: ComplaintLevel.SUPER_ADMIN,
      });
      const { items } = await appeals.mine('subject');
      expect(items[0]!.canAppeal).toBe(true);
      expect(requests.cancelForRestriction).toHaveBeenCalledWith(
        manager,
        ['m-subject'],
        'central',
        undefined,
      );
    });

    it('closes its case when a Super Admin lifts it', async () => {
      const id = await inForce();
      const restriction = rows(GlobalAccountRestriction)[0]!;
      await service.afterDirectLift(
        manager as never,
        restriction as never,
        true,
        'central',
        'Cleared',
      );
      expect(rows(RestrictionCase).find((row) => row['id'] === id)!['status']).toBe(
        RestrictionCaseStatus.REINSTATED,
      );
      expect(credits.releaseRestrictionHolds).toHaveBeenCalledTimes(1);
    });
  });

  describe('appealing a restriction', () => {
    const grounds = { grounds: 'I was not at that visit and can show it.' };

    it('shows the person only what they are told', async () => {
      await inForce();
      const view = await appeals.mine('subject');
      expect(view.items[0]!.memberMessage).toBe(MESSAGE);
      expect(view.items[0]!.canAppeal).toBe(true);
      const text = JSON.stringify(view);
      expect(text).not.toContain(REASON);
      expect(text).not.toContain('coordinator');
      expect(text).not.toContain('admin');
    });

    it('does not let anyone else appeal through the person’s route', async () => {
      const id = await inForce();
      await expect(appeals.fileMine('stranger', id, grounds)).rejects.toThrow(NotFoundException);
    });

    it(`closes after ${APPEAL_WINDOW_DAYS} days`, async () => {
      const id = await inForce();
      const late = new Date(Date.now() + (APPEAL_WINDOW_DAYS + 1) * DAY);
      await expect(appeals.fileMine('subject', id, grounds, undefined, late)).rejects.toThrow(
        ConflictException,
      );
      expect((await appeals.mine('subject', late)).items[0]!.canAppeal).toBe(false);
    });

    it('allows one appeal per decision, and a retry finds the first', async () => {
      const id = await inForce();
      const dto = { ...grounds, clientOperationId: 'operation-1' };
      const first = await appeals.fileMine('subject', id, dto);
      const retry = await appeals.fileMine('subject', id, dto);
      expect(retry.id).toBe(first.id);
      await expect(appeals.fileMine('subject', id, grounds)).rejects.toThrow(ConflictException);
    });

    it('lets staff file for someone who does not use the app, and it stays theirs', async () => {
      const id = await inForce();
      await appeals.fileForMember(ORG, id, coordinator, grounds);
      expect(rows(Appeal)[0]).toMatchObject({
        appellantUserId: 'subject',
        filedByUserId: 'coordinator',
      });
    });

    it('is heard by a Super Admin, never a local administrator', async () => {
      const id = await inForce();
      const filed = await appeals.fileMine('subject', id, grounds);
      await expect(appeals.detail(ORG, filed.id, admin)).rejects.toThrow(NotFoundException);
      await expect(appeals.decide(ORG, filed.id, admin, stands)).rejects.toThrow(NotFoundException);
      expect(await appeals.list(ORG, otherAdmin, true)).toEqual([]);
    });

    it('cannot be heard by someone who took part in the decision', async () => {
      const made = await recommend(central);
      await approve(made.id, otherCentral);
      const filed = await appeals.fileMine('subject', made.id, grounds);
      await expect(appeals.decide(ORG, filed.id, central, stands)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(appeals.decide(ORG, filed.id, otherCentral, stands)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('keeps the person locked out when it fails (AT-09)', async () => {
      const made = await recommend(coordinator, GlobalRestrictionType.PERMANENT_BAN);
      await approve(made.id);
      const filed = await appeals.fileMine('subject', made.id, grounds);
      await appeals.decide(ORG, filed.id, central, stands);
      expect(subject()['status']).toBe(AccountStatus.PERMANENTLY_BANNED);
      expect(rows(GlobalAccountRestriction)[0]!['status']).toBe(GlobalRestrictionStatus.ACTIVE);
      expect(credits.releaseRestrictionHolds).not.toHaveBeenCalled();
      expect(events(made.id)).toContain(RestrictionCaseEventType.APPEAL_STANDS);
      const view = await appeals.mine('subject');
      expect(view.items[0]!.appeal).toMatchObject({
        outcome: AppealOutcome.STANDS,
        memberMessage: 'It stands.',
      });
      expect(view.items[0]!.canAppeal).toBe(false);
    });

    it('restores access and the wallet at once when overturned (BR-11)', async () => {
      const made = await recommend(coordinator, GlobalRestrictionType.PERMANENT_BAN);
      await approve(made.id);
      const filed = await appeals.fileMine('subject', made.id, grounds);
      await appeals.decide(ORG, filed.id, central, overturned);
      expect(subject()['status']).toBe(AccountStatus.ACTIVE);
      expect(rows(GlobalAccountRestriction)[0]!['status']).toBe(
        GlobalRestrictionStatus.OVERTURNED_ON_APPEAL,
      );
      expect(rows(RestrictionCase)[0]!['status']).toBe(RestrictionCaseStatus.OVERTURNED);
      expect(credits.releaseRestrictionHolds).toHaveBeenCalledTimes(1);
      expect((await appeals.mine('subject')).items).toEqual([]);
    });

    it('cannot be decided twice', async () => {
      const id = await inForce();
      const filed = await appeals.fileMine('subject', id, grounds);
      await appeals.decide(ORG, filed.id, central, stands);
      await expect(appeals.decide(ORG, filed.id, otherCentral, overturned)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('appealing a complaint', () => {
    const grounds = { grounds: 'You did not speak to the volunteer at all.' };
    const closed = (level: ComplaintLevel, extra: Record<string, unknown> = {}) => {
      rows(Complaint).push({
        id: 'c1',
        reference: 'CMP-1',
        organizationId: ORG,
        raisedByUserId: 'subject',
        status: ComplaintStatus.CLOSED,
        outcome: ComplaintOutcome.NOT_UPHELD,
        level,
        memberMessage: 'We found nothing.',
        decidedAt: new Date(),
        decidedByUserId: 'coordinator',
        ...extra,
      });
    };

    it('only the person who complained can challenge it', async () => {
      closed(ComplaintLevel.COORDINATOR);
      await expect(appeals.fileOnComplaint(ORG, 'c1', 'stranger', grounds)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('needs a decision first', async () => {
      closed(ComplaintLevel.COORDINATOR, { status: ComplaintStatus.OPEN });
      await expect(appeals.fileOnComplaint(ORG, 'c1', 'subject', grounds)).rejects.toThrow(
        ConflictException,
      );
    });

    it('goes up one level, out of the decider’s hands', async () => {
      closed(ComplaintLevel.COORDINATOR);
      await appeals.fileOnComplaint(ORG, 'c1', 'subject', grounds);
      expect(rows(Appeal)[0]!['level']).toBe(ComplaintLevel.MUNICIPALITY_ADMIN);
      expect(rows(Complaint)[0]!['level']).toBe(ComplaintLevel.MUNICIPALITY_ADMIN);
      expect(complaints.notifyHandlers.mock.calls[0]![3]).toEqual(['coordinator']);
    });

    it('stops at a Super Admin’s decision, which is final', async () => {
      closed(ComplaintLevel.SUPER_ADMIN);
      await expect(appeals.fileOnComplaint(ORG, 'c1', 'subject', grounds)).rejects.toThrow(
        ConflictException,
      );
    });

    it('changes the outcome when overturned, and can go up once more', async () => {
      closed(ComplaintLevel.COORDINATOR);
      const filed = await appeals.fileOnComplaint(ORG, 'c1', 'subject', grounds);
      await appeals.decide(ORG, filed.id, admin, overturned);
      expect(rows(Complaint)[0]).toMatchObject({
        outcome: ComplaintOutcome.UPHELD,
        memberMessage: 'We got this wrong.',
        decidedByUserId: 'admin',
      });
      const next = await appeals.fileOnComplaint(ORG, 'c1', 'subject', grounds);
      expect(next.status).toBe(AppealStatus.OPEN);
      expect(rows(Appeal)[1]!['level']).toBe(ComplaintLevel.SUPER_ADMIN);
    });

    it('cannot be heard by whoever decided it', async () => {
      closed(ComplaintLevel.COORDINATOR, { decidedByUserId: 'admin' });
      const filed = await appeals.fileOnComplaint(ORG, 'c1', 'subject', grounds);
      await expect(appeals.decide(ORG, filed.id, admin, stands)).rejects.toThrow(
        ForbiddenException,
      );
      await appeals.decide(ORG, filed.id, otherAdmin, stands);
      expect(rows(Complaint)[0]!['outcome']).toBe(ComplaintOutcome.NOT_UPHELD);
    });

    it('is hidden from anyone part of the complaint', async () => {
      closed(ComplaintLevel.COORDINATOR);
      const filed = await appeals.fileOnComplaint(ORG, 'c1', 'subject', grounds);
      complaints.canHandle.mockResolvedValue(false);
      await expect(appeals.detail(ORG, filed.id, admin)).rejects.toThrow(NotFoundException);
    });
  });
});

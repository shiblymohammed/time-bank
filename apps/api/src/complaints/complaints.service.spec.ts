import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  ComplaintLevel,
  ComplaintOutcome,
  ComplaintStatus,
  ComplaintSubject,
  UserRole,
} from '@ktb/shared-types';
import { OrganizationMembership } from '../memberships/entities/organization-membership.entity';
import { ServiceRequest } from '../requests/entities/service-request.entity';
import { VolunteerAssignment } from '../matching/entities/volunteer-assignment.entity';
import { ComplaintsService, levelsFor, DAILY_COMPLAINT_LIMIT } from './complaints.service';
import { ComplaintEvent } from './entities/complaint-event.entity';
import { Complaint } from './entities/complaint.entity';

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
const member = person('member', [UserRole.BENEFICIARY]);
const coordinator = person('coordinator', [UserRole.COORDINATOR]);
const admin = person('admin', [UserRole.MUNICIPALITY_ADMIN]);
const superAdmin = person('central', [UserRole.SUPER_ADMIN], true);
const WORDS = 'They shouted at my mother during the visit';

describe('levelsFor', () => {
  it('lets each role reach its own level and those below, never above', () => {
    expect(levelsFor(member)).toEqual([]);
    expect(levelsFor(coordinator)).toEqual([ComplaintLevel.COORDINATOR]);
    expect(levelsFor(admin)).toEqual([
      ComplaintLevel.COORDINATOR,
      ComplaintLevel.MUNICIPALITY_ADMIN,
    ]);
    expect(levelsFor(superAdmin)).toEqual(Object.values(ComplaintLevel));
  });
});

describe('ComplaintsService', () => {
  let complaints: Complaint[];
  let events: Partial<ComplaintEvent>[];
  let members: Partial<OrganizationMembership>[];
  let requests: Partial<ServiceRequest>[];
  let assignments: Partial<VolunteerAssignment>[];
  let staff: { user_id: string; role: UserRole }[];
  /** User ids on the linked visit. */
  let onVisit: string[];
  let notifications: { notifyUsers: jest.Mock };
  let audit: { logEvent: jest.Mock };
  let service: ComplaintsService;

  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, wanted]) => {
      const operator = wanted as { _type?: string; _value?: unknown };
      if (operator?._type === 'moreThan') return true;
      if (operator?._type === 'in') return (operator._value as unknown[]).includes(row[key]);
      if (operator?._type === 'not') {
        const inner = operator._value as { _type?: string; _value?: unknown[] };
        if (inner?._type === 'isNull') return row[key] !== null && row[key] !== undefined;
        return inner?._type === 'in' ? !inner._value!.includes(row[key]) : row[key] !== inner;
      }
      return row[key] === wanted;
    });
  const rowsOf = (entity: unknown): Record<string, unknown>[] => {
    const table =
      entity === Complaint
        ? complaints
        : entity === OrganizationMembership
          ? members
          : entity === ServiceRequest
            ? requests
            : entity === VolunteerAssignment
              ? assignments
              : entity === ComplaintEvent
                ? events
                : [];
    return table as Record<string, unknown>[];
  };

  const manager = {
    query: jest.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('pg_advisory')) return [];
      if (sql.includes('service_requests r')) {
        return onVisit.includes(parameters[1] as string)
          ? (parameters[0] as string[]).map((id) => ({ id }))
          : [];
      }
      if (sql.includes(`g.role = 'SUPER_ADMIN'`)) {
        return staff.filter((row) => row.role === UserRole.SUPER_ADMIN);
      }
      const roles = parameters[1] as UserRole[];
      return staff.filter((row) => roles.includes(row.role));
    }),
    findOne: jest.fn(
      async (entity: unknown, options: { where: Record<string, unknown> }) =>
        rowsOf(entity).find((row) => matches(row, options.where)) ?? null,
    ),
    find: jest.fn(async (entity: unknown, options: { where: Record<string, unknown> }) =>
      rowsOf(entity).filter((row) => matches(row, options.where)),
    ),
    count: jest.fn(
      async (entity: unknown, options: { where: Record<string, unknown> }) =>
        rowsOf(entity).filter((row) => matches(row, options.where)).length,
    ),
    exists: jest.fn(async (entity: unknown, options: { where: Record<string, unknown> }) =>
      rowsOf(entity).some((row) => matches(row, options.where)),
    ),
    create: jest.fn((_entity: unknown, values: object) => ({ ...values })),
    save: jest.fn(async (_entity: unknown, row: Complaint) => {
      if (!row.id) {
        row.id = `c-${complaints.length + 1}`;
        row.createdAt = new Date();
        complaints.push(row);
      }
      return row;
    }),
    insert: jest.fn(async (_entity: unknown, row: Partial<ComplaintEvent>) => {
      events.push(row);
    }),
  };

  const raise = (
    subject = ComplaintSubject.SERVICE_OR_MEMBER,
    extra: Record<string, string> = {},
    who = member,
  ) => service.raise(ORG, who, { subject, description: WORDS, ...extra });
  const pushedTo = () => notifications.notifyUsers.mock.calls.at(-1)![1] as string[];
  const pushed = () => notifications.notifyUsers.mock.calls.at(-1)![2] as Record<string, string>;

  beforeEach(() => {
    jest.clearAllMocks();
    complaints = [];
    events = [];
    requests = [];
    assignments = [];
    onVisit = [];
    members = ['member', 'coordinator', 'admin'].map((id) => ({
      id: `m-${id}`,
      userId: id,
      organizationId: ORG,
      status: 'APPROVED' as never,
    }));
    staff = [
      { user_id: 'coordinator', role: UserRole.COORDINATOR },
      { user_id: 'admin', role: UserRole.MUNICIPALITY_ADMIN },
      { user_id: 'central', role: UserRole.SUPER_ADMIN },
    ];
    notifications = { notifyUsers: jest.fn() };
    audit = { logEvent: jest.fn() };
    const dataSource = {
      manager,
      transaction: jest.fn(async (_level: string, work: (m: typeof manager) => unknown) =>
        work(manager),
      ),
      getRepository: (entity: unknown) => ({
        find: (options: { where: Record<string, unknown> }) => manager.find(entity, options),
      }),
    };
    service = new ComplaintsService(dataSource as never, notifications as never, audit as never);
  });

  describe('making a complaint', () => {
    it.each([
      [ComplaintSubject.SERVICE_OR_MEMBER, ComplaintLevel.COORDINATOR, ['coordinator', 'admin']],
      [ComplaintSubject.COORDINATOR, ComplaintLevel.MUNICIPALITY_ADMIN, ['admin']],
      [ComplaintSubject.MUNICIPALITY_ADMIN, ComplaintLevel.SUPER_ADMIN, ['central']],
    ])('sends a complaint about %s to %s', async (subject, level, told) => {
      await raise(subject);
      expect(complaints[0]!.level).toBe(level);
      expect(pushedTo()).toEqual(told);
    });

    it('tells a Super Admin when nobody local can take it', async () => {
      staff = staff.filter((row) => row.role !== UserRole.MUNICIPALITY_ADMIN);
      await raise(ComplaintSubject.COORDINATOR);
      expect(pushedTo()).toEqual(['central']);
    });

    it('does not tell the person who complained, or anyone on the visit', async () => {
      requests = [{ id: 'r1', organizationId: ORG, beneficiaryMembershipId: 'm-member' }];
      onVisit = ['coordinator'];
      await raise(ComplaintSubject.SERVICE_OR_MEMBER, { serviceRequestId: 'r1' });
      expect(pushedTo()).toEqual(['admin']);
    });

    it('never puts the words in a push or the audit trail', async () => {
      await raise();
      expect(JSON.stringify(notifications.notifyUsers.mock.calls)).not.toContain(WORDS);
      expect(JSON.stringify(audit.logEvent.mock.calls)).not.toContain(WORDS);
    });

    it('shows the member nothing about who holds it', async () => {
      const view = await raise();
      expect(view.reference).toMatch(/^CMP-\d{6}-[0-9A-F]{8}$/);
      expect(view).not.toHaveProperty('level');
      expect(view).not.toHaveProperty('handledByUserId');
    });

    it('refuses someone who is not a member, even a Super Admin', async () => {
      await expect(raise(undefined, {}, superAdmin)).rejects.toThrow(ForbiddenException);
    });

    it('gives the same refusal for a visit that is not theirs as for one that does not exist', async () => {
      requests = [{ id: 'r1', organizationId: ORG, beneficiaryMembershipId: 'm-other' }];
      const theirs = raise(undefined, { serviceRequestId: 'r1' });
      await expect(theirs).rejects.toThrow('Visit not found');
      const missing = raise(undefined, { serviceRequestId: 'r2' });
      await expect(missing).rejects.toThrow('Visit not found');
    });

    it('lets a volunteer who accepted link the visit, but not one only offered it', async () => {
      requests = [{ id: 'r1', organizationId: ORG, beneficiaryMembershipId: 'm-other' }];
      assignments = [
        {
          serviceRequestId: 'r1',
          volunteerMembershipId: 'm-member',
          status: 'CANCELLED' as never,
          acceptedAt: null,
        },
      ];
      await expect(raise(undefined, { serviceRequestId: 'r1' })).rejects.toThrow(NotFoundException);
      assignments[0]!.acceptedAt = new Date();
      await expect(raise(undefined, { serviceRequestId: 'r1' })).resolves.toBeDefined();
    });

    it('stops at the daily limit', async () => {
      for (let i = 0; i < DAILY_COMPLAINT_LIMIT; i++) await raise();
      await expect(raise()).rejects.toMatchObject({ status: 429 });
    });

    it('finds the same complaint on a retry', async () => {
      const first = await raise(undefined, { clientOperationId: 'operation-1' });
      const again = await raise(undefined, { clientOperationId: 'operation-1' });
      expect(again.id).toBe(first.id);
      expect(complaints).toHaveLength(1);
    });
  });

  describe('who can read it', () => {
    const read = (who: never) => service.detail(ORG, complaints[0]!.id, who);

    it('hides a complaint about coordinators from coordinators', async () => {
      await raise(ComplaintSubject.COORDINATOR);
      await expect(read(coordinator)).rejects.toThrow(NotFoundException);
      await expect(service.take(ORG, complaints[0]!.id, coordinator)).rejects.toThrow(
        NotFoundException,
      );
      await expect(read(admin)).resolves.toBeDefined();
    });

    it('hides a complaint about an administrator from administrators', async () => {
      await raise(ComplaintSubject.MUNICIPALITY_ADMIN);
      await expect(read(admin)).rejects.toThrow(NotFoundException);
      await expect(read(superAdmin)).resolves.toBeDefined();
    });

    it('hides a complaint from a member, and from the staff member who raised it', async () => {
      await raise();
      await expect(read(member)).rejects.toThrow(NotFoundException);
      await raise(undefined, {}, coordinator);
      await expect(service.detail(ORG, complaints[1]!.id, coordinator)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('hides a complaint about a visit from staff who were part of it', async () => {
      requests = [{ id: 'r1', organizationId: ORG, beneficiaryMembershipId: 'm-member' }];
      await raise(undefined, { serviceRequestId: 'r1' });
      onVisit = ['coordinator'];
      await expect(read(coordinator)).rejects.toThrow(NotFoundException);
      await expect(read(admin)).resolves.toBeDefined();
    });

    it('records a Super Admin reading one below their level, but not one at it', async () => {
      await raise();
      audit.logEvent.mockClear();
      await read(superAdmin);
      expect(audit.logEvent.mock.calls[0]![0].eventType).toBe('COMPLAINT_READ_CENTRALLY');

      await raise(ComplaintSubject.MUNICIPALITY_ADMIN);
      audit.logEvent.mockClear();
      await service.detail(ORG, complaints[1]!.id, superAdmin);
      expect(audit.logEvent).not.toHaveBeenCalled();
    });

    it('lists no words or names, and only what this person can reach', async () => {
      await raise();
      await raise(ComplaintSubject.COORDINATOR);
      const list = await service.listForStaff(ORG, coordinator, true);
      expect(list.map((row) => row.id)).toEqual([complaints[0]!.id]);
      expect(JSON.stringify(list)).not.toContain(WORDS);
      expect(list[0]).not.toHaveProperty('raisedByUserId');
    });

    it('refuses the staff list to a member', async () => {
      await expect(service.listForStaff(ORG, member, true)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handling it', () => {
    const decision = {
      outcome: ComplaintOutcome.UPHELD,
      notes: 'Spoke to both people',
      memberMessage: 'We have spoken to the volunteer.',
    };

    it('passes up with the history, and the lower level loses it', async () => {
      await raise();
      await service.take(ORG, complaints[0]!.id, coordinator);
      await service.passUp(ORG, complaints[0]!.id, coordinator, 'I know this family');
      expect(complaints[0]).toMatchObject({
        level: ComplaintLevel.MUNICIPALITY_ADMIN,
        status: ComplaintStatus.OPEN,
        handledByUserId: null,
      });
      expect(pushedTo()).toEqual(['admin']);
      await expect(service.detail(ORG, complaints[0]!.id, coordinator)).rejects.toThrow(
        NotFoundException,
      );
      const detail = await service.detail(ORG, complaints[0]!.id, admin);
      expect(detail.events.map((event) => event.type)).toEqual(['RAISED', 'TAKEN', 'PASSED_UP']);
    });

    it('stops at the Super Admin', async () => {
      await raise(ComplaintSubject.MUNICIPALITY_ADMIN);
      await expect(service.passUp(ORG, complaints[0]!.id, superAdmin, 'Going up')).rejects.toThrow(
        ConflictException,
      );
    });

    it('closes with a message for the member, sent as a generic push', async () => {
      await raise();
      await service.decide(ORG, complaints[0]!.id, coordinator, decision);
      expect(complaints[0]!.status).toBe(ComplaintStatus.CLOSED);
      expect(pushedTo()).toEqual(['member']);
      expect(pushed()!.body).not.toContain('spoken');

      const [mine] = await service.listMine(ORG, 'member');
      expect(mine).toMatchObject({
        outcome: ComplaintOutcome.UPHELD,
        memberMessage: decision.memberMessage,
      });
      expect(JSON.stringify(mine)).not.toContain(decision.notes);
    });

    it('allows nothing more once closed', async () => {
      await raise();
      await service.decide(ORG, complaints[0]!.id, coordinator, decision);
      await expect(service.decide(ORG, complaints[0]!.id, admin, decision)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.addNote(ORG, complaints[0]!.id, admin, 'Late note')).rejects.toThrow(
        ConflictException,
      );
    });

    it('keeps staff notes out of the audit trail', async () => {
      await raise();
      await service.addNote(ORG, complaints[0]!.id, coordinator, 'Private note about the family');
      expect(JSON.stringify(audit.logEvent.mock.calls)).not.toContain('Private note');
      expect(events.at(-1)!.notes).toBe('Private note about the family');
    });
  });
});

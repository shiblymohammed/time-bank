import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServiceRequestStatus } from '@ktb/shared-types';
import { MatchingSchedulerService } from './matching-scheduler.service';
import { MatchingService } from './matching.service';
import { TeamService } from './team.service';
import { AuditService } from '../audit/audit.service';
import { ServiceRequest } from '../requests/entities/service-request.entity';

// ─── Minimal stubs ───────────────────────────────────────────────────────────

const makeRequest = (
  overrides: Partial<ServiceRequest> = {},
): ServiceRequest =>
  ({
    id: 'req-1',
    organizationId: 'org-1',
    status: ServiceRequestStatus.MATCHING_ACTIVE,
    matchingTier: 1,
    scheduledStartTime: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    ...overrides,
  }) as ServiceRequest;

function makeRepo(requests: ServiceRequest[] = []) {
  return {
    find: jest.fn().mockResolvedValue(requests),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    }),
  };
}

function makeMatchingService() {
  return {
    evaluateRoundProgression: jest.fn().mockResolvedValue({}),
    processExpiredOffers: jest.fn().mockResolvedValue(0),
  };
}

function makeAuditService() {
  return { logEvent: jest.fn().mockResolvedValue(undefined) };
}

async function build(
  requests: ServiceRequest[],
  matchingSvc = makeMatchingService(),
  auditSvc = makeAuditService(),
) {
  const repo = makeRepo(requests);
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      MatchingSchedulerService,
      { provide: getRepositoryToken(ServiceRequest), useValue: repo },
      { provide: MatchingService, useValue: matchingSvc },
      { provide: AuditService, useValue: auditSvc },
    ],
  }).compile();

  return {
    scheduler: module.get(MatchingSchedulerService),
    repo,
    matchingSvc,
    auditSvc,
  };
}

// ─── expireOffersAndAdvanceRounds ────────────────────────────────────────────

describe('MatchingSchedulerService — expireOffersAndAdvanceRounds', () => {
  it('calls evaluateRoundProgression once per active request', async () => {
    const requests = [
      makeRequest({ id: 'req-1' }),
      makeRequest({ id: 'req-2', status: ServiceRequestStatus.PARTIALLY_ACCEPTED }),
    ];
    const { scheduler, matchingSvc } = await build(requests);

    await scheduler.expireOffersAndAdvanceRounds();

    expect(matchingSvc.evaluateRoundProgression).toHaveBeenCalledTimes(2);
    expect(matchingSvc.evaluateRoundProgression).toHaveBeenCalledWith('org-1', 'req-1');
    expect(matchingSvc.evaluateRoundProgression).toHaveBeenCalledWith('org-1', 'req-2');
  });

  it('does nothing when there are no active requests', async () => {
    const { scheduler, matchingSvc } = await build([]);

    await scheduler.expireOffersAndAdvanceRounds();

    expect(matchingSvc.evaluateRoundProgression).not.toHaveBeenCalled();
  });

  it('continues processing remaining requests when one throws', async () => {
    const requests = [
      makeRequest({ id: 'req-fail' }),
      makeRequest({ id: 'req-ok' }),
    ];
    const matchingSvc = makeMatchingService();
    matchingSvc.evaluateRoundProgression
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce({});

    const { scheduler } = await build(requests, matchingSvc);

    // Should not throw — errors are swallowed and logged
    await expect(scheduler.expireOffersAndAdvanceRounds()).resolves.toBeUndefined();
    expect(matchingSvc.evaluateRoundProgression).toHaveBeenCalledTimes(2);
  });

  it('skips if a previous run is still in progress', async () => {
    const requests = [makeRequest()];
    const { scheduler, matchingSvc } = await build(requests);

    // Simulate overlap: set the flag manually
    (scheduler as unknown as Record<string, boolean>)['advanceRunning'] = true;

    await scheduler.expireOffersAndAdvanceRounds();

    expect(matchingSvc.evaluateRoundProgression).not.toHaveBeenCalled();

    // Reset
    (scheduler as unknown as Record<string, boolean>)['advanceRunning'] = false;
  });
});

// ─── markExpiredUnmatched ─────────────────────────────────────────────────────

describe('MatchingSchedulerService — markExpiredUnmatched', () => {
  it('marks a past-due request with no accepted volunteers as EXPIRED_UNMATCHED', async () => {
    const pastDue = makeRequest({
      id: 'req-past',
      scheduledStartTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    });
    const { scheduler, repo, matchingSvc, auditSvc } = await build([pastDue]);

    await scheduler.markExpiredUnmatched();

    expect(matchingSvc.processExpiredOffers).toHaveBeenCalledWith('req-past');
    expect(repo.update).toHaveBeenCalledWith(
      { id: 'req-past' },
      { status: ServiceRequestStatus.EXPIRED_UNMATCHED },
    );
    expect(auditSvc.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'REQUEST_EXPIRED_UNMATCHED',
        targetId: 'req-past',
        organizationId: 'org-1',
      }),
    );
  });

  it('skips a past-due request that already has accepted volunteers', async () => {
    const pastDue = makeRequest({ id: 'req-has-accepted' });
    const repo = makeRepo([pastDue]);
    // getCount returns 1 — volunteer has already accepted
    repo.createQueryBuilder().getCount = jest.fn().mockResolvedValue(1);

    const matchingSvc = makeMatchingService();
    const auditSvc = makeAuditService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingSchedulerService,
        { provide: getRepositoryToken(ServiceRequest), useValue: repo },
        { provide: MatchingService, useValue: matchingSvc },
        { provide: AuditService, useValue: auditSvc },
      ],
    }).compile();

    const scheduler = module.get(MatchingSchedulerService);
    await scheduler.markExpiredUnmatched();

    // Should not expire or audit
    expect(repo.update).not.toHaveBeenCalled();
    expect(auditSvc.logEvent).not.toHaveBeenCalled();
  });

  it('does nothing when no past-due requests exist', async () => {
    const { scheduler, repo, auditSvc } = await build([]);

    await scheduler.markExpiredUnmatched();

    expect(repo.update).not.toHaveBeenCalled();
    expect(auditSvc.logEvent).not.toHaveBeenCalled();
  });

  it('continues when one request update fails', async () => {
    const requests = [makeRequest({ id: 'req-fail' }), makeRequest({ id: 'req-ok' })];
    const repo = makeRepo(requests);
    // First update throws, second succeeds
    repo.update
      .mockRejectedValueOnce(new Error('DB lock'))
      .mockResolvedValueOnce({ affected: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchingSchedulerService,
        { provide: getRepositoryToken(ServiceRequest), useValue: repo },
        { provide: MatchingService, useValue: makeMatchingService() },
        { provide: AuditService, useValue: makeAuditService() },
      ],
    }).compile();

    const scheduler = module.get(MatchingSchedulerService);
    await expect(scheduler.markExpiredUnmatched()).resolves.toBeUndefined();
  });

  it('skips if a previous run is still in progress', async () => {
    const { scheduler, repo } = await build([makeRequest()]);

    (scheduler as unknown as Record<string, boolean>)['expireRunning'] = true;

    await scheduler.markExpiredUnmatched();

    expect(repo.update).not.toHaveBeenCalled();

    (scheduler as unknown as Record<string, boolean>)['expireRunning'] = false;
  });
});

// ─── onApplicationBootstrap ───────────────────────────────────────────────────

describe('MatchingSchedulerService — onApplicationBootstrap', () => {
  it('fires both jobs on startup without blocking', async () => {
    const { scheduler, matchingSvc } = await build([makeRequest()]);

    await scheduler.onApplicationBootstrap();

    // Give the microtask queue a tick to run the async voids
    await new Promise((r) => setTimeout(r, 50));

    expect(matchingSvc.evaluateRoundProgression).toHaveBeenCalled();
  });
});

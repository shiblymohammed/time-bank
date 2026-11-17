import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@ktb/shared-types';
import { InstantHelpService, instantMinutes } from './instant-help.service';

describe('Instant help review boundaries', () => {
  const pending = {
    id: 'session',
    organization_id: 'org',
    user_id: 'volunteer',
    status: 'PENDING',
    version: 2,
    reported_minutes: 30,
  };
  function setup(row = pending, roles: UserRole[] = [UserRole.COORDINATOR]) {
    const manager = { query: jest.fn().mockResolvedValue([row]) };
    const db = { transaction: (fn: (m: unknown) => unknown) => fn(manager) };
    const auth = {
      evaluateOrganizationAccess: jest
        .fn()
        .mockResolvedValue({ isSuperAdmin: false, roles, membershipId: 'member' }),
    };
    const ledger = { postServiceEarning: jest.fn() };
    const audit = { logEvent: jest.fn() };
    const notifications = { enqueue: jest.fn(), notifyCoordinators: jest.fn() };
    return {
      service: new InstantHelpService(
        db as any,
        auth as any,
        ledger as any,
        audit as any,
        notifications as any,
      ),
      ledger,
    };
  }
  const dto = {
    decision: 'APPROVE' as const,
    version: 2,
    minutes: 30,
    notes: 'Verified location and evidence',
  };
  it('uses server elapsed time with a minimum whole minute', () => {
    expect(instantMinutes(new Date(0), new Date(1))).toBe(1);
    expect(instantMinutes(new Date(0), new Date(60000))).toBe(1);
    expect(instantMinutes(new Date(0), new Date(60001))).toBe(2);
  });
  it('never lets staff approve their own session', async () => {
    const { service, ledger } = setup();
    await expect(service.review('org', 'volunteer', 'session', dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(ledger.postServiceEarning).not.toHaveBeenCalled();
  });
  it('requires coordinator authority independently of the route guard', async () => {
    const { service, ledger } = setup(pending, [UserRole.VOLUNTEER]);
    await expect(service.review('org', 'other', 'session', dto)).rejects.toThrow(
      ForbiddenException,
    );
    expect(ledger.postServiceEarning).not.toHaveBeenCalled();
  });
  it('refuses stale review versions before moving credits', async () => {
    const { service, ledger } = setup();
    await expect(service.review('org', 'staff', 'session', { ...dto, version: 1 })).rejects.toThrow(
      ConflictException,
    );
    expect(ledger.postServiceEarning).not.toHaveBeenCalled();
  });
  it('cannot award more than the recorded duration', async () => {
    const { service, ledger } = setup();
    await expect(
      service.review('org', 'staff', 'session', { ...dto, minutes: 31 }),
    ).rejects.toThrow(BadRequestException);
    expect(ledger.postServiceEarning).not.toHaveBeenCalled();
  });
  it('cannot pay an already approved session', async () => {
    const { service, ledger } = setup({ ...pending, status: 'APPROVED' });
    await expect(service.review('org', 'staff', 'session', dto)).rejects.toThrow(ConflictException);
    expect(ledger.postServiceEarning).not.toHaveBeenCalled();
  });
  it('cannot approve a still-running timer', async () => {
    const { service, ledger } = setup({ ...pending, status: 'RUNNING' });
    await expect(service.review('org', 'staff', 'session', dto)).rejects.toThrow(ConflictException);
    expect(ledger.postServiceEarning).not.toHaveBeenCalled();
  });
  it('requires both location coordinates, including when both are missing', async () => {
    const { service } = setup();
    await expect(
      service.start('org', 'volunteer', {
        key: '12345678',
        description: 'Helping a neighbour',
        locationLabel: 'Town centre',
        latitude: 10,
        longitude: undefined as unknown as number,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

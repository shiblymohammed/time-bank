import { BadRequestException, ConflictException } from '@nestjs/common';
import { alreadyDone, fingerprint, latest, LATE_SEND_MS, phoneTime } from './visit-operations';
import { sameRequestDetails } from '../requests/requests.service';

describe('phone times (FR-OFF-01)', () => {
  const now = new Date('2026-11-10T06:00:00Z');

  it('uses the server time when the phone sends none', () => {
    expect(phoneTime(undefined, now)).toEqual({ at: now, receivedLate: null });
  });

  it('keeps a recent phone time without calling it late', () => {
    const at = new Date(now.getTime() - LATE_SEND_MS + 1000);
    expect(phoneTime(at.toISOString(), now)).toEqual({ at, receivedLate: null });
  });

  it('marks a time sent more than two minutes later as recorded offline', () => {
    const at = new Date('2026-11-10T05:00:00Z');
    expect(phoneTime(at.toISOString(), now)).toEqual({ at, receivedLate: now });
  });

  it('treats a time still to come as now, so a fast clock adds nothing', () => {
    expect(phoneTime('2026-11-10T07:00:00Z', now)).toEqual({ at: now, receivedLate: null });
  });

  it('refuses a time more than 12 hours old', () => {
    expect(() => phoneTime('2026-11-09T17:59:00Z', now)).toThrow(ConflictException);
    expect(() => phoneTime('2026-11-09T18:00:00Z', now)).not.toThrow();
  });

  it('refuses something that is not a time', () => {
    expect(() => phoneTime('soon', now)).toThrow(BadRequestException);
  });

  it('picks the latest time, ignoring missing ones', () => {
    const a = new Date('2026-11-10T05:00:00Z');
    const b = new Date('2026-11-10T05:30:00Z');
    expect(latest(a, null, b, undefined)).toEqual(b);
  });
});

describe('operation IDs (FR-OFF-03)', () => {
  const manager = (rows: unknown[]) => ({ query: jest.fn().mockResolvedValue(rows) }) as never;
  const print = fingerprint({ action: 'START', assignmentId: 'a', at: null });

  it('does nothing without an operation ID', async () => {
    const m = manager([]);
    await expect(alreadyDone(m, 'm', undefined, 'START', 'a', print)).resolves.toBe(false);
  });

  it('finds a retry of the same change', async () => {
    const m = manager([{ action: 'START', assignment_id: 'a', fingerprint: print }]);
    await expect(alreadyDone(m, 'm', 'op-12345', 'START', 'a', print)).resolves.toBe(true);
  });

  it.each([
    ['another action', { action: 'FINISH', assignment_id: 'a', fingerprint: print }],
    ['another visit', { action: 'START', assignment_id: 'b', fingerprint: print }],
    ['other details', { action: 'START', assignment_id: 'a', fingerprint: 'x'.repeat(64) }],
  ])('refuses the same ID used for %s', async (_, row) => {
    await expect(alreadyDone(manager([row]), 'm', 'op-12345', 'START', 'a', print)).rejects.toThrow(
      'already sent with different details',
    );
  });

  it('gives the same fingerprint only for the same details', () => {
    expect(fingerprint({ a: 1, b: 'x' })).toBe(fingerprint({ a: 1, b: 'x' }));
    expect(fingerprint({ a: 1, b: 'x' })).not.toBe(fingerprint({ a: 1, b: 'y' }));
  });
});

describe('reused request keys (FR-OFF-03)', () => {
  const dto = {
    serviceCatalogId: 'c',
    urgency: 'SCHEDULED',
    scheduledStartTime: '2026-11-20T04:30:00.000Z',
    locationAddressText: 'House 1',
    locationWardNumber: '12',
    locationPostalCode: '676503',
  } as never;
  const saved = {
    serviceCatalogId: 'c',
    urgency: 'SCHEDULED',
    beneficiaryMembershipId: 'b',
    scheduledStartTime: new Date('2026-11-20T04:30:00.000Z'),
    expectedDurationMinutes: 60,
    locationAddressText: 'House 1',
    locationWardNumber: '12',
    locationLandmark: null,
    locationPostalCode: '676503',
    beneficiaryNotes: null,
    locationLat: null,
    locationLng: null,
    latestRescheduleId: null,
  } as never;

  it('accepts a true retry', () => {
    expect(sameRequestDetails(saved, dto)).toBe(true);
  });

  it.each([
    ['service', { serviceCatalogId: 'other' }],
    ['address', { locationAddressText: 'House 2' }],
    ['time', { scheduledStartTime: '2026-11-21T04:30:00.000Z' }],
    ['length', { expectedDurationMinutes: 90 }],
    ['notes', { beneficiaryNotes: 'Bring a wheelchair' }],
    ['place on the map', { locationLat: 11.0 }],
  ])('refuses a different %s', (_, change) => {
    expect(sameRequestDetails(saved, { ...(dto as object), ...change } as never)).toBe(false);
  });

  it('still accepts the retry once a reschedule has moved the time', () => {
    const moved = {
      ...(saved as object),
      latestRescheduleId: 'r',
      scheduledStartTime: new Date('2026-11-22T04:30:00.000Z'),
    } as never;
    expect(sameRequestDetails(moved, dto)).toBe(true);
  });

  it('compares saved coordinates as numbers', () => {
    const placed = { ...(saved as object), locationLat: '11.0000000' } as never;
    expect(sameRequestDetails(placed, { ...(dto as object), locationLat: 11 } as never)).toBe(true);
  });
});

import { attendanceLimitMinutes, distanceMeters } from './community-participation.service';

describe('event check-in distance', () => {
  it('is zero at the same point', () => {
    expect(distanceMeters(10.9982, 76.0011, 10.9982, 76.0011)).toBe(0);
  });

  it('measures short distances in metres', () => {
    // 0.001° of latitude is about 111 m everywhere.
    expect(Math.round(distanceMeters(10.9982, 76.0011, 10.9992, 76.0011))).toBe(111);
    // Kottakkal bus stand to a point roughly 1 km east.
    const km = distanceMeters(10.9982, 76.0011, 10.9982, 76.0102);
    expect(km).toBeGreaterThan(980);
    expect(km).toBeLessThan(1010);
  });
});

describe('attendance limit', () => {
  const starts = new Date('2026-11-21T03:00:00Z');
  const ends = new Date('2026-11-21T06:00:00Z');

  it('counts from the start when the member checked in early or on time', () => {
    expect(attendanceLimitMinutes(starts, ends, starts)).toBe(180);
    expect(attendanceLimitMinutes(starts, ends, new Date('2026-11-21T02:50:00Z'))).toBe(180);
  });

  it('counts only from check-in when the member arrived late', () => {
    expect(attendanceLimitMinutes(starts, ends, new Date('2026-11-21T04:30:00Z'))).toBe(90);
    expect(attendanceLimitMinutes(starts, ends, new Date('2026-11-21T05:59:30Z'))).toBe(0);
  });

  it('never exceeds one day', () => {
    const later = new Date('2026-11-24T03:00:00Z');
    expect(attendanceLimitMinutes(starts, later, starts)).toBe(1440);
  });
});

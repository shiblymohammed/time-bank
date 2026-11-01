import { creditsForMinutes } from './time-ledger.service';

describe('creditsForMinutes (FR-TIME-02)', () => {
  const policy = { baseCreditRateHourly: 1, creditMultiplier: 1, allowPartialHours: true };

  it('pays one credit per hour, rounded to hundredths', () => {
    expect(creditsForMinutes(60, policy)).toBe(1);
    expect(creditsForMinutes(90, policy)).toBe(1.5);
    expect(creditsForMinutes(1, policy)).toBe(0.02);
    expect(creditsForMinutes(20, policy)).toBe(0.33);
    expect(creditsForMinutes(720, policy)).toBe(12);
  });

  it('applies the base rate and multiplier without floating-point drift', () => {
    expect(creditsForMinutes(90, { ...policy, creditMultiplier: 1.5 })).toBe(2.25);
    expect(
      creditsForMinutes(70, { ...policy, baseCreditRateHourly: 1.1, creditMultiplier: 1.3 }),
    ).toBe(1.67);
  });

  it('counts whole hours only when partial hours are not allowed', () => {
    const whole = { ...policy, allowPartialHours: false };
    expect(creditsForMinutes(59, whole)).toBe(0);
    expect(creditsForMinutes(119, whole)).toBe(1);
    expect(creditsForMinutes(120, whole)).toBe(2);
  });
});

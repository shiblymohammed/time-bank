import { requestCreditEstimate } from './request-credit-accounting';

describe('volunteer request quote', () => {
  const policy = { baseCreditRateHourly: 1, creditMultiplier: 1, allowPartialHours: true };
  it('quotes each planned helper using the same per-helper rounding as earnings', () => {
    expect(requestCreditEstimate(policy, 20, 3)).toBe(0.99);
    expect(requestCreditEstimate(policy, 90, 2)).toBe(3);
  });
  it('applies service pricing without floating point drift', () => {
    expect(requestCreditEstimate({ ...policy, baseCreditRateHourly: 1.1, creditMultiplier: 1.3 }, 90, 2)).toBe(4.3);
  });
  it.each([0, 14, 481, 60.5, NaN])('rejects an invalid expected duration %s', minutes => {
    expect(() => requestCreditEstimate(policy, minutes, 1)).toThrow('duration');
  });
  it('requires at least a billable whole hour for whole-hour services', () => {
    expect(() => requestCreditEstimate({ ...policy, allowPartialHours: false }, 30, 1)).toThrow('Whole-hour');
    expect(requestCreditEstimate({ ...policy, allowPartialHours: false }, 90, 1)).toBe(1);
  });
  it('rejects a non-finite or excessively expensive service quote', () => {
    expect(() => requestCreditEstimate({ ...policy, baseCreditRateHourly: NaN }, 60, 1)).toThrow();
    expect(() => requestCreditEstimate({ ...policy, baseCreditRateHourly: 1000 }, 120, 1)).toThrow();
  });
});

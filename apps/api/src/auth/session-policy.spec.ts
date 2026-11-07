import { assertStrongJwtSecret, refreshLifetimeMs } from './session-policy';

describe('session policy', () => {
  it('uses 30 days unless configured otherwise', () => {
    expect(refreshLifetimeMs()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(refreshLifetimeMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(refreshLifetimeMs('12h')).toBe(12 * 60 * 60 * 1000);
  });

  it.each(['soon', '0d', '7'])('refuses the lifetime %s', (setting) => {
    expect(() => refreshLifetimeMs(setting)).toThrow('JWT_REFRESH_TOKEN_EXPIRY');
  });

  it.each([undefined, 'short', 'change_me_jwt_secret_min_32_chars'])(
    'refuses the JWT secret %s',
    (secret) => {
      expect(() => assertStrongJwtSecret(secret)).toThrow('JWT_SECRET');
    },
  );

  it('accepts a long private secret', () => {
    expect(() => assertStrongJwtSecret('x7'.repeat(20))).not.toThrow();
  });
});

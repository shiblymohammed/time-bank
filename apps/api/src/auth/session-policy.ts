const DEFAULT_REFRESH_LIFETIME = '30d'; // D#39
const UNIT_MS = { h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };

/** How long a replaced refresh token still works, for requests already on their way. */
export const REFRESH_OVERLAP_MS = 30 * 1000;

export function refreshLifetimeMs(setting = DEFAULT_REFRESH_LIFETIME): number {
  const match = /^(\d+)([hd])$/.exec(setting.trim());
  const amount = Number(match?.[1]);
  if (!match || amount <= 0) {
    throw new Error('JWT_REFRESH_TOKEN_EXPIRY must look like 30d or 12h');
  }
  return amount * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

/** A guessable secret lets anyone forge a token for any account, staff included. */
export function assertStrongJwtSecret(secret: string | undefined): void {
  if (!secret || secret.length < 32 || secret.includes('change_me')) {
    throw new Error('JWT_SECRET must be a private random value of at least 32 characters');
  }
}

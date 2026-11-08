import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, organizationsNamedBy } from './auth.guard';

const secret = 'app-organization-test-secret-long-enough';
const KOTTAKKAL = '94dadbd8-1d3e-4f6d-90cb-206efba82ac6';
const OTHER = '11111111-2222-3333-4444-555555555555';

describe('organizationsNamedBy', () => {
  it('finds communities in the path, the orgId query and the header', () => {
    expect(organizationsNamedBy({ originalUrl: `/api/organizations/${KOTTAKKAL}/requests?page=1` })).toEqual([KOTTAKKAL]);
    expect(organizationsNamedBy({ originalUrl: `/api/v1/organizations/${OTHER.toUpperCase()}` })).toEqual([OTHER]);
    expect(
      organizationsNamedBy({
        originalUrl: '/api/x',
        query: { orgId: OTHER },
        headers: { 'x-organization-id': KOTTAKKAL },
      }),
    ).toEqual([OTHER, KOTTAKKAL]);
  });

  it('ignores routes that name no community', () => {
    expect(organizationsNamedBy({ originalUrl: '/api/v1/organizations' })).toEqual([]);
    expect(organizationsNamedBy({ originalUrl: '/api/v1/organizations/manage' })).toEqual([]);
    expect(organizationsNamedBy({ originalUrl: '/api/wallet/transactions' })).toEqual([]);
  });
});

describe('AuthGuard keeps an app sign-in inside its community', () => {
  async function run(url: string, claims: Record<string, unknown>) {
    const jwt = new JwtService({ secret });
    const token = await jwt.signAsync({ sub: 'user-1', ...claims });
    const config = new ConfigService();
    const values: Record<string, string> = { JWT_SECRET: secret, STAFF_SECOND_FACTOR: 'off' };
    jest.spyOn(config, 'get').mockImplementation((key: string, fallback?: unknown) => values[key] ?? fallback);
    jest.spyOn(config, 'getOrThrow').mockImplementation((key: string) => values[key]);
    const guard = new AuthGuard(jwt, config);
    const request: any = { originalUrl: url, headers: { authorization: `Bearer ${token}` } };
    return guard.canActivate({
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext);
  }

  it('allows its own community and routes without one', async () => {
    await expect(run(`/api/organizations/${KOTTAKKAL}/requests`, { appOrg: KOTTAKKAL })).resolves.toBe(true);
    await expect(run('/api/wallet/transactions', { appOrg: KOTTAKKAL })).resolves.toBe(true);
  });

  it('refuses another community', async () => {
    await expect(run(`/api/organizations/${OTHER}/requests`, { appOrg: KOTTAKKAL })).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('leaves sign-ins without an app community, like the panel, unchanged', async () => {
    await expect(run(`/api/organizations/${OTHER}/requests`, {})).resolves.toBe(true);
  });
});

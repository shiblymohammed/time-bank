import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';

describe('AuthGuard development identity isolation', () => {
  it.each([
    ['development', undefined, false],
    ['development', 'false', false],
    ['development', 'true', true],
    ['test', 'true', true],
    ['production', 'true', false],
    [undefined, 'true', false],
  ])('handles NODE_ENV=%s, AUTH_ALLOW_DEV_HEADERS=%s', async (environment, flag, allowed) => {
    const config = new ConfigService({ NODE_ENV: environment, AUTH_ALLOW_DEV_HEADERS: flag });
    const values: Record<string, unknown> = { NODE_ENV: environment, AUTH_ALLOW_DEV_HEADERS: flag };
    jest.spyOn(config, 'get').mockImplementation((key: string) => values[key]);
    const guard = new AuthGuard(new JwtService(), config);
    const request: any = {
      headers: { 'x-user-id': 'local-user', 'x-is-super-admin': 'true' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    if (allowed) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user.id).toBe('local-user');
      expect(request.user.isSuperAdmin).toBe(false);
    } else {
      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
      expect(request.user).toBeUndefined();
    }
  });

  it('continues to accept a valid signed token when development headers are disabled', async () => {
    const secret = 'development-guard-test-secret';
    const jwt = new JwtService({ secret });
    const config = new ConfigService();
    const values: Record<string, string> = { NODE_ENV: 'development', JWT_SECRET: secret };
    jest.spyOn(config, 'get').mockImplementation((key: string) => values[key]);
    const guard = new AuthGuard(jwt, config);
    const request: any = {
      headers: {
        authorization: `Bearer ${await jwt.signAsync({ sub: 'signed-user' })}`,
        'x-user-id': 'spoofed-user',
      },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user.id).toBe('signed-user');
  });
});

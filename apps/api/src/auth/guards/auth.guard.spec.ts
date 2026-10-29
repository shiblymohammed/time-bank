import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
describe('development authentication bypass', () => {
  const config = (settings: Record<string, string>) =>
    ({ get: (key: string) => settings[key] }) as ConfigService;
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-user-id': 'actor' } }) }),
  } as unknown as ExecutionContext;
  it.each(['development', 'production'])(
    'rejects forged identity headers by default in %s',
    async (environment) => {
      await expect(
        new AuthGuard({} as JwtService, config({ NODE_ENV: environment })).canActivate(context),
      ).rejects.toThrow(UnauthorizedException);
    },
  );
  it('allows the explicitly enabled test fixture only outside production', async () => {
    await expect(
      new AuthGuard(
        {} as JwtService,
        config({ NODE_ENV: 'test', ALLOW_DEV_AUTH_BYPASS: 'true' }),
      ).canActivate(context),
    ).resolves.toBe(true);
    await expect(
      new AuthGuard(
        {} as JwtService,
        config({ NODE_ENV: 'production', ALLOW_DEV_AUTH_BYPASS: 'true' }),
      ).canActivate(context),
    ).rejects.toThrow(UnauthorizedException);
  });
});

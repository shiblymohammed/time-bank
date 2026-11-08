import { BadRequestException, ExecutionContext, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@ktb/shared-types';
import { AuthGuard } from './guards/auth.guard';
import { requestContext, staffPowersAllowed, withoutUnverifiedStaffRoles } from './staff-context';
import { maskEmail, normalizeEmail, StaffCodeService } from './staff-code.service';

const secret = 'staff-code-test-secret-that-is-long-enough';

function configWith(values: Record<string, string | undefined>) {
  const config = new ConfigService();
  jest
    .spyOn(config, 'get')
    .mockImplementation((key: string, fallback?: unknown) => values[key] ?? fallback);
  jest.spyOn(config, 'getOrThrow').mockImplementation((key: string) => values[key]);
  return config;
}

describe('staff powers wait for the email code', () => {
  it('keeps every role outside a request, so background workers keep their authority', () => {
    expect(staffPowersAllowed()).toBe(true);
    expect(withoutUnverifiedStaffRoles([UserRole.COORDINATOR])).toEqual([UserRole.COORDINATOR]);
  });

  it('drops only staff roles inside an unverified request', () => {
    requestContext.run({ staffVerified: false }, () => {
      expect(staffPowersAllowed()).toBe(false);
      expect(
        withoutUnverifiedStaffRoles([
          UserRole.VOLUNTEER,
          UserRole.COORDINATOR,
          UserRole.MUNICIPALITY_ADMIN,
          UserRole.SUPER_ADMIN,
          UserRole.BENEFICIARY,
        ]),
      ).toEqual([UserRole.VOLUNTEER, UserRole.BENEFICIARY]);
    });
    requestContext.run({ staffVerified: true }, () => expect(staffPowersAllowed()).toBe(true));
  });

  async function guardResult(options: {
    sid?: string;
    rows: unknown[];
    switchOff?: boolean;
  }): Promise<{ verified: boolean | undefined; query: jest.Mock }> {
    const jwt = new JwtService({ secret });
    const token = await jwt.signAsync({ sub: 'user-1', ...(options.sid ? { sid: options.sid } : {}) });
    const query = jest.fn().mockResolvedValue(options.rows);
    const guard = new AuthGuard(
      jwt,
      configWith({
        NODE_ENV: 'test',
        JWT_SECRET: secret,
        STAFF_SECOND_FACTOR: options.switchOff ? 'off' : undefined,
      }),
      { query } as any,
    );
    const request: any = { headers: { authorization: `Bearer ${token}` } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return requestContext.run({}, async () => {
      await guard.canActivate(context);
      return { verified: requestContext.getStore()?.staffVerified, query };
    });
  }

  it('marks a sign-in verified only when its session passed the code', async () => {
    expect((await guardResult({ sid: 's-1', rows: [{}] })).verified).toBe(true);
    expect((await guardResult({ sid: 's-1', rows: [] })).verified).toBe(false);
  });

  it('treats a token without a sign-in id as unverified without asking the database', async () => {
    const result = await guardResult({ rows: [{}] });
    expect(result.verified).toBe(false);
    expect(result.query).not.toHaveBeenCalled();
  });

  it('skips the check when STAFF_SECOND_FACTOR=off', async () => {
    const result = await guardResult({ sid: 's-1', rows: [], switchOff: true });
    expect(result.verified).toBe(true);
    expect(result.query).not.toHaveBeenCalled();
  });
});

describe('staff email helpers', () => {
  it('masks and normalises addresses', () => {
    expect(maskEmail('anita@example.org')).toBe('a***@example.org');
    expect(normalizeEmail('  Anita@Example.ORG ')).toBe('anita@example.org');
    expect(() => normalizeEmail('not-an-email')).toThrow(BadRequestException);
  });
});

describe('StaffCodeService.verify', () => {
  function serviceWith(session: Record<string, unknown> | undefined) {
    const updates: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string) => {
        if (sql.trim().startsWith('SELECT')) return session ? [session] : [];
        updates.push(sql);
        return [];
      }),
    };
    const dataSource = {
      transaction: (work: (m: typeof manager) => unknown) => work(manager),
      query: jest.fn(),
    };
    const audit = { logEvent: jest.fn() };
    const service = new StaffCodeService(
      dataSource as any,
      configWith({ JWT_SECRET: secret }),
      {} as any,
      audit as any,
      {} as any,
    );
    return { service, updates, audit };
  }
  const hashFor = (service: StaffCodeService, code: string) =>
    (service as unknown as { hash: (s: string, c: string) => string }).hash('s-1', code);

  it('accepts the right code and records it', async () => {
    const live = {
      staff_verified_at: null,
      staff_code_hash: '',
      staff_code_expires_at: new Date(Date.now() + 60_000),
      staff_code_attempts: 0,
    };
    const { service, updates, audit } = serviceWith(live);
    live.staff_code_hash = hashFor(service, '482913');
    await expect(service.verify('user-1', 's-1', '482913')).resolves.toEqual({ verified: true });
    expect(updates.some((sql) => sql.includes('staff_verified_at = now()'))).toBe(true);
    expect(audit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'STAFF_EMAIL_CODE_VERIFIED' }),
      expect.anything(),
    );
  });

  it('counts a wrong code as 400 and locks after five tries', async () => {
    const live = {
      staff_verified_at: null,
      staff_code_hash: '',
      staff_code_expires_at: new Date(Date.now() + 60_000),
      staff_code_attempts: 0,
    };
    const { service, updates } = serviceWith(live);
    live.staff_code_hash = hashFor(service, '482913');
    await expect(service.verify('user-1', 's-1', '000000')).rejects.toThrow(BadRequestException);
    expect(updates.some((sql) => sql.includes('staff_code_attempts + 1'))).toBe(true);
    live.staff_code_attempts = 5;
    await expect(service.verify('user-1', 's-1', '482913')).rejects.toThrow(HttpException);
  });

  it('refuses an expired code', async () => {
    const { service } = serviceWith({
      staff_verified_at: null,
      staff_code_hash: 'aa',
      staff_code_expires_at: new Date(Date.now() - 1),
      staff_code_attempts: 0,
    });
    await expect(service.verify('user-1', 's-1', '123456')).rejects.toThrow(/expired/);
  });
});

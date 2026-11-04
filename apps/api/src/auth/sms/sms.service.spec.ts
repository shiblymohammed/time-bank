import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeConfig(overrides: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback?: string) => overrides[key] ?? fallback,
    getOrThrow: (key: string) => {
      if (!overrides[key]) throw new Error(`Missing ${key}`);
      return overrides[key];
    },
  } as unknown as ConfigService;
}

const PHONE = '+919876543210';
const OTP = '482917';

// ─── Mock guard — local-mock must never work in production ───────────────────

describe('SmsService — local-mock provider', () => {
  it('logs OTP and returns true in development', async () => {
    const svc = new SmsService(makeConfig({ SMS_PROVIDER: 'local-mock', NODE_ENV: 'development' }));
    await expect(svc.sendOtp(PHONE, OTP)).resolves.toBe(true);
  });

  it('throws ServiceUnavailableException in production', async () => {
    const svc = new SmsService(makeConfig({ SMS_PROVIDER: 'local-mock', NODE_ENV: 'production' }));
    await expect(svc.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });
});

// ─── Unknown provider ────────────────────────────────────────────────────────

describe('SmsService — unknown provider', () => {
  it('throws ServiceUnavailableException for an unsupported provider name', async () => {
    const svc = new SmsService(makeConfig({ SMS_PROVIDER: 'carrier-pigeon', NODE_ENV: 'production' }));
    await expect(svc.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });
});

// ─── Twilio ──────────────────────────────────────────────────────────────────

describe('SmsService — twilio provider', () => {
  it('throws ServiceUnavailableException when credentials are missing', async () => {
    const svc = new SmsService(
      makeConfig({
        SMS_PROVIDER: 'twilio',
        NODE_ENV: 'production',
        // TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN intentionally omitted
        SMS_FROM: '+12015551234',
      }),
    );
    await expect(svc.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException when SMS_FROM is missing', async () => {
    const svc = new SmsService(
      makeConfig({
        SMS_PROVIDER: 'twilio',
        NODE_ENV: 'production',
        TWILIO_ACCOUNT_SID: 'ACtest',
        TWILIO_AUTH_TOKEN: 'token123',
        // SMS_FROM intentionally omitted
      }),
    );
    await expect(svc.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });

  it('passes config validation and attempts delivery when all credentials are provided', async () => {
    const svc = new SmsService(
      makeConfig({
        SMS_PROVIDER: 'twilio',
        NODE_ENV: 'production',
        TWILIO_ACCOUNT_SID: 'ACtest',
        TWILIO_AUTH_TOKEN: 'authtoken',
        SMS_FROM: '+12015551234',
      }),
    );

    // Config assertion passes — network call will fail because ACtest is not a real SID.
    // We verify it reaches the Twilio client (not a config error) by checking the error type.
    // Real delivery is verified in end-to-end testing with live credentials.
    const result = await svc.sendOtp(PHONE, OTP).catch((err: Error) => {
      // Must NOT be a ServiceUnavailableException (config failure).
      // A network or Twilio API error is expected here in unit-test context.
      expect(err).not.toBeInstanceOf(ServiceUnavailableException);
      return true as boolean;
    });
    expect(result).toBe(true);
  });
});

// ─── AWS SNS ─────────────────────────────────────────────────────────────────

describe('SmsService — aws-sns provider', () => {
  it('throws ServiceUnavailableException when AWS credentials are missing', async () => {
    const svc = new SmsService(
      makeConfig({
        SMS_PROVIDER: 'aws-sns',
        NODE_ENV: 'production',
        // AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY intentionally omitted
      }),
    );
    await expect(svc.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });
});

// ─── MSG91 ───────────────────────────────────────────────────────────────────

describe('SmsService — msg91 provider', () => {
  it('throws ServiceUnavailableException when MSG91 credentials are missing', async () => {
    const svc = new SmsService(
      makeConfig({
        SMS_PROVIDER: 'msg91',
        NODE_ENV: 'production',
        // MSG91_AUTH_KEY and MSG91_TEMPLATE_ID intentionally omitted
      }),
    );
    await expect(svc.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws ServiceUnavailableException when MSG91 API returns a non-OK status', async () => {
    const svc = new SmsService(
      makeConfig({
        SMS_PROVIDER: 'msg91',
        NODE_ENV: 'production',
        MSG91_AUTH_KEY: 'testkey',
        MSG91_TEMPLATE_ID: 'tmpl123',
      }),
    );

    // Stub global fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    } as unknown as Response);

    await expect(svc.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
    (global.fetch as jest.Mock).mockRestore?.();
  });

  it('returns true when MSG91 API responds OK', async () => {
    const svc = new SmsService(
      makeConfig({
        SMS_PROVIDER: 'msg91',
        NODE_ENV: 'production',
        MSG91_AUTH_KEY: 'testkey',
        MSG91_TEMPLATE_ID: 'tmpl123',
      }),
    );

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: 'success', message: 'OTP sent', request_id: 'req_abc123' }),
    } as unknown as Response);

    await expect(svc.sendOtp(PHONE, OTP)).resolves.toBe(true);
    (global.fetch as jest.Mock).mockRestore?.();
  });
});

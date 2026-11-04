import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsService } from './sms.service';

jest.mock('twilio', () =>
  jest.fn(() => ({
    messages: { create: jest.fn().mockResolvedValue({ sid: 'SM-test', status: 'queued' }) },
  })),
);

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(() => ({ send: jest.fn().mockResolvedValue({ MessageId: 'sns-test' }) })),
  PublishCommand: jest.fn((input) => ({ input })),
}));

const PHONE = '+919876543210';
const OTP = '482917';

function makeConfig(overrides: Record<string, string>): ConfigService {
  return {
    get: (key: string, fallback?: string) => overrides[key] ?? fallback,
    getOrThrow: (key: string) => {
      if (!overrides[key]) throw new Error(`Missing ${key}`);
      return overrides[key];
    },
  } as unknown as ConfigService;
}

describe('SmsService local mock safeguards', () => {
  it.each([
    { NODE_ENV: 'development', SMS_PROVIDER: 'local-mock' },
    { NODE_ENV: 'test', SMS_PROVIDER: 'local-mock' },
    { NODE_ENV: 'production', AUTH_ALLOW_MOCK_OTP: 'true', SMS_PROVIDER: 'local-mock' },
  ])('rejects mock SMS without a permitted QA configuration: %j', async (settings) => {
    const service = new SmsService(makeConfig(settings));
    await expect(service.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });

  it('allows mock delivery only when explicitly enabled in development/test', async () => {
    const service = new SmsService(
      makeConfig({
        NODE_ENV: 'test',
        AUTH_ALLOW_MOCK_OTP: 'true',
        SMS_PROVIDER: 'local-mock',
      }),
    );
    await expect(service.sendOtp(PHONE, OTP)).resolves.toBe(true);
  });
});

describe('SmsService provider selection', () => {
  it('rejects an unsupported provider', async () => {
    const service = new SmsService(makeConfig({ NODE_ENV: 'production', SMS_PROVIDER: 'carrier-pigeon' }));
    await expect(service.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('SmsService Twilio provider', () => {
  it('rejects missing credentials before loading the provider', async () => {
    const service = new SmsService(makeConfig({ NODE_ENV: 'production', SMS_PROVIDER: 'twilio' }));
    await expect(service.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });

  it('sends through the Twilio client when configured', async () => {
    const twilio = require('twilio') as jest.Mock;
    twilio.mockClear();
    const service = new SmsService(
      makeConfig({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'twilio',
        TWILIO_ACCOUNT_SID: 'AC-test',
        TWILIO_AUTH_TOKEN: 'token-test',
        SMS_FROM: '+12015551234',
      }),
    );

    await expect(service.sendOtp(PHONE, OTP)).resolves.toBe(true);
    expect(twilio).toHaveBeenCalledWith('AC-test', 'token-test');
    const client = twilio.mock.results[0]?.value as { messages: { create: jest.Mock } };
    expect(client.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({ to: PHONE, from: '+12015551234' }),
    );
  });
});

describe('SmsService AWS SNS provider', () => {
  it('rejects missing credentials before loading the provider', async () => {
    const service = new SmsService(makeConfig({ NODE_ENV: 'production', SMS_PROVIDER: 'aws-sns' }));
    await expect(service.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });

  it('sends through AWS SNS when configured', async () => {
    const { SNSClient } = require('@aws-sdk/client-sns');
    SNSClient.mockClear();
    const service = new SmsService(
      makeConfig({
        NODE_ENV: 'production',
        SMS_PROVIDER: 'aws-sns',
        AWS_ACCESS_KEY_ID: 'key-test',
        AWS_SECRET_ACCESS_KEY: 'secret-test',
        AWS_REGION: 'ap-south-1',
      }),
    );

    await expect(service.sendOtp(PHONE, OTP)).resolves.toBe(true);
    expect(SNSClient).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'ap-south-1' }),
    );
    expect(SNSClient.mock.results[0].value.send).toHaveBeenCalledTimes(1);
  });
});

describe('SmsService MSG91 provider', () => {
  const configured = {
    NODE_ENV: 'production',
    SMS_PROVIDER: 'msg91',
    MSG91_AUTH_KEY: 'test-key',
    MSG91_TEMPLATE_ID: 'template-test',
  };

  it('rejects missing credentials', async () => {
    const service = new SmsService(makeConfig({ NODE_ENV: 'production', SMS_PROVIDER: 'msg91' }));
    await expect(service.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
  });

  it('rejects an unsuccessful HTTP response', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    } as Response);
    try {
      const service = new SmsService(makeConfig(configured));
      await expect(service.sendOtp(PHONE, OTP)).rejects.toThrow(ServiceUnavailableException);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('sends to MSG91 and reports success', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ type: 'success', message: 'OTP sent', request_id: 'req-test' }),
    } as Response);
    try {
      const service = new SmsService(makeConfig(configured));
      await expect(service.sendOtp(PHONE, OTP)).resolves.toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://control.msg91.com/api/v5/otp',
        expect.objectContaining({ method: 'POST' }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

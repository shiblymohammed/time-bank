import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { SmsService } from './sms.service';
describe('SMS delivery availability', () => {
  it.each(['twilio', 'local-mock'])(
    'never reports production delivery for the unimplemented %s provider',
    async (provider) => {
      const settings: Record<string, string> = { NODE_ENV: 'production', SMS_PROVIDER: provider };
      const config = { get: (key: string) => settings[key] } as ConfigService;
      await expect(new SmsService(config).sendOtp('+919876543210', '123456')).rejects.toThrow(
        ServiceUnavailableException,
      );
    },
  );
});

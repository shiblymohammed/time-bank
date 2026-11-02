import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsGateway } from './sms-gateway.interface';

@Injectable()
export class SmsService implements SmsGateway {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtp(_phoneE164: string, _otp: string): Promise<boolean> {
    const provider = this.configService.get<string>('SMS_PROVIDER', 'local-mock');
    const environment = this.configService.get<string>('NODE_ENV');
    const isLocalQa =
      ['development', 'test'].includes(environment ?? '') &&
      this.configService.get<string>('AUTH_ALLOW_MOCK_OTP') === 'true' &&
      provider === 'local-mock';

    if (isLocalQa) {
      this.logger.log('Mock SMS challenge issued for explicitly enabled local QA.');
      return true;
    }

    throw new ServiceUnavailableException(
      `SMS provider '${provider}' is not implemented. Configure a working gateway before enabling production sign-in.`,
    );
  }
}

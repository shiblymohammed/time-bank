import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsGateway } from './sms-gateway.interface';

@Injectable()
export class SmsService implements SmsGateway {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtp(phoneE164: string, otp: string): Promise<boolean> {
    const provider = this.configService.get<string>('SMS_PROVIDER', 'local-mock');
    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';

    if (isDev) {
      this.logger.log(`[SMS-MOCK] OTP for ${phoneE164}: [${otp}] (expires in 10 minutes)`);
      return true;
    }

    throw new ServiceUnavailableException(
      `SMS provider '${provider}' is not implemented. Configure a working gateway before enabling production sign-in.`,
    );
  }
}

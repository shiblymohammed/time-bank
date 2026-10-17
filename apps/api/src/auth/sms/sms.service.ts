import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsGateway } from './sms-gateway.interface';

@Injectable()
export class SmsService implements SmsGateway {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtp(phoneE164: string, otp: string): Promise<boolean> {
    const provider = this.configService.get<string>('SMS_PROVIDER', 'local-mock');
    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';

    if (isDev || provider === 'local-mock') {
      this.logger.log(`[SMS-MOCK] OTP for ${phoneE164}: [${otp}] (expires in 10 minutes)`);
      return true;
    }

    // In production with Twilio or other SMS gateways
    this.logger.log(`[SMS-GATEWAY] Dispatching OTP via provider '${provider}' to ${phoneE164}`);
    // Future providers (Twilio, AWS SNS, MSG91) plug in here
    return true;
  }
}

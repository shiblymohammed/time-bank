import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** The fixed code the local mock accepts, matching the mock phone OTP. */
export const MOCK_EMAIL_CODE = '123456';

/**
 * Sends staff sign-in codes by email.
 *  - EMAIL_PROVIDER=resend: sends through the Resend HTTP API (RESEND_API_KEY, MAIL_FROM).
 *  - EMAIL_PROVIDER=local-mock: sends nothing and accepts MOCK_EMAIL_CODE; development and
 *    test only, and only with AUTH_ALLOW_MOCK_OTP=true.
 * Anything else fails closed, so a misconfigured server never lets a code through.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  /** True when codes are not really sent and the fixed mock code applies. */
  usesMock(): boolean {
    return (
      this.config.get<string>('EMAIL_PROVIDER', 'local-mock') === 'local-mock' &&
      ['development', 'test'].includes(this.config.get<string>('NODE_ENV') ?? '') &&
      this.config.get<string>('AUTH_ALLOW_MOCK_OTP') === 'true'
    );
  }

  async sendStaffCode(to: string, code: string): Promise<void> {
    if (this.usesMock()) {
      this.logger.log('Mock staff email code issued for explicitly enabled local QA.');
      return;
    }
    const provider = this.config.get<string>('EMAIL_PROVIDER', 'local-mock');
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    if (provider !== 'resend' || !apiKey || !from) {
      throw new ServiceUnavailableException(
        'Staff email codes are not set up on this server. Ask the administrator to configure email.',
      );
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Your staff sign-in code: ${code}`,
        text:
          `Your Time Bank staff sign-in code is ${code}.\n\n` +
          'It works for 10 minutes. If you did not just sign in to the staff panel, ' +
          'tell your administrator.',
      }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!response?.ok) {
      this.logger.warn(`Staff email code could not be sent (status ${response?.status ?? 'none'}).`);
      throw new ServiceUnavailableException('The code email could not be sent. Try again shortly.');
    }
  }
}

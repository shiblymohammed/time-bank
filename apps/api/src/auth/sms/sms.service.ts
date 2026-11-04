import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsGateway } from './sms-gateway.interface';

/**
 * SmsService — production-grade OTP delivery with pluggable provider strategy.
 *
 * Supported providers (set SMS_PROVIDER env var):
 *   twilio    — Twilio Programmable Messaging (recommended for India)
 *   aws-sns   — AWS Simple Notification Service
 *   msg91     — MSG91 (India-first carrier routing)
 *   local-mock — Logs OTP to console; development/test only
 *
 * All providers share a single interface: sendOtp(phoneE164, otp): Promise<boolean>
 * Switching providers requires only an env-var change — no code change.
 *
 * FR-IDENT-01: OTP delivery with rate-limit enforcement (handled in AuthService).
 */
@Injectable()
export class SmsService implements SmsGateway {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtp(phoneE164: string, otp: string): Promise<boolean> {
    const provider = this.configService.get<string>('SMS_PROVIDER', 'local-mock');

    switch (provider) {
      case 'twilio':
        return this.sendViaTwilio(phoneE164, otp);
      case 'aws-sns':
        return this.sendViaAwsSns(phoneE164, otp);
      case 'msg91':
        return this.sendViaMSG91(phoneE164, otp);
      case 'local-mock':
        return this.sendViaMock(phoneE164, otp);
      default:
        throw new ServiceUnavailableException(
          `SMS provider '${provider}' is not supported. Valid values: twilio | aws-sns | msg91 | local-mock`,
        );
    }
  }

  // ─── Twilio ────────────────────────────────────────────────────────────────
  private async sendViaTwilio(phoneE164: string, otp: string): Promise<boolean> {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const from = this.configService.get<string>('SMS_FROM');

    this.assertConfig({ TWILIO_ACCOUNT_SID: accountSid, TWILIO_AUTH_TOKEN: authToken, SMS_FROM: from }, 'twilio');

    // Lazy-load to avoid importing the library unless this provider is selected.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const twilio = require('twilio') as (sid: string, token: string) => {
      messages: { create: (opts: Record<string, string>) => Promise<{ sid: string; status: string }> };
    };

    const client = twilio(accountSid!, authToken!);
    const message = await client.messages.create({
      body: this.buildOtpMessage(otp),
      from: from!,
      to: phoneE164,
    });

    this.logger.log(`[SMS-TWILIO] Delivered to ${this.maskPhone(phoneE164)} — sid=${message.sid} status=${message.status}`);
    return true;
  }

  // ─── AWS SNS ───────────────────────────────────────────────────────────────
  private async sendViaAwsSns(phoneE164: string, otp: string): Promise<boolean> {
    const region = this.configService.get<string>('AWS_REGION', 'ap-south-1');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    this.assertConfig({ AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey }, 'aws-sns');

    // Lazy-load AWS SDK — only required at runtime when provider=aws-sns
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns') as any;

    const sns = new SNSClient({
      region,
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });

    const result = await sns.send(
      new PublishCommand({
        Message: this.buildOtpMessage(otp),
        PhoneNumber: phoneE164,
        MessageAttributes: {
          // Transactional ensures delivery even when the number is opted out of promotional
          'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' },
          'AWS.SNS.SMS.SenderID': {
            DataType: 'String',
            StringValue: this.configService.get<string>('AWS_SNS_SENDER_ID', 'TMBK'),
          },
        },
      }),
    );

    this.logger.log(`[SMS-SNS] Delivered to ${this.maskPhone(phoneE164)} — messageId=${result.MessageId}`);
    return true;
  }

  // ─── MSG91 ─────────────────────────────────────────────────────────────────
  private async sendViaMSG91(phoneE164: string, otp: string): Promise<boolean> {
    const authKey = this.configService.get<string>('MSG91_AUTH_KEY');
    const templateId = this.configService.get<string>('MSG91_TEMPLATE_ID');

    this.assertConfig({ MSG91_AUTH_KEY: authKey, MSG91_TEMPLATE_ID: templateId }, 'msg91');

    // MSG91 OTP API — https://docs.msg91.com/p/send-otp-with-msg91
    // Strip the leading '+' — MSG91 expects country code without it for Indian numbers
    const mobile = phoneE164.replace(/^\+/, '');

    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authkey: authKey!,
      },
      body: JSON.stringify({
        template_id: templateId,
        mobile,
        otp,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`[SMS-MSG91] Delivery failed for ${this.maskPhone(phoneE164)}: ${response.status} ${body}`);
      throw new ServiceUnavailableException('SMS delivery failed. Please try again.');
    }

    const result = (await response.json()) as { type: string; message: string; request_id?: string };
    this.logger.log(
      `[SMS-MSG91] Delivered to ${this.maskPhone(phoneE164)} — type=${result.type} reqId=${result.request_id ?? 'n/a'}`,
    );
    return true;
  }

  // ─── Local Mock (dev/test only) ────────────────────────────────────────────
  private sendViaMock(phoneE164: string, otp: string): boolean {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    if (isProduction) {
      // Safety guard: mock must never be used in production
      throw new ServiceUnavailableException(
        'SMS provider is set to local-mock in production. Configure a real SMS provider (twilio | aws-sns | msg91).',
      );
    }
    this.logger.log(`[SMS-MOCK] OTP for ${this.maskPhone(phoneE164)}: [${otp}] (expires in 10 minutes)`);
    return true;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Builds a consistent OTP message body.
   * Keep it short — Indian carriers may truncate long SMS messages.
   */
  private buildOtpMessage(otp: string): string {
    return `Your Time Bank verification code is ${otp}. Valid for 10 minutes. Do not share this code with anyone.`;
  }

  /**
   * Masks a phone number for safe logging (e.g. +919876543210 → +91****3210).
   */
  private maskPhone(phoneE164: string): string {
    if (phoneE164.length <= 6) return '***';
    return phoneE164.slice(0, 3) + '****' + phoneE164.slice(-4);
  }

  /**
   * Throws a clear configuration error if any required env vars are missing.
   * Validates at call-time, not at startup, so other providers are unaffected.
   */
  private assertConfig(
    vars: Record<string, string | undefined>,
    provider: string,
  ): void {
    const missing = Object.entries(vars)
      .filter(([, v]) => !v || v.trim() === '')
      .map(([k]) => k);

    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        `SMS provider '${provider}' is missing required configuration: ${missing.join(', ')}. Check your environment variables.`,
      );
    }
  }
}

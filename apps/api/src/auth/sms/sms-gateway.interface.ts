export interface SmsGateway {
  sendOtp(phoneE164: string, otp: string): Promise<boolean>;
}

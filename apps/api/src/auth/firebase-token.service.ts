import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getApps, initializeApp } from 'firebase-admin/app';

@Injectable()
export class FirebaseTokenService {
  constructor(private readonly config: ConfigService) {}

  async verifyPhoneToken(idToken: string): Promise<string> {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID')?.trim();
    if (!projectId || process.env['FIREBASE_AUTH_EMULATOR_HOST']) {
      throw new ServiceUnavailableException(
        'Firebase phone authentication is not configured securely.',
      );
    }
    const name = `time-bank-phone-${projectId}`;
    const app =
      getApps().find((candidate) => candidate.name === name) ?? initializeApp({ projectId }, name);
    try {
      // Verify the signature, audience, issuer and expiry against Google's keys.
      // No service-account private key is needed for public-key ID-token verification.
      const { getAuth } = await import('firebase-admin/auth');
      const decoded = await getAuth(app).verifyIdToken(idToken);
      const now = Math.floor(Date.now() / 1000);
      if (
        decoded.firebase?.sign_in_provider !== 'phone' ||
        typeof decoded.phone_number !== 'string' ||
        !/^\+91[6-9]\d{9}$/.test(decoded.phone_number) ||
        !Number.isFinite(decoded.auth_time) ||
        decoded.auth_time < now - 300 ||
        decoded.auth_time > now + 60
      ) {
        throw new UnauthorizedException('Verify your mobile number again to sign in.');
      }
      return decoded.phone_number;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Firebase phone verification failed. Request a new code.');
    }
  }
}

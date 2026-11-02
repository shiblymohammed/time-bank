import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { FirebaseTokenService } from './firebase-token.service';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

jest.mock('firebase-admin/app', () => ({ getApps: jest.fn(), initializeApp: jest.fn() }));
jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }));

describe('Firebase phone token verification', () => {
  const verifyIdToken = jest.fn();
  const app = { name: 'test-app' };
  const service = new FirebaseTokenService(
    new ConfigService({ FIREBASE_PROJECT_ID: 'time-bank-34a1c' }),
  );
  const valid = () => ({
    phone_number: '+919876543210',
    auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_provider: 'phone' },
  });
  const oldEmulator = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
  beforeEach(() => {
    delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
    jest.clearAllMocks();
    (getApps as jest.Mock).mockReturnValue([]);
    (initializeApp as jest.Mock).mockReturnValue(app);
    (getAuth as jest.Mock).mockReturnValue({ verifyIdToken });
    verifyIdToken.mockResolvedValue(valid());
  });
  afterAll(() => {
    if (oldEmulator === undefined) delete process.env['FIREBASE_AUTH_EMULATOR_HOST'];
    else process.env['FIREBASE_AUTH_EMULATOR_HOST'] = oldEmulator;
  });
  it('pins the Admin verifier to the configured project before accepting the signed phone', async () => {
    await expect(service.verifyPhoneToken('signed-id-token')).resolves.toBe('+919876543210');
    expect(initializeApp).toHaveBeenCalledWith(
      { projectId: 'time-bank-34a1c' },
      'time-bank-phone-time-bank-34a1c',
    );
    expect(verifyIdToken).toHaveBeenCalledWith('signed-id-token');
  });
  it('does not accept an invalid signature, issuer, audience or expired token', async () => {
    verifyIdToken.mockRejectedValue(new Error('invalid signature/audience/expiry'));
    await expect(service.verifyPhoneToken('untrusted-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });
  it.each([
    { firebase: { sign_in_provider: 'password' } },
    { phone_number: undefined },
    { phone_number: '+15555550123' },
    { auth_time: Math.floor(Date.now() / 1000) - 301 },
    { auth_time: Math.floor(Date.now() / 1000) + 120 },
    { auth_time: undefined },
  ])('rejects a non-phone, missing, stale or future identity: %j', async (claims) => {
    verifyIdToken.mockResolvedValue({ ...valid(), ...claims });
    await expect(service.verifyPhoneToken('token')).rejects.toThrow(UnauthorizedException);
  });
  it('fails closed when no project is configured', async () => {
    const disabled = new FirebaseTokenService(new ConfigService({}));
    await expect(disabled.verifyPhoneToken('token')).rejects.toThrow(ServiceUnavailableException);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
  it('never accepts unsigned emulator identities in the normal exchange', async () => {
    process.env['FIREBASE_AUTH_EMULATOR_HOST'] = '127.0.0.1:9099';
    await expect(service.verifyPhoneToken('token')).rejects.toThrow(ServiceUnavailableException);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});

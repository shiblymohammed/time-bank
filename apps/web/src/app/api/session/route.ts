import { NextRequest } from 'next/server';
import {
  checkOrigin,
  clearSession,
  endSession,
  failure,
  GatewayError,
  isStaff,
  respond,
  setSession,
  upstream,
  withSession,
} from '@/lib/server-api';
export const dynamic = 'force-dynamic';
/** The profile plus whether this sign-in still needs the emailed staff code. */
async function profileWithStaffCheck(token: string) {
  const profile = (await upstream('/auth/me', { token })) as Record<string, unknown>;
  if (!isStaff(profile)) return profile;
  const staffCheck = await upstream('/auth/staff-code', { token });
  return { ...profile, staffCheck };
}
export async function GET(request: NextRequest) {
  try {
    const result = await withSession(request, profileWithStaffCheck);
    if (!isStaff(result.body as Record<string, unknown>))
      throw new GatewayError('Administrator or coordinator access is required', 403);
    return respond(result.body, result.renewed);
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const body = await request.json().catch(() => {
      throw new GatewayError('Invalid sign-in request', 400);
    });
    if (!body || typeof body !== 'object') throw new GatewayError('Invalid sign-in request', 400);
    if (body.action === 'request-code') {
      const result = (await upstream('/auth/otp/request', {
        method: 'POST',
        body: { phone: body.phone },
      })) as Record<string, unknown>;
      if (process.env.NODE_ENV === 'production') delete result['devOtp'];
      return respond(result);
    }
    if (body.action === 'staff-code-request' || body.action === 'staff-code-verify') {
      if (body.action === 'staff-code-verify' && typeof body.code !== 'string')
        throw new GatewayError('Enter the 6-digit code', 400);
      const result = await withSession(request, async (token) => {
        if (body.action === 'staff-code-request')
          return upstream('/auth/staff-code/request', { method: 'POST', token });
        await upstream('/auth/staff-code/verify', {
          method: 'POST',
          token,
          body: { code: body.code },
        });
        return profileWithStaffCheck(token);
      });
      return respond(result.body, result.renewed);
    }
    if (body.action !== 'verify' && body.action !== 'firebase')
      throw new GatewayError('Unknown sign-in action', 400);
    if (body.action === 'firebase' && typeof body.idToken !== 'string')
      throw new GatewayError('Invalid sign-in request', 400);
    const session = (await upstream(
      body.action === 'firebase' ? '/auth/firebase' : '/auth/otp/verify',
      {
        method: 'POST',
        body:
          body.action === 'firebase'
            ? { idToken: body.idToken }
            : { phone: body.phone, code: body.code },
      },
    )) as Record<string, unknown>;
    const profile = await profileWithStaffCheck(session['accessToken'] as string);
    if (!isStaff(profile)) {
      await upstream('/auth/logout', {
        method: 'POST',
        body: { refreshToken: session['refreshToken'] },
      });
      throw new GatewayError('This dashboard requires administrator or coordinator access', 403);
    }
    const response = respond(profile);
    setSession(response, session);
    return response;
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request);
  } catch (error) {
    return failure(error);
  }
  try {
    await endSession(request);
    return clearSession(respond({ success: true }));
  } catch (error) {
    // The browser must sign out even when the API cannot revoke its refresh token.
    // Keep the upstream error status so revocation is not falsely reported as successful.
    return clearSession(failure(error));
  }
}

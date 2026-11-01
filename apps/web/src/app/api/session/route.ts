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
export async function GET(request: NextRequest) {
  try {
    const result = await withSession(request, (token) => upstream('/auth/me', { token }));
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
    if (body.action !== 'verify') throw new GatewayError('Unknown sign-in action', 400);
    const session = (await upstream('/auth/otp/verify', {
      method: 'POST',
      body: { phone: body.phone, code: body.code },
    })) as Record<string, unknown>;
    const profile = (await upstream('/auth/me', {
      token: session['accessToken'] as string,
    })) as Record<string, unknown>;
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
    await endSession(request);
    return clearSession(respond({ success: true }));
  } catch (error) {
    return failure(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';

const origin = (
  process.env['API_INTERNAL_URL'] ??
  process.env['NEXT_PUBLIC_API_URL'] ??
  'http://127.0.0.1:3001'
).replace(/\/$/, '');
const ACCESS = 'ktb_admin_access';
const REFRESH = 'ktb_admin_refresh';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

type Json = Record<string, unknown>;
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export function checkOrigin(request: NextRequest) {
  // Next can normalize the internal URL to localhost; retain the incoming Host.
  const destination = new URL(request.url);
  destination.host = request.headers.get('host') ?? destination.host;
  const expected = process.env['DASHBOARD_ORIGIN'] ?? destination.origin;
  if (request.headers.get('origin') !== expected)
    throw new GatewayError('Request origin is not allowed', 403);
}

export async function upstream(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
) {
  let response: Response;
  try {
    response = await fetch(`${origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'content-type': 'application/json',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
      redirect: 'error',
    });
  } catch {
    throw new GatewayError('The service is unavailable. Please try again.', 502);
  }
  const body: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (body as Json)?.['message'];
    throw new GatewayError(
      Array.isArray(message)
        ? message.join('; ')
        : typeof message === 'string'
          ? message
          : 'The request could not be completed',
      response.status,
    );
  }
  return body;
}
export async function withSession(
  request: NextRequest,
  action: (token: string) => Promise<unknown>,
) {
  const refreshToken = request.cookies.get(REFRESH)?.value;
  if (!refreshToken) throw new GatewayError('Please sign in to continue', 401);
  const accessToken = request.cookies.get(ACCESS)?.value;
  if (accessToken) {
    try {
      return { body: await action(accessToken), renewed: undefined };
    } catch (error) {
      if (!(error instanceof GatewayError) || error.status !== 401) throw error;
    }
  }
  const session = (await upstream('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  })) as Json;
  if (typeof session['accessToken'] !== 'string')
    throw new GatewayError('Please sign in again', 401);
  return { body: await action(session['accessToken']), renewed: session['accessToken'] };
}
export function respond(body: unknown, renewed?: string) {
  const response = NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  if (renewed) response.cookies.set(ACCESS, renewed, { ...cookieOptions, maxAge: 900 });
  return response;
}
export function setSession(response: NextResponse, session: Json) {
  if (typeof session['accessToken'] !== 'string' || typeof session['refreshToken'] !== 'string')
    throw new GatewayError('Invalid sign-in response', 502);
  response.cookies.set(ACCESS, session['accessToken'], { ...cookieOptions, maxAge: 900 });
  response.cookies.set(REFRESH, session['refreshToken'], cookieOptions);
}
export function clearSession(response: NextResponse) {
  response.cookies.set(ACCESS, '', { ...cookieOptions, maxAge: 0 });
  response.cookies.set(REFRESH, '', { ...cookieOptions, maxAge: 0 });
  return response;
}
export async function endSession(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH)?.value;
  if (refreshToken) await upstream('/auth/logout', { method: 'POST', body: { refreshToken } });
}
export function failure(error: unknown) {
  const status = error instanceof GatewayError ? error.status : 500;
  const response = NextResponse.json(
    { message: error instanceof GatewayError ? error.message : 'Unable to complete the request' },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
  return status === 401 ? clearSession(response) : response;
}
export function isStaff(profile: Json) {
  return (
    profile['status'] === 'ACTIVE' &&
    Array.isArray(profile['memberships']) &&
    profile['memberships'].some(
      (value: Json) =>
        value['status'] === 'APPROVED' &&
        Array.isArray(value['roles']) &&
        value['roles'].some((role: string) =>
          ['SUPER_ADMIN', 'MUNICIPALITY_ADMIN', 'COORDINATOR'].includes(role),
        ),
    )
  );
}

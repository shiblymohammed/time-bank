import { headers } from 'next/headers';
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

/**
 * The chain as Nginx built it, so the API's TRUST_PROXY_HOPS reads the web server as the
 * nearest hop and still finds the visitor. Without it every admin shares one rate limit.
 */
async function forwardedFor(): Promise<Record<string, string>> {
  try {
    const chain = (await headers()).get('x-forwarded-for');
    return chain ? { 'x-forwarded-for': chain } : {};
  } catch {
    return {}; // Outside a request there is no visitor to name.
  }
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
        ...(await forwardedFor()),
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
  if (!response.ok) throw refusal(body, response.status);
  return body;
}
function refusal(body: unknown, status: number) {
  const message = (body as Json)?.['message'];
  return new GatewayError(
    Array.isArray(message)
      ? message.join('; ')
      : typeof message === 'string'
        ? message
        : 'The request could not be completed',
    status,
  );
}
/** Only report files pass through as files. Anything else stays behind the JSON gateway. */
const FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
];
export type GatewayFile = { bytes: ArrayBuffer; contentType: string; disposition: string };
export async function upstreamFile(path: string, token: string): Promise<GatewayFile> {
  let response: Response;
  try {
    response = await fetch(`${origin}/api${path}`, {
      headers: { ...(await forwardedFor()), authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(60000),
      redirect: 'error',
    });
  } catch {
    throw new GatewayError('The service is unavailable. Please try again.', 502);
  }
  if (!response.ok) throw refusal(await response.json().catch(() => ({})), response.status);
  const contentType = response.headers.get('content-type') ?? '';
  const disposition = response.headers.get('content-disposition') ?? '';
  if (
    !FILE_TYPES.some((type) => contentType.startsWith(type)) ||
    !disposition.startsWith('attachment')
  ) {
    throw new GatewayError('The service returned an unexpected file', 502);
  }
  return { bytes: await response.arrayBuffer(), contentType, disposition };
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
  return { body: await action(session['accessToken']), renewed: session };
}
export function respond(body: unknown, renewed?: Json) {
  return renewCookies(
    NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } }),
    renewed,
  );
}
export function respondFile(file: GatewayFile, renewed?: Json) {
  return renewCookies(
    new NextResponse(file.bytes, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': file.contentType,
        'Content-Disposition': file.disposition,
        'X-Content-Type-Options': 'nosniff',
      },
    }),
    renewed,
  );
}
function renewCookies(response: NextResponse, renewed?: Json) {
  const { accessToken, refreshToken } = renewed ?? {};
  if (typeof accessToken === 'string')
    response.cookies.set(ACCESS, accessToken, { ...cookieOptions, maxAge: 900 });
  // Absent when a parallel request already replaced the token.
  if (typeof refreshToken === 'string') response.cookies.set(REFRESH, refreshToken, cookieOptions);
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

/** Merchants use the dashboard without receiving staff authority. */
export function isDashboardUser(profile: Json) {
  return (
    isStaff(profile) ||
    (profile['status'] === 'ACTIVE' &&
      Array.isArray(profile['memberships']) &&
      profile['memberships'].some(
        (value: Json) =>
          value['status'] === 'APPROVED' &&
          Array.isArray(value['roles']) &&
          value['roles'].includes('MERCHANT'),
      ))
  );
}

import { NextRequest } from 'next/server';
import {
  checkOrigin,
  failure,
  GatewayError,
  respond,
  upstream,
  withSession,
} from '@/lib/server-api';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
const ID = '[a-f0-9-]+';
const ORG = `/organizations/${ID}`;
// Dashboard-reachable API surface. The API still authorizes every call; this only narrows the proxy.
const ROUTES: [methods: string, pattern: RegExp][] = [
  ['*', /^\/admin\//],
  ['*', /^\/v1\/organizations(?:\/|$)/],
  ['*', new RegExp(`^${ORG}/memberships(?:/|$)`, 'i')],
  ['*', new RegExp(`^${ORG}/requests(?:/|$)`, 'i')],
  ['GET POST PATCH', /^\/catalogue\/categories(?:\/[a-f0-9-]+)?$/i],
  ['GET POST PATCH', /^\/catalogue\/global(?:\/[a-f0-9-]+)?$/i],
  ['GET', /^\/catalogue\/proposals$/],
  ['PATCH', /^\/catalogue\/proposals\/[a-f0-9-]+\/review$/i],
  ['GET', new RegExp(`^${ORG}/catalogue(?:/${ID})?$`, 'i')],
  ['POST', new RegExp(`^${ORG}/catalogue/configure$`, 'i')],
  ['GET POST', new RegExp(`^${ORG}/catalogue/proposals$`, 'i')],
  ['GET', new RegExp(`^${ORG}/beneficiaries/${ID}/(?:eligibility|caregivers)$`, 'i')],
  ['POST', new RegExp(`^${ORG}/beneficiaries/eligibility$`, 'i')],
  ['POST', new RegExp(`^${ORG}/caregivers/authorize$`, 'i')],
  ['PATCH', new RegExp(`^${ORG}/caregivers/${ID}/review$`, 'i')],
  ['GET POST', new RegExp(`^${ORG}/zones$`, 'i')],
  ['GET PUT', new RegExp(`^${ORG}/zones/${ID}$`, 'i')],
  ['POST', new RegExp(`^${ORG}/zones/${ID}/volunteers$`, 'i')],
  ['DELETE', new RegExp(`^${ORG}/zones/${ID}/volunteers/${ID}$`, 'i')],
  ['GET', new RegExp(`^${ORG}/volunteers/${ID}/(?:availability|skills|zones)$`, 'i')],
  ['PUT', new RegExp(`^${ORG}/volunteers/${ID}/availability$`, 'i')],
  ['POST', new RegExp(`^${ORG}/volunteers/skills/verify$`, 'i')],
];
const allowed = (method: string, resource: string) =>
  ROUTES.some(
    ([methods, pattern]) =>
      (methods === '*' || methods.split(' ').includes(method)) && pattern.test(resource),
  );
async function proxy(request: NextRequest, context: Context) {
  try {
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method))
      throw new GatewayError('Method not allowed', 405);
    if (request.method !== 'GET') checkOrigin(request);
    const { path } = await context.params;
    if (!path.length || path.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part)))
      throw new GatewayError('Invalid service path', 400);
    const resource = '/' + path.join('/');
    if (!allowed(request.method, resource))
      throw new GatewayError('This service is not available in the dashboard', 404);
    const body = request.method === 'GET' ? undefined : await request.json().catch(() => undefined);
    const result = await withSession(request, (token) =>
      upstream(resource + request.nextUrl.search, {
        method: request.method,
        token,
        ...(body !== undefined ? { body } : {}),
      }),
    );
    return respond(result.body, result.renewed);
  } catch (error) {
    return failure(error);
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };

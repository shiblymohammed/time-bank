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
async function proxy(request: NextRequest, context: Context) {
  try {
    if (!['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method))
      throw new GatewayError('Method not allowed', 405);
    if (request.method !== 'GET') checkOrigin(request);
    const { path } = await context.params;
    if (!path.length || path.some((part) => !/^[a-zA-Z0-9_-]+$/.test(part)))
      throw new GatewayError('Invalid service path', 400);
    const resource = '/' + path.join('/');
    if (!(
      resource.startsWith('/admin/') ||
      resource === '/v1/organizations' ||
      resource.startsWith('/v1/organizations/') ||
      /^\/organizations\/[a-f0-9-]+\/memberships(?:\/|$)/i.test(resource) ||
      /^\/organizations\/[a-f0-9-]+\/requests(?:\/|$)/i.test(resource) ||
      (request.method === 'GET' && resource === '/catalogue/global') ||
      (request.method === 'PATCH' && /^\/catalogue\/global\/[a-f0-9-]+$/i.test(resource)) ||
      (request.method === 'POST' &&
        /^\/organizations\/[a-f0-9-]+\/catalogue\/configure$/i.test(resource)) ||
      (request.method === 'GET' &&
        /^\/organizations\/[a-f0-9-]+\/catalogue(?:\/[a-f0-9-]+)?$/i.test(resource))
    ))
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

// Same-origin proxy keeps browser requests independent of the API host and CORS.
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export interface Session {
  accessToken: string;
  refreshToken: string;
  isSuperAdmin: boolean;
  user: { id: string; phoneE164: string };
}
let session: Session | null = null;
let refreshing: Promise<void> | null = null;
export function setApiSession(value: Session | null) {
  session = value;
}

export async function api<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const current = session;
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (current) headers.set('Authorization', `Bearer ${current.accessToken}`);
  // Membership routes use :id, while the backend guard resolves organization context via this header.
  const organization = path.match(/^\/api(?:\/v1)?\/organizations\/([^/?]+)/)?.[1];
  if (organization) headers.set('x-organization-id', organization);
  const response = await fetch(`/backend${path}`, { ...options, headers, cache: 'no-store' });
  if (
    response.status === 401 &&
    current &&
    retry &&
    (!path.startsWith('/api/auth/') || path === '/api/auth/me')
  ) {
    if (!refreshing) {
      refreshing = (async () => {
        const data = await api<{ accessToken: string }>(
          '/api/auth/refresh',
          {
            method: 'POST',
            body: JSON.stringify({ refreshToken: current.refreshToken }),
          },
          false,
        );
        if (session === current) current.accessToken = data.accessToken;
      })().finally(() => {
        refreshing = null;
      });
    }
    await refreshing;
    if (session !== current) throw new ApiError('Your session has ended. Sign in again.', 401);
    return api<T>(path, options, false);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message;
    throw new ApiError(
      Array.isArray(message)
        ? message.join('; ')
        : message || `Request failed (${response.status})`,
      response.status,
    );
  }
  return body as T;
}

export async function allMemberships<T>(
  organizationId: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const records: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await api<{ memberships: T[]; total: number }>(
      `/api/organizations/${organizationId}/memberships?limit=100&offset=${offset}`,
      { signal: signal ?? null },
    );
    records.push(...page.memberships);
    if (!page.memberships.length || records.length >= page.total) return records;
  }
}

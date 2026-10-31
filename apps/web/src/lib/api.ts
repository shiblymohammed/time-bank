export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(signal ? { signal } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      typeof result.message === 'string'
        ? result.message
        : Array.isArray(result.message)
          ? result.message.join('; ')
          : 'Unable to complete the request',
      response.status,
    );
  return result as T;
}
export const backend = <T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) =>
  api<T>('/api/backend' + path, method, body, signal);
/** Fetch-style adapter for components written against `/api/...` paths; still goes through the gateway. */
export function gatewayFetch<T>(
  path: string,
  init: { method?: string; body?: string; signal?: AbortSignal | null } = {},
) {
  return backend<T>(
    path.replace(/^\/api(?=\/)/, ''),
    init.method ?? 'GET',
    init.body === undefined ? undefined : JSON.parse(init.body),
    init.signal ?? undefined,
  );
}
export async function allMemberships<T>(
  organizationId: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const records: T[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await backend<{ memberships: T[]; total: number }>(
      `/organizations/${organizationId}/memberships?limit=100&offset=${offset}`,
      'GET',
      undefined,
      signal,
    );
    records.push(...page.memberships);
    if (!page.memberships.length || records.length >= page.total) return records;
  }
}

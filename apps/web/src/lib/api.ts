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
/** Fetches a file through the gateway and hands it to the browser to save. */
export async function downloadFile(path: string): Promise<void> {
  const response = await fetch('/api/backend' + path, {
    credentials: 'same-origin',
    cache: 'no-store',
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new ApiError(
      typeof result.message === 'string' ? result.message : 'Could not download the file',
      response.status,
    );
  }
  const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1];
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name ?? 'report';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
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

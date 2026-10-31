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
      typeof result.message === 'string' ? result.message : 'Unable to complete the request',
      response.status,
    );
  return result as T;
}
export const backend = <T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal) =>
  api<T>('/api/backend' + path, method, body, signal);

import { state } from './state.js';
export class ApiError extends Error {
  constructor(message, status, requestId) {
    super(message);
    this.status = status;
    this.requestId = requestId;
  }
}
export async function api(path, { method = 'GET', body, signal, idempotencyKey } = {}) {
  const headers = { Accept: 'application/json' };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.csrf && !['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = state.csrf;
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Could not reach ImageAPI. Check your connection and try again.', 0);
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    let message = data.detail || 'Something went wrong. Please try again.';
    if (Array.isArray(message))
      message = message
        .map(
          (item) =>
            `${item.loc?.filter((x) => !['body', 'query'].includes(x)).join(' ') || 'Request'}: ${item.msg.replace(/^Value error, /, '')}`,
        )
        .join('. ');
    throw new ApiError(
      typeof message === 'string' ? message : 'Request failed',
      response.status,
      response.headers.get('X-Request-ID'),
    );
  }
  return data;
}

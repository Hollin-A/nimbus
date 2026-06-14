import type {
  City,
  LiveMessage,
  PublicUser,
  Severity,
  Weather,
} from '../types';

const BASE_URL = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
).replace(/\/$/, '');

export class ApiError extends Error {
  public readonly status: number;
  public readonly details?: Record<string, string[]>;
  constructor(
    message: string,
    status: number,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string;
  /** Override the default 15-second timeout (in ms). */
  timeoutMs?: number;
  /**
   * Optional caller-supplied abort signal. When this fires, the request is
   * cancelled and the original AbortError is re-thrown — callers should
   * filter it out with `err.name === 'AbortError'` rather than treating it
   * as a network failure.
   */
  signal?: AbortSignal;
  /**
   * Internal: set on the retry after a transparent token refresh, so a
   * retry that also 401s doesn't loop forever.
   */
  retried?: boolean;
}

const DEFAULT_TIMEOUT_MS = 15_000;

// --- Transparent refresh seam ---------------------------------------------
// The auth layer registers a handler that performs ONE token refresh and
// returns the new access token (or throws if the session can't be
// refreshed). request() invokes it on a 401 and retries the original call.
type RefreshHandler = () => Promise<string>;
let refreshHandler: RefreshHandler | null = null;
export function setRefreshHandler(handler: RefreshHandler | null): void {
  refreshHandler = handler;
}

// Single-flight: a page load fires several requests, which can all 401 at
// once. They must share ONE refresh rather than stampede the endpoint.
let refreshInFlight: Promise<string> | null = null;
function refreshOnce(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = refreshHandler!().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  // Bail before the network if the caller is already cancelled.
  if (opts.signal?.aborted) {
    throw new DOMException('aborted', 'AbortError');
  }

  // EITHER the caller OR our internal timeout can cancel the fetch. We wire
  // them together manually rather than via AbortSignal.any() so the test
  // environment (jsdom) doesn't need that static method.
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const onCallerAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onCallerAbort);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // Distinguish caller-cancellation from our own timeout. If the caller's
      // signal is what aborted, re-throw so they can ignore the rejection.
      if (opts.signal?.aborted) {
        throw err;
      }
      throw new ApiError('Request timed out.', 0);
    }
    throw new ApiError('Could not reach the server.', 0);
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onCallerAbort);
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Empty / non-JSON body is fine for some responses.
  }

  if (!response.ok) {
    const body = payload as
      | { error?: string; details?: Record<string, string[]> }
      | null;

    // Transparent refresh: an expired access token (401) on an
    // authenticated call triggers a single shared refresh, then a one-time
    // retry with the new token. Guarded so an unauthenticated 401, a
    // missing handler, or a retry that also 401s doesn't loop.
    if (response.status === 401 && opts.token && refreshHandler && !opts.retried) {
      let newToken: string | null = null;
      try {
        newToken = await refreshOnce();
      } catch {
        newToken = null; // refresh failed — fall through to surface the 401
      }
      if (newToken) {
        return request<T>(path, { ...opts, token: newToken, retried: true });
      }
    }

    throw new ApiError(
      body?.error ?? `Request failed with status ${response.status}`,
      response.status,
      body?.details,
    );
  }

  return payload as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function login(username: string, password: string): Promise<AuthTokens> {
  return request<AuthTokens>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

export function getMe(token: string): Promise<{ user: PublicUser }> {
  return request<{ user: PublicUser }>('/api/auth/me', { token });
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

export function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  return request<AuthTokens>('/api/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
}

export function logout(refreshToken: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
    body: { refreshToken },
  });
}

export function register(
  username: string,
  password: string,
  displayName: string,
): Promise<{ user: PublicUser }> {
  return request<{ user: PublicUser }>('/api/auth/register', {
    method: 'POST',
    body: { username, password, displayName },
  });
}

export interface PasswordResetIssued {
  token: string;
  expiresAt: string;
  note: string;
}

export function requestPasswordReset(username: string): Promise<PasswordResetIssued> {
  return request<PasswordResetIssued>('/api/auth/password-reset/request', {
    method: 'POST',
    body: { username },
  });
}

export function confirmPasswordReset(
  token: string,
  password: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/auth/password-reset/confirm', {
    method: 'POST',
    body: { token, password },
  });
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------

export function searchCities(
  query: string,
  token: string,
  options?: { signal?: AbortSignal },
): Promise<{ cities: City[] }> {
  return request<{ cities: City[] }>(
    `/api/weather/cities?q=${encodeURIComponent(query)}`,
    { token, signal: options?.signal },
  );
}

export function getWeather(
  city: City,
  token: string,
): Promise<{ weather: Weather }> {
  const params = new URLSearchParams({
    lat: String(city.latitude),
    lon: String(city.longitude),
    name: city.name,
  });
  if (city.country) params.set('country', city.country);
  return request<{ weather: Weather }>(`/api/weather?${params.toString()}`, {
    token,
  });
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface PushMessageInput {
  city: string;
  latitude: number;
  longitude: number;
  message: string;
  severity: Severity;
}

export function pushMessage(
  body: PushMessageInput,
  token: string,
): Promise<{ message: LiveMessage }> {
  return request<{ message: LiveMessage }>('/api/messages', {
    method: 'POST',
    body,
    token,
  });
}

export function getMessageHistory(
  city: { latitude: number; longitude: number },
  token: string,
): Promise<{ messages: LiveMessage[] }> {
  return request<{ messages: LiveMessage[] }>(
    `/api/messages?latitude=${city.latitude}&longitude=${city.longitude}`,
    { token },
  );
}

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
}

const DEFAULT_TIMEOUT_MS = 15_000;

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

export interface LoginResponse {
  token: string;
  user: PublicUser;
}

export function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  return request<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
}

export function getMe(token: string): Promise<{ user: PublicUser }> {
  return request<{ user: PublicUser }>('/api/auth/me', { token });
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

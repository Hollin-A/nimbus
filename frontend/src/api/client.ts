import type { City, LiveMessage, PublicUser, Weather } from '../types';

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
}

const DEFAULT_TIMEOUT_MS = 15_000;

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

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
      throw new ApiError('Request timed out.', 0);
    }
    throw new ApiError('Could not reach the server.', 0);
  } finally {
    clearTimeout(timeout);
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
): Promise<{ cities: City[] }> {
  return request<{ cities: City[] }>(
    `/api/weather/cities?q=${encodeURIComponent(query)}`,
    { token },
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

export function getMessageHistory(
  city: string,
  token: string,
): Promise<{ messages: LiveMessage[] }> {
  return request<{ messages: LiveMessage[] }>(
    `/api/messages?city=${encodeURIComponent(city)}`,
    { token },
  );
}

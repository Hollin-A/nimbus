import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiError, getMe, setRefreshHandler } from '../api/client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const ME = { user: { id: '1', username: 'admin', displayName: 'Admin' } };

function authHeaderOf(call: unknown[]): string | undefined {
  const init = call[1] as { headers: Record<string, string> };
  return init.headers['Authorization'];
}

describe('api/client transparent refresh', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    setRefreshHandler(null);
    vi.unstubAllGlobals();
  });

  it('refreshes and retries the original request on a 401', async () => {
    setRefreshHandler(() => Promise.resolve('new-token'));
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { error: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, ME));

    const result = await getMe('old-token');

    expect(result.user.username).toBe('admin');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeaderOf(fetchMock.mock.calls[1] as unknown[])).toBe('Bearer new-token');
  });

  it('shares a single refresh across concurrent 401s (single-flight)', async () => {
    const handler = vi.fn(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('new-token'), 0)),
    );
    setRefreshHandler(handler);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    // 401 for the stale token, 200 once retried with the refreshed token.
    fetchMock.mockImplementation((_url: string, init: { headers: Record<string, string> }) =>
      Promise.resolve(
        init.headers['Authorization'] === 'Bearer new-token'
          ? jsonResponse(200, ME)
          : jsonResponse(401, { error: 'expired' }),
      ),
    );

    const results = await Promise.all([getMe('old'), getMe('old'), getMe('old')]);

    expect(results.every((r) => r.user.username === 'admin')).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('propagates the 401 when the refresh itself fails', async () => {
    setRefreshHandler(() => Promise.reject(new Error('refresh dead')));
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'expired' }));

    await expect(getMe('old')).rejects.toMatchObject({ status: 401 });
  });

  it('does not retry when no refresh handler is registered', async () => {
    setRefreshHandler(null);
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'expired' }));

    await expect(getMe('old')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

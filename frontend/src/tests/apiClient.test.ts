import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { ApiError, login, searchCities } from '../api/client';

// All public API client functions go through the same internal `request`
// helper, so testing one entry point (searchCities) covers the signal
// plumbing for the rest.

describe('api/client signal handling', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects immediately with an AbortError when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      searchCities('Mel', 't', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    // No fetch should have been issued at all.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('re-throws an AbortError (not ApiError) when the caller aborts mid-flight', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
      (_url, init) => {
        const sig = (init as { signal?: AbortSignal }).signal;
        return new Promise<Response>((_resolve, reject) => {
          sig?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        });
      },
    );

    const controller = new AbortController();
    const promise = searchCities('Mel', 't', { signal: controller.signal });

    // Abort while the request is in flight.
    controller.abort();

    const err = await promise.catch((e: unknown) => e);
    // Critical: callers can filter this out with err.name === 'AbortError'.
    // If we wrapped it in ApiError the UI would show a spurious network error.
    expect(err).toBeInstanceOf(DOMException);
    expect((err as DOMException).name).toBe('AbortError');
    expect(err).not.toBeInstanceOf(ApiError);
  });

  it('still maps the internal timeout to ApiError("Request timed out.")', async () => {
    vi.useFakeTimers();
    try {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
        (_url, init) => {
          const sig = (init as { signal?: AbortSignal }).signal;
          return new Promise<Response>((_resolve, reject) => {
            sig?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          });
        },
      );

      // No caller signal — timeout is the only abort source.
      const promise = searchCities('Mel', 't').catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(16_000);
      const err = await promise;

      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(0);
      expect((err as ApiError).message).toMatch(/timed out/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not cancel the request when neither the timeout nor the caller signal fires', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ cities: [{ name: 'M', latitude: 0, longitude: 0 }] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const controller = new AbortController();
    const result = await searchCities('Mel', 't', { signal: controller.signal });

    expect(result.cities).toHaveLength(1);
  });
});

describe('api/client request branches', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const fetchMock = () => globalThis.fetch as ReturnType<typeof vi.fn>;
  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  it('returns the parsed JSON body on a 2xx response', async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({ cities: [{ name: 'Oslo', latitude: 59.9, longitude: 10.7 }] }),
    );
    const result = await searchCities('Osl', 't');
    expect(result.cities[0]?.name).toBe('Oslo');
  });

  it('throws ApiError with the server status and message on a non-2xx response', async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({ error: 'Could not search cities.' }, 502),
    );
    const err = await searchCities('Osl', 't').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(502);
    expect((err as ApiError).message).toBe('Could not search cities.');
  });

  it('wraps a network failure as ApiError("Could not reach the server.", 0)', async () => {
    fetchMock().mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const err = await searchCities('Osl', 't').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toMatch(/could not reach the server/i);
  });

  it('sends the bearer token as an Authorization header', async () => {
    fetchMock().mockResolvedValueOnce(jsonResponse({ cities: [] }));
    await searchCities('Osl', 'my-token');
    const init = fetchMock().mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer my-token',
    );
  });

  it('JSON-encodes the body and sets POST + content-type for a write', async () => {
    fetchMock().mockResolvedValueOnce(
      jsonResponse({ accessToken: 'a', refreshToken: 'r', user: {} }),
    );
    await login('admin', 'secret');
    const init = fetchMock().mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
    expect(init.body).toBe(
      JSON.stringify({ username: 'admin', password: 'secret' }),
    );
  });
});

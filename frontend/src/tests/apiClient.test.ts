import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest';
import { ApiError, searchCities } from '../api/client';

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

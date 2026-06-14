import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useCityMessages } from '../socket/useLiveMessages';
import { LiveMessagesContext } from '../socket/context';

const { mockGetMessageHistory } = vi.hoisted(() => ({
  mockGetMessageHistory: vi.fn(),
}));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', username: 'u', displayName: 'U', role: 'user' },
    token: 't',
    status: 'authed' as const,
    sessionExpired: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

vi.mock('../api/client', async (importActual) => {
  const actual = await importActual<typeof import('../api/client')>();
  return { ...actual, getMessageHistory: mockGetMessageHistory };
});

// No socket needed — the join effect bails when socket is null, leaving the
// REST-history effect (the one under test) to run on its own.
function wrapper({ children }: { children: ReactNode }) {
  return (
    <LiveMessagesContext.Provider
      value={{ socket: null, connectionStatus: 'disconnected' }}
    >
      {children}
    </LiveMessagesContext.Provider>
  );
}

const CITY_A = { name: 'Oslo', latitude: 59.91, longitude: 10.75 };
const CITY_B = { name: 'Bergen', latitude: 60.39, longitude: 5.32 };

describe('useCityMessages history fetch', () => {
  beforeEach(() => {
    mockGetMessageHistory.mockReset();
    mockGetMessageHistory.mockReturnValue(new Promise<never>(() => {}));
  });

  it('aborts the previous history fetch when the city changes', () => {
    const signals: (AbortSignal | undefined)[] = [];
    mockGetMessageHistory.mockImplementation(
      (_city: unknown, _token: string, options?: { signal?: AbortSignal }) => {
        signals.push(options?.signal);
        return new Promise<never>(() => {});
      },
    );

    const { rerender } = renderHook(({ city }) => useCityMessages(city), {
      wrapper,
      initialProps: { city: CITY_A },
    });
    rerender({ city: CITY_B });

    expect(signals).toHaveLength(2);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
  });
});

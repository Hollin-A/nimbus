import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Socket } from 'socket.io-client';
import { useCityMessages } from '../socket/useLiveMessages';
import { LiveMessagesContext } from '../socket/context';
import type { LiveMessage } from '../types';

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

type Handler = (...args: unknown[]) => void;

// Minimal Socket.IO stand-in: records emits and lets a test fire events.
function makeFakeSocket() {
  const handlers = new Map<string, Handler[]>();
  return {
    connected: true,
    emit: vi.fn(),
    on: vi.fn((event: string, cb: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), cb]);
    }),
    off: vi.fn((event: string, cb: Handler) => {
      handlers.set(
        event,
        (handlers.get(event) ?? []).filter((h) => h !== cb),
      );
    }),
    trigger(event: string, ...args: unknown[]) {
      (handlers.get(event) ?? []).forEach((cb) => cb(...args));
    },
  };
}

function socketWrapper(socket: ReturnType<typeof makeFakeSocket>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <LiveMessagesContext.Provider
        value={{ socket: socket as unknown as Socket, connectionStatus: 'connected' }}
      >
        {children}
      </LiveMessagesContext.Provider>
    );
  };
}

function makeMsg(id: string): LiveMessage {
  return {
    id,
    city: CITY_A.name,
    latitude: CITY_A.latitude,
    longitude: CITY_A.longitude,
    message: `message ${id}`,
    severity: 'info',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('useCityMessages socket', () => {
  beforeEach(() => {
    mockGetMessageHistory.mockReset();
    // Leave REST history pending so its resolution doesn't setState outside
    // act — these tests exercise the socket path, where the live-message
    // handler updates history directly.
    mockGetMessageHistory.mockReturnValue(new Promise<never>(() => {}));
  });

  it('joins the room for the watched city', () => {
    const socket = makeFakeSocket();
    renderHook(() => useCityMessages(CITY_A), { wrapper: socketWrapper(socket) });
    expect(socket.emit).toHaveBeenCalledWith('join-city', {
      latitude: CITY_A.latitude,
      longitude: CITY_A.longitude,
      name: CITY_A.name,
    });
  });

  it('adds a live message to history, deduped by id', () => {
    const socket = makeFakeSocket();
    const { result } = renderHook(() => useCityMessages(CITY_A), {
      wrapper: socketWrapper(socket),
    });

    act(() => socket.trigger('live-message', makeMsg('1')));
    act(() => socket.trigger('live-message', makeMsg('1'))); // same id again

    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]?.id).toBe('1');
  });

  it('re-joins the room on reconnect', () => {
    const socket = makeFakeSocket();
    renderHook(() => useCityMessages(CITY_A), { wrapper: socketWrapper(socket) });
    socket.emit.mockClear();

    act(() => socket.trigger('connect'));

    expect(socket.emit).toHaveBeenCalledWith(
      'join-city',
      expect.objectContaining({ latitude: CITY_A.latitude }),
    );
  });

  it('leaves the room on unmount', () => {
    const socket = makeFakeSocket();
    const { unmount } = renderHook(() => useCityMessages(CITY_A), {
      wrapper: socketWrapper(socket),
    });

    unmount();

    expect(socket.emit).toHaveBeenCalledWith('leave-city');
  });
});

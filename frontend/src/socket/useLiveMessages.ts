import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ApiError, getMessageHistory } from '../api/client';
import { useAuth } from '../auth/useAuth';
import type { City, LiveMessage } from '../types';
import {
  LiveMessagesContext,
  type ConnectionStatus,
} from './context';

function useLiveMessagesContext() {
  const ctx = useContext(LiveMessagesContext);
  if (!ctx) {
    throw new Error('useLiveMessages must be used within LiveMessagesProvider');
  }
  return ctx;
}

export function useConnectionStatus(): ConnectionStatus {
  return useLiveMessagesContext().connectionStatus;
}

export interface UseCityMessagesResult {
  history: LiveMessage[];
  historyError: string | null;
  /** Subscribe to live messages for this city; returns an unsubscribe function. */
  subscribe: (listener: (message: LiveMessage) => void) => () => void;
}

/**
 * Per-city message stream. Joins the Socket.IO room for `city` (keyed by its
 * coordinates), fetches the REST history, and merges live-message events
 * into the history list. Returns empty history when `city` is null.
 *
 * Effects key on `city.latitude` + `city.longitude` (primitives) rather than
 * the object reference so a parent re-render with a fresh-but-equal City
 * object doesn't re-fire history fetches.
 */
export function useCityMessages(city: City | null): UseCityMessagesResult {
  const { socket } = useLiveMessagesContext();
  const { token } = useAuth();
  const [history, setHistory] = useState<LiveMessage[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Live messages are delivered to subscribers (e.g. ToastHost) rather than
  // held in a single "latest" slot, so two messages arriving in one batch both
  // fire instead of the earlier one being overwritten before anyone reads it.
  const listenersRef = useRef(new Set<(message: LiveMessage) => void>());
  const subscribe = useCallback(
    (listener: (message: LiveMessage) => void) => {
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
    [],
  );

  const latitude = city?.latitude ?? null;
  const longitude = city?.longitude ?? null;

  // REST history on city change.
  useEffect(() => {
    if (latitude === null || longitude === null || !token) {
      setHistory([]);
      setHistoryError(null);
      return;
    }
    // Abort the previous city's history fetch when the city changes or the
    // hook unmounts, so switching cities doesn't race concurrent requests.
    const controller = new AbortController();
    setHistoryError(null);
    setHistory([]);

    getMessageHistory({ latitude, longitude }, token, {
      signal: controller.signal,
    })
      .then(({ messages }) => {
        if (controller.signal.aborted) return;
        // Preserve any socket-pushed messages that arrived before the REST
        // history landed — dedupe by id.
        setHistory((prev) => {
          const seenIds = new Set(messages.map((m) => m.id));
          const fromSocket = prev.filter((m) => !seenIds.has(m.id));
          return [...fromSocket, ...messages];
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setHistoryError(
          err instanceof ApiError
            ? 'Could not load past alerts.'
            : 'Could not reach the server.',
        );
      });

    return () => controller.abort();
  }, [latitude, longitude, token]);

  // Socket room join / live-message subscription.
  useEffect(() => {
    if (!socket || latitude === null || longitude === null) return;

    const joinPayload = { latitude, longitude, name: city?.name };

    function joinRoom() {
      socket?.emit('join-city', joinPayload);
    }
    function handleLiveMessage(msg: LiveMessage) {
      setHistory((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [msg, ...prev].slice(0, 50);
      });
      listenersRef.current.forEach((listener) => listener(msg));
    }

    joinRoom();
    // Re-join the room whenever we reconnect (server-side room membership
    // is lost on disconnect).
    socket.on('connect', joinRoom);
    socket.on('live-message', handleLiveMessage);

    return () => {
      socket.off('connect', joinRoom);
      socket.off('live-message', handleLiveMessage);
      if (socket.connected) socket.emit('leave-city');
    };
    // city?.name is included so the optional display name flows through if
    // it changes for the same coordinates (e.g. a different label for the
    // same point) — the room itself is keyed by lat/lon so this is purely
    // a server-side logging hint.
  }, [socket, latitude, longitude, city?.name]);

  return { history, historyError, subscribe };
}

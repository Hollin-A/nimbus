import { useContext, useEffect, useState } from 'react';
import { ApiError, getMessageHistory } from '../api/client';
import { useAuth } from '../auth/useAuth';
import type { LiveMessage } from '../types';
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
  latest: LiveMessage | null;
  historyError: string | null;
}

/**
 * Per-city message stream. Joins the Socket.IO room for `city`, fetches the
 * REST history, and merges any live-message events into the history list.
 * Returns null history and null latest when no city is selected.
 */
export function useCityMessages(city: string | null): UseCityMessagesResult {
  const { socket } = useLiveMessagesContext();
  const { token } = useAuth();
  const [history, setHistory] = useState<LiveMessage[]>([]);
  const [latest, setLatest] = useState<LiveMessage | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // REST history on city change.
  useEffect(() => {
    if (!city || !token) {
      setHistory([]);
      setLatest(null);
      setHistoryError(null);
      return;
    }
    let cancelled = false;
    setHistoryError(null);
    setHistory([]);
    setLatest(null);

    getMessageHistory(city, token)
      .then(({ messages }) => {
        if (cancelled) return;
        // Preserve any socket-pushed messages that arrived before the REST
        // history landed — dedupe by id.
        setHistory((prev) => {
          const seenIds = new Set(messages.map((m) => m.id));
          const fromSocket = prev.filter((m) => !seenIds.has(m.id));
          return [...fromSocket, ...messages];
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setHistoryError(
          err instanceof ApiError
            ? 'Could not load past alerts.'
            : 'Could not reach the server.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [city, token]);

  // Socket room join / live-message subscription.
  useEffect(() => {
    if (!socket || !city) return;

    function joinRoom() {
      socket?.emit('join-city', city);
    }
    function handleLiveMessage(msg: LiveMessage) {
      setHistory((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [msg, ...prev].slice(0, 50);
      });
      setLatest(msg);
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
  }, [socket, city]);

  return { history, latest, historyError };
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { io as ioClient, type Socket } from 'socket.io-client';
import { useAuth } from '../auth/useAuth';
import {
  LiveMessagesContext,
  type ConnectionStatus,
  type LiveMessagesContextValue,
} from './context';

const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000'
).replace(/\/$/, '');

export function LiveMessagesProvider({ children }: { children: ReactNode }) {
  const { token, status } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');

  // Mirror the latest access token into a ref so the function-form auth
  // below reads the freshest value on every (re)connect — without making
  // the connection effect depend on `token` (which would tear down and
  // rebuild the socket on every 15-minute refresh).
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const isAuthed = status === 'authed';
  useEffect(() => {
    if (!isAuthed) {
      setSocket(null);
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connecting');
    const sock = ioClient(SOCKET_URL, {
      // Function form: called on every connection attempt, including
      // socket.io's own reconnections after a drop — so a reconnect uses
      // the current access token, not the one captured at login.
      auth: (cb) => cb({ token: tokenRef.current ?? '' }),
      transports: ['websocket'],
    });

    sock.on('connect', () => setConnectionStatus('connected'));
    sock.on('disconnect', () => setConnectionStatus('disconnected'));
    sock.on('connect_error', () => setConnectionStatus('disconnected'));

    setSocket(sock);

    return () => {
      sock.disconnect();
      setSocket(null);
      setConnectionStatus('disconnected');
    };
  }, [isAuthed]);

  const value: LiveMessagesContextValue = { socket, connectionStatus };

  return (
    <LiveMessagesContext.Provider value={value}>
      {children}
    </LiveMessagesContext.Provider>
  );
}

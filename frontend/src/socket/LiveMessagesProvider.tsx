import { useEffect, useState, type ReactNode } from 'react';
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
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    if (!token) {
      setSocket(null);
      setConnectionStatus('disconnected');
      return;
    }

    setConnectionStatus('connecting');
    const sock = ioClient(SOCKET_URL, {
      auth: { token },
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
  }, [token]);

  const value: LiveMessagesContextValue = { socket, connectionStatus };

  return (
    <LiveMessagesContext.Provider value={value}>
      {children}
    </LiveMessagesContext.Provider>
  );
}

import { createContext } from 'react';
import type { Socket } from 'socket.io-client';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface LiveMessagesContextValue {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
}

export const LiveMessagesContext = createContext<LiveMessagesContextValue | null>(
  null,
);

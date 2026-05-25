import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { config } from '../config';
import { verifyToken, type AuthClaims } from '../auth/auth.service';
import type { LiveMessage } from '../types';

// The Socket.IO server is held at module scope so the messages route can
// call broadcastMessage() without having to thread `io` through every
// import. In tests where Socket.IO is never initialised (`initSocket` is
// not called), `io` stays null and broadcastMessage is a no-op.
let io: Server | null = null;

/** Normalises a city name to its Socket.IO room key. */
export function roomFor(city: string): string {
  return `city:${city.trim().toLowerCase()}`;
}

interface SocketData {
  auth?: AuthClaims;
}

type JoinAck = (response: { ok: boolean; error?: string }) => void;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigin },
  });

  // Handshake auth — same JWT as the REST API (see ADR 0003).
  io.use((socket, next) => {
    const raw = socket.handshake.auth as { token?: unknown } | undefined;
    const token = typeof raw?.token === 'string' ? raw.token : null;
    if (!token) {
      next(new Error('Authentication required'));
      return;
    }
    const claims = verifyToken(token);
    if (!claims) {
      next(new Error('Invalid or expired token'));
      return;
    }
    (socket.data as SocketData).auth = claims;
    next();
  });

  io.on('connection', (socket: Socket) => {
    let currentCity: string | null = null;

    socket.on('join-city', (city: unknown, ack?: JoinAck) => {
      if (typeof city !== 'string' || !city.trim()) {
        ack?.({ ok: false, error: 'Invalid city' });
        return;
      }
      if (currentCity !== null) {
        socket.leave(roomFor(currentCity));
      }
      socket.join(roomFor(city));
      currentCity = city;
      ack?.({ ok: true });
    });

    socket.on('leave-city', (ack?: JoinAck) => {
      if (currentCity !== null) {
        socket.leave(roomFor(currentCity));
        currentCity = null;
      }
      ack?.({ ok: true });
    });
  });

  return io;
}

export function broadcastMessage(message: LiveMessage): void {
  if (!io) return;
  io.to(roomFor(message.city)).emit('live-message', message);
}

/** Test helper — closes the socket server. */
export function closeSocket(): Promise<void> {
  if (!io) return Promise.resolve();
  return new Promise((resolve) => {
    io!.close(() => {
      io = null;
      resolve();
    });
  });
}

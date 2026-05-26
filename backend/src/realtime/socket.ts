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

/**
 * Normalises a city's coordinates to its Socket.IO room key. Two cities
 * sharing a name (Melbourne, AU vs Melbourne, FL) have distinct rooms —
 * keyed on `(lat, lon)` rounded to 4 decimal places (~11m precision).
 */
export function roomFor(latitude: number, longitude: number): string {
  return `city:${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
}

interface SocketData {
  auth?: AuthClaims;
}

type JoinAck = (response: { ok: boolean; error?: string }) => void;

interface JoinCityPayload {
  latitude: number;
  longitude: number;
  /** Optional display name — server-side, only used for logging. */
  name?: string;
}

function isValidJoinPayload(value: unknown): value is JoinCityPayload {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.latitude !== 'number' || typeof obj.longitude !== 'number') {
    return false;
  }
  if (obj.latitude < -90 || obj.latitude > 90) return false;
  if (obj.longitude < -180 || obj.longitude > 180) return false;
  return true;
}

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
    let currentRoom: string | null = null;

    socket.on('join-city', (payload: unknown, ack?: JoinAck) => {
      if (!isValidJoinPayload(payload)) {
        ack?.({ ok: false, error: 'Invalid coordinates' });
        return;
      }
      if (currentRoom !== null) {
        socket.leave(currentRoom);
      }
      const room = roomFor(payload.latitude, payload.longitude);
      socket.join(room);
      currentRoom = room;
      ack?.({ ok: true });
    });

    socket.on('leave-city', (ack?: JoinAck) => {
      if (currentRoom !== null) {
        socket.leave(currentRoom);
        currentRoom = null;
      }
      ack?.({ ok: true });
    });
  });

  return io;
}

export function broadcastMessage(message: LiveMessage): void {
  if (!io) return;
  io.to(roomFor(message.latitude, message.longitude)).emit(
    'live-message',
    message,
  );
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

import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { config } from '../config';
import { logger } from '../logger';
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
  /** Per-connection correlation id — the socket equivalent of reqId. */
  connId?: string;
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

  // Handshake auth — same JWT as the REST API (see ADR 0003). The connId
  // is minted here (before connection) so a rejected handshake is still
  // traceable, and it carries through to the connection's child logger.
  io.use((socket, next) => {
    const connId = randomUUID();
    (socket.data as SocketData).connId = connId;

    const raw = socket.handshake.auth as { token?: unknown } | undefined;
    const token = typeof raw?.token === 'string' ? raw.token : null;
    if (!token) {
      logger.warn(
        { event: 'socket.handshake.failure', reason: 'missing_token', connId },
        'socket handshake rejected',
      );
      next(new Error('Authentication required'));
      return;
    }
    const claims = verifyToken(token);
    if (!claims) {
      logger.warn(
        { event: 'socket.handshake.failure', reason: 'invalid_or_expired', connId },
        'socket handshake rejected',
      );
      next(new Error('Invalid or expired token'));
      return;
    }
    (socket.data as SocketData).auth = claims;
    next();
  });

  io.on('connection', (socket: Socket) => {
    const { connId, auth } = socket.data as SocketData;
    const log = logger.child({ connId, userId: auth?.sub });
    let currentRoom: string | null = null;

    log.info({ event: 'socket.connect' }, 'socket connected');

    socket.on('join-city', (payload: unknown, ack?: JoinAck) => {
      if (!isValidJoinPayload(payload)) {
        // Malformed coordinates from an authenticated client are worth a
        // warn — could indicate a buggy client or probing.
        log.warn({ event: 'socket.join.invalid' }, 'invalid join payload');
        ack?.({ ok: false, error: 'Invalid coordinates' });
        return;
      }
      if (currentRoom !== null) {
        socket.leave(currentRoom);
      }
      const room = roomFor(payload.latitude, payload.longitude);
      socket.join(room);
      currentRoom = room;
      const recipients = io?.sockets.adapter.rooms.get(room)?.size ?? 0;
      log.info(
        { event: 'socket.join', room, name: payload.name, recipients },
        'joined city',
      );
      ack?.({ ok: true });
    });

    socket.on('leave-city', (ack?: JoinAck) => {
      if (currentRoom !== null) {
        log.info({ event: 'socket.leave', room: currentRoom }, 'left city');
        socket.leave(currentRoom);
        currentRoom = null;
      }
      ack?.({ ok: true });
    });

    socket.on('disconnect', (reason: string) => {
      log.info({ event: 'socket.disconnect', reason }, 'socket disconnected');
    });
  });

  return io;
}

export function broadcastMessage(message: LiveMessage): void {
  if (!io) return;
  const room = roomFor(message.latitude, message.longitude);
  // recipients: 0 is the answer to "I broadcast but nobody saw it" —
  // wrong room or nobody watching. messageId correlates back to the
  // POST /api/messages response.
  const recipients = io.sockets.adapter.rooms.get(room)?.size ?? 0;
  io.to(room).emit('live-message', message);
  logger.info(
    { event: 'socket.broadcast', room, messageId: message.id, recipients },
    'broadcast emitted',
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

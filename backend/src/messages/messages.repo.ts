import type { Message } from '@prisma/client';
import { getDb } from '../db';
import type { LiveMessage, Severity } from '../types';

export interface MessageInput {
  city: string;
  latitude: number;
  longitude: number;
  message: string;
  severity: Severity;
}

/** History page size — the API contract caps history at 50 (OpenAPI). */
export const MAX_PER_CITY = 50;

// Coordinates are rounded to 4 decimal places (~11m) at the repo
// boundary, on write AND on read, so equality on the stored value IS
// the city grouping — the same key semantic the socket rooms (roomFor)
// and the v1 in-memory store used. The committed
// (latitude, longitude, createdAt) index serves the history query
// directly.
export function roundCoord(value: number): number {
  return Number(value.toFixed(4));
}

// Maps a Prisma row to the wire shape the routes, sockets and frontend
// already consume — createdAt as an ISO string, not a Date.
function toLiveMessage(row: Message): LiveMessage {
  return {
    id: row.id,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    message: row.message,
    severity: row.severity as Severity,
    createdAt: row.createdAt.toISOString(),
  };
}

export const messagesRepo = {
  async add(input: MessageInput): Promise<LiveMessage> {
    const row = await getDb().message.create({
      data: {
        city: input.city.trim(),
        latitude: roundCoord(input.latitude),
        longitude: roundCoord(input.longitude),
        message: input.message,
        severity: input.severity,
      },
    });
    return toLiveMessage(row);
  },

  async history(latitude: number, longitude: number): Promise<LiveMessage[]> {
    const rows = await getDb().message.findMany({
      where: { latitude: roundCoord(latitude), longitude: roundCoord(longitude) },
      // id as a deterministic (if arbitrary) tie-break for rows sharing
      // a millisecond timestamp.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_PER_CITY,
    });
    return rows.map(toLiveMessage);
  },
};

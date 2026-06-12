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

// Skeleton — the spec in tests/messagesRepo.test.ts lands first (red);
// the next commit implements these over Prisma.
export const messagesRepo = {
  async add(_input: MessageInput): Promise<LiveMessage> {
    throw new Error('not implemented');
  },

  async history(_latitude: number, _longitude: number): Promise<LiveMessage[]> {
    throw new Error('not implemented');
  },
};

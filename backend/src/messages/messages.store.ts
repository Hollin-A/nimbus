import { randomUUID } from 'node:crypto';
import type { LiveMessage, Severity } from '../types';

export interface MessageInput {
  city: string;
  latitude: number;
  longitude: number;
  message: string;
  severity: Severity;
}

const MAX_PER_CITY = 50;

// Keyed by (lat, lon) rounded to 4 decimal places (~11m precision — same as
// the weather cache). See ADR 0002 for the in-memory storage decision and
// ADR 0001 for why we key by coords rather than name.
const store = new Map<string, LiveMessage[]>();

function cityKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
}

export function addMessage(input: MessageInput): LiveMessage {
  const message: LiveMessage = {
    id: randomUUID(),
    city: input.city.trim(),
    latitude: input.latitude,
    longitude: input.longitude,
    message: input.message,
    severity: input.severity,
    createdAt: new Date().toISOString(),
  };

  const key = cityKey(input.latitude, input.longitude);
  const list = store.get(key) ?? [];
  list.unshift(message); // newest first
  if (list.length > MAX_PER_CITY) {
    list.length = MAX_PER_CITY; // drop oldest entries from the tail
  }
  store.set(key, list);
  return message;
}

export function getHistory(
  latitude: number,
  longitude: number,
): LiveMessage[] {
  return [...(store.get(cityKey(latitude, longitude)) ?? [])];
}

export function clearMessages(): void {
  store.clear();
}

import { randomUUID } from 'node:crypto';
import type { LiveMessage, Severity } from '../types';

export interface MessageInput {
  city: string;
  message: string;
  severity: Severity;
}

const MAX_PER_CITY = 50;

// Keyed by lowercased + trimmed city name (see cityKey). See ADR 0002 for
// the in-memory storage decision.
const store = new Map<string, LiveMessage[]>();

function cityKey(city: string): string {
  return city.trim().toLowerCase();
}

export function addMessage(input: MessageInput): LiveMessage {
  const message: LiveMessage = {
    id: randomUUID(),
    city: input.city.trim(),
    message: input.message,
    severity: input.severity,
    createdAt: new Date().toISOString(),
  };

  const key = cityKey(input.city);
  const list = store.get(key) ?? [];
  list.unshift(message); // newest first
  if (list.length > MAX_PER_CITY) {
    list.length = MAX_PER_CITY; // drop oldest entries from the tail
  }
  store.set(key, list);
  return message;
}

export function getHistory(city: string): LiveMessage[] {
  // Return a copy so callers can't mutate the stored array.
  return [...(store.get(cityKey(city)) ?? [])];
}

export function clearMessages(): void {
  store.clear();
}

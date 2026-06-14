import type { City } from '../types';

// Two independent lists share this logic, each under its own key: the cities
// a user has viewed (home page) and the cities an admin has broadcast to.
export const VIEWED_CITIES_KEY = 'nimbus.recentCities';
export const BROADCAST_TARGETS_KEY = 'nimbus.broadcast-targets';
const MAX_RECENT = 5;

function sameCity(a: City, b: City): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

export function loadRecent(key: string = VIEWED_CITIES_KEY): City[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is City =>
          typeof entry === 'object' &&
          entry !== null &&
          typeof (entry as City).name === 'string' &&
          typeof (entry as City).latitude === 'number' &&
          typeof (entry as City).longitude === 'number',
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function saveRecent(
  city: City,
  current: City[],
  key: string = VIEWED_CITIES_KEY,
): City[] {
  const deduped = current.filter((c) => !sameCity(c, city));
  const next = [city, ...deduped].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Ignore quota / disabled-storage errors — the list is convenience, not state of record.
  }
  return next;
}

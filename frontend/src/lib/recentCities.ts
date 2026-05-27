import type { City } from '../types';

const STORAGE_KEY = 'nimbus.recentCities';
const MAX_RECENT = 5;

function sameCity(a: City, b: City): boolean {
  return a.latitude === b.latitude && a.longitude === b.longitude;
}

export function loadRecent(): City[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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

export function saveRecent(city: City, current: City[]): City[] {
  const deduped = current.filter((c) => !sameCity(c, city));
  const next = [city, ...deduped].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / disabled-storage errors — the list is convenience, not state of record.
  }
  return next;
}

import { useSyncExternalStore } from 'react';

/**
 * Returns true when the browser believes it has network connectivity.
 *
 * Backed by navigator.onLine + the window online/offline events, exposed as a
 * shared external store via useSyncExternalStore: tearing-safe, SSR-ready, and
 * every consumer shares one subscription rather than each adding its own pair
 * of listeners. The signal is heuristic — navigator.onLine is true whenever
 * the OS has a default route, not whenever the server is actually reachable.
 */
function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  // No navigator on the server — assume online so SSR markup matches the
  // optimistic client default.
  return true;
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

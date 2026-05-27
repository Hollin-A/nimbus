import { useEffect, useState } from 'react';

/**
 * Returns true when the browser believes it has network connectivity.
 *
 * Backed by navigator.onLine + window online/offline events. The signal is
 * heuristic — navigator.onLine is true whenever the OS has a default route,
 * not whenever the server is actually reachable. Good enough for the common
 * cases (Wi-Fi dropped, airplane mode) and free of polling overhead.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    function handleOnline() {
      setOnline(true);
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return online;
}

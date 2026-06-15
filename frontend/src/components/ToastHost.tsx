import { useEffect, useRef, useState } from 'react';
import type { LiveMessage } from '../types';
import Toast from './Toast';

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 7_000;

interface ToastHostProps {
  /**
   * Subscribe to live messages; returns an unsubscribe function. Each delivered
   * message is pushed onto the visible-toast queue (deduped by id).
   */
  subscribe: (listener: (message: LiveMessage) => void) => () => void;
}

export default function ToastHost({ subscribe }: ToastHostProps) {
  const [toasts, setToasts] = useState<LiveMessage[]>([]);
  const seenIds = useRef(new Set<string>());
  // Per-toast auto-dismiss timers, keyed by message id. Tracked in a ref so
  // a new arrival does NOT cancel earlier toasts' timers (the earlier
  // implementation cleared them, leaving rapid-burst toasts stuck forever).
  const dismissTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  useEffect(() => {
    return subscribe((message) => {
      if (seenIds.current.has(message.id)) return;
      seenIds.current.add(message.id);

      const id = message.id;
      setToasts((prev) => [message, ...prev].slice(0, MAX_TOASTS));

      const handle = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        dismissTimers.current.delete(id);
      }, AUTO_DISMISS_MS);
      dismissTimers.current.set(id, handle);
    });
  }, [subscribe]);

  // Drain all pending timers on unmount.
  useEffect(() => {
    const timers = dismissTimers.current;
    return () => {
      timers.forEach((handle) => clearTimeout(handle));
      timers.clear();
    };
  }, []);

  function dismiss(id: string) {
    const handle = dismissTimers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      dismissTimers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-50 flex flex-col gap-3 w-[min(420px,calc(100vw-2rem))] pointer-events-none"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast message={toast} onClose={() => dismiss(toast.id)} />
        </div>
      ))}
    </div>
  );
}

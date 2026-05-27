import { useEffect, useRef, useState } from 'react';
import type { LiveMessage } from '../types';
import Toast from './Toast';

const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 7_000;

interface ToastHostProps {
  /**
   * The most-recent live message. When this changes to a new (unseen) message,
   * the host pushes it onto its visible-toast queue. Pass null to no-op.
   */
  latest: LiveMessage | null;
}

export default function ToastHost({ latest }: ToastHostProps) {
  const [toasts, setToasts] = useState<LiveMessage[]>([]);
  const seenIds = useRef(new Set<string>());
  // Per-toast auto-dismiss timers, keyed by message id. Tracked in a ref so
  // a new arrival's effect cleanup does NOT cancel earlier toasts' timers
  // (the earlier implementation cleared them, leaving rapid-burst toasts
  // stuck in the queue forever).
  const dismissTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  useEffect(() => {
    if (!latest) return;
    if (seenIds.current.has(latest.id)) return;
    seenIds.current.add(latest.id);

    const id = latest.id;
    setToasts((prev) => [latest, ...prev].slice(0, MAX_TOASTS));

    const handle = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      dismissTimers.current.delete(id);
    }, AUTO_DISMISS_MS);
    dismissTimers.current.set(id, handle);
  }, [latest]);

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

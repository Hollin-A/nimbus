import { WifiOff } from 'lucide-react';
import { useOnline } from '../lib/useOnline';

export default function OfflineNotice() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-amber-50 border-b border-amber-200"
    >
      <div className="mx-auto max-w-6xl px-6 py-2.5 flex items-center gap-2 text-sm text-amber-700">
        <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
        <span>
          You're offline. Weather and live alerts will resume once the
          connection is back.
        </span>
      </div>
    </div>
  );
}

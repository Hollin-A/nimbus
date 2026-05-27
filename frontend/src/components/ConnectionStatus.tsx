import type { ConnectionStatus as Status } from '../socket/context';

interface ConnectionStatusProps {
  status: Status;
}

export default function ConnectionStatus({ status }: ConnectionStatusProps) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden />
        Live
      </span>
    );
  }
  if (status === 'connecting') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
        <span
          className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"
          aria-hidden
        />
        Connecting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" aria-hidden />
      Offline
    </span>
  );
}

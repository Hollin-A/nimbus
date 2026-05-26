import { Bell } from 'lucide-react';
import type { LiveMessage, Severity } from '../types';

const SEVERITY_DOT: Record<Severity, string> = {
  info: 'bg-severity-info-text',
  warning: 'bg-severity-warning-text',
  alert: 'bg-severity-alert-text',
};

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

interface MessageHistoryProps {
  city: string | null;
  messages: LiveMessage[];
  error?: string | null;
}

export default function MessageHistory({
  city,
  messages,
  error,
}: MessageHistoryProps) {
  if (!city) {
    return (
      <div className="rounded-card border border-dashed border-border p-6 text-center">
        <Bell className="mx-auto h-6 w-6 text-muted" aria-hidden />
        <p className="mt-3 text-sm text-muted">
          Past alerts for the selected city show up here.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-border bg-white p-4 text-sm text-severity-alert-text">
        {error}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-border p-6 text-center">
        <Bell className="mx-auto h-6 w-6 text-muted" aria-hidden />
        <p className="mt-3 text-sm text-muted">No alerts for {city} yet.</p>
        <p className="text-xs text-muted mt-1">
          New broadcasts will appear here as they're sent.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {messages.map((msg) => (
        <li
          key={msg.id}
          className="rounded-card border border-border bg-white p-3 flex items-start gap-3"
        >
          <span
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOT[msg.severity]}`}
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink break-words">{msg.message}</p>
            <p className="mt-1 text-xs text-muted">
              {formatRelative(msg.createdAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

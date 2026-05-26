import {
  AlertOctagon,
  AlertTriangle,
  Info,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { LiveMessage, Severity } from '../types';

interface SeverityStyle {
  icon: LucideIcon;
  label: string;
  iconBg: string;
  iconText: string;
  ringText: string;
}

const SEVERITY: Record<Severity, SeverityStyle> = {
  info: {
    icon: Info,
    label: 'Info',
    iconBg: 'bg-severity-info-bg',
    iconText: 'text-severity-info-text',
    ringText: 'text-severity-info-text',
  },
  warning: {
    icon: AlertTriangle,
    label: 'Warning',
    iconBg: 'bg-severity-warning-bg',
    iconText: 'text-severity-warning-text',
    ringText: 'text-severity-warning-text',
  },
  alert: {
    icon: AlertOctagon,
    label: 'Alert',
    iconBg: 'bg-severity-alert-bg',
    iconText: 'text-severity-alert-text',
    ringText: 'text-severity-alert-text',
  },
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

interface ToastProps {
  message: LiveMessage;
  onClose: () => void;
}

export default function Toast({ message, onClose }: ToastProps) {
  const style = SEVERITY[message.severity];
  const Icon = style.icon;

  return (
    <div
      role="status"
      className="w-full rounded-toast border border-border bg-white p-4 shadow-elevated animate-slide-in"
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.iconBg}`}
          aria-hidden
        >
          <Icon className={`h-5 w-5 ${style.iconText}`} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-[11px] uppercase tracking-[0.12em] font-semibold ${style.ringText}`}
            >
              {style.label}
            </span>
            <span className="text-xs text-muted truncate">{message.city}</span>
            <span className="ml-auto text-xs text-muted">
              {formatTime(message.createdAt)}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink break-words">{message.message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="text-muted hover:text-ink transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

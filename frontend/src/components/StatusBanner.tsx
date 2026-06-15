import { AlertCircle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';

export type StatusKind = 'error' | 'success' | 'info';

interface StatusBannerProps {
  kind: StatusKind;
  message: string;
  /** Optional bold lead line above the message. */
  title?: string;
  /** When provided, renders a "Try again" action. */
  onRetry?: () => void;
}

interface KindStyle {
  /** Errors are assertive; success/info are polite. */
  role: 'alert' | 'status';
  icon: LucideIcon;
  className: string;
}

const KIND_STYLES: Record<StatusKind, KindStyle> = {
  error: {
    role: 'alert',
    icon: AlertCircle,
    className: 'bg-severity-alert-bg text-severity-alert-text',
  },
  success: {
    role: 'status',
    icon: CheckCircle2,
    className: 'bg-green-50 border border-green-200 text-green-700',
  },
  info: {
    role: 'status',
    icon: Info,
    className: 'bg-severity-info-bg text-severity-info-text',
  },
};

/**
 * One shape for announcing operation status across the app — errors,
 * confirmations, and informational notices — replacing the per-page inline
 * alert/status divs and the bespoke weather error card.
 */
export default function StatusBanner({
  kind,
  message,
  title,
  onRetry,
}: StatusBannerProps) {
  const { role, icon: Icon, className } = KIND_STYLES[kind];
  return (
    <div
      role={role}
      className={`flex items-start gap-2 rounded-input p-3 text-sm ${className}`}
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <p>{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 font-semibold underline hover:no-underline"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

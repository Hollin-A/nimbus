import type { Severity } from '../types';

interface Option {
  value: Severity;
  label: string;
  activeBg: string;
  activeText: string;
}

const OPTIONS: Option[] = [
  {
    value: 'info',
    label: 'Info',
    activeBg: 'bg-severity-info-bg',
    activeText: 'text-severity-info-text',
  },
  {
    value: 'warning',
    label: 'Warning',
    activeBg: 'bg-severity-warning-bg',
    activeText: 'text-severity-warning-text',
  },
  {
    value: 'alert',
    label: 'Alert',
    activeBg: 'bg-severity-alert-bg',
    activeText: 'text-severity-alert-text',
  },
];

interface SeveritySelectProps {
  value: Severity;
  onChange: (value: Severity) => void;
  /** Optional id for the surrounding label's htmlFor. */
  id?: string;
}

export default function SeveritySelect({
  value,
  onChange,
  id,
}: SeveritySelectProps) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label="Severity"
      className="inline-flex rounded-full border border-border bg-white p-1"
    >
      {OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? `${option.activeBg} ${option.activeText}`
                : 'text-body hover:text-ink'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

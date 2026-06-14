import { useRef, type KeyboardEvent } from 'react';
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
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // WAI-ARIA radiogroup keyboard contract: arrow keys move selection (and
  // focus) between options, wrapping at the ends; Home/End jump to first/last.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = OPTIONS.findIndex((option) => option.value === value);
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % OPTIONS.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + OPTIONS.length) % OPTIONS.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = OPTIONS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(OPTIONS[next].value);
    buttonsRef.current[next]?.focus();
  }

  return (
    <div
      id={id}
      role="radiogroup"
      aria-label="Severity"
      onKeyDown={handleKeyDown}
      className="inline-flex rounded-full border border-border bg-white p-1"
    >
      {OPTIONS.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonsRef.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            // Roving tabindex: only the selected option is a tab stop, so Tab
            // enters/leaves the group as one unit rather than each option.
            tabIndex={active ? 0 : -1}
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

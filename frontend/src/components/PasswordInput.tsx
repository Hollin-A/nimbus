import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
}

// A masked password field with a show/hide toggle. The toggle is a
// type="button" (so it never submits the form) with an aria-label that
// flips, and the icon is aria-hidden — screen readers get the button's
// label, not the decorative glyph.
export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  required,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-1">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-input border border-border bg-white px-3 py-2.5 pr-10 text-base md:text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted hover:text-ink"
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

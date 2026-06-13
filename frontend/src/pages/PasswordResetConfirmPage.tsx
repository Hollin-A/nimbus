import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { ApiError, confirmPasswordReset } from '../api/client';
import Wordmark from '../components/Wordmark';

const MIN_PASSWORD = 8;

export default function PasswordResetConfirmPage() {
  const [searchParams] = useSearchParams();
  // Pre-fill from the URL — a real email link lands here as
  // /reset/confirm?token=… — but keep it editable for manual paste.
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!token.trim()) {
      setError('Paste your reset token.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(token.trim(), password);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) setError('That reset token is invalid or has expired.');
        else setError(err.message);
      } else {
        setError('Could not reach the server.');
      }
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white text-ink">
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center">
          <Link to="/" aria-label="Nimbus home" className="-mx-2 px-2 py-1">
            <Wordmark />
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="mx-auto max-w-md px-6 py-12 w-full">
          <p className="text-xs uppercase tracking-[0.2em] text-brand font-semibold">
            Reset password
          </p>
          <h1 className="mt-2 text-3xl md:text-4xl font-extrabold text-ink leading-[1.1] tracking-tight">
            Set a new password.
          </h1>

          {done ? (
            <div className="mt-6 space-y-4">
              <div
                role="status"
                className="flex items-start gap-2 rounded-input bg-severity-info-bg p-3 text-severity-info-text text-sm"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Your password has been updated. Sign in with your new password.</span>
              </div>
              <Link
                to="/login"
                className="inline-block w-full rounded-full bg-brand py-3 text-center font-semibold text-white hover:bg-brand-hover transition-colors"
              >
                Go to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
              <div>
                <label htmlFor="token" className="block text-sm font-semibold text-ink">
                  Reset token
                </label>
                <input
                  id="token"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border bg-white px-3 py-2.5 font-mono text-base md:text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-ink">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border bg-white px-3 py-2.5 text-base md:text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
              </div>

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-input bg-severity-alert-bg p-3 text-severity-alert-text text-sm"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-brand py-3 font-semibold text-white hover:bg-brand-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

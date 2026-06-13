import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Info } from 'lucide-react';
import {
  ApiError,
  requestPasswordReset,
  type PasswordResetIssued,
} from '../api/client';
import Wordmark from '../components/Wordmark';

export default function PasswordResetRequestPage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<PasswordResetIssued | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError('Enter your username.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await requestPasswordReset(username.trim());
      setIssued(result);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 404) setError('No account with that username.');
        else setError(err.message);
      } else {
        setError('Could not reach the server.');
      }
    } finally {
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
            Forgot your password?
          </h1>

          {issued ? (
            <div className="mt-6 space-y-4">
              <p className="text-base text-body">
                Use this single-use token to set a new password — it expires in
                an hour.
              </p>
              <div className="rounded-input border border-border bg-surface-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Reset token
                </p>
                <code className="mt-1 block break-all font-mono text-sm text-ink">
                  {issued.token}
                </code>
              </div>
              <div
                role="note"
                className="flex items-start gap-2 rounded-input bg-severity-info-bg p-3 text-severity-info-text text-sm"
              >
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  {issued.note} Because the token appears here rather than in your
                  inbox, this demo can reveal whether a username exists — an
                  accepted trade-off for a portfolio app with no private data.
                </span>
              </div>
              <Link
                to={`/reset/confirm?token=${encodeURIComponent(issued.token)}`}
                className="inline-block w-full rounded-full bg-brand py-3 text-center font-semibold text-white hover:bg-brand-hover transition-colors"
              >
                Continue to set a new password
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5" noValidate>
              <div>
                <label htmlFor="username" className="block text-sm font-semibold text-ink">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border bg-white px-3 py-2.5 text-base md:text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
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
                {submitting ? 'Requesting…' : 'Request reset token'}
              </button>

              <p className="text-sm text-muted text-center">
                Remembered it?{' '}
                <Link to="/login" className="text-brand font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

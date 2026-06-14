import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/useAuth';
import Wordmark from '../components/Wordmark';
import PasswordInput from '../components/PasswordInput';

export default function LoginPage() {
  const { status, sessionExpired, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authed') return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Validate client-side first so an empty submit shows the error
    // instantly instead of round-tripping to the server for a 400.
    if (!username.trim() || !password) {
      setError('Please fill in both fields.');
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError('Invalid username or password.');
        else if (err.status === 400) setError('Please fill in both fields.');
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
        <div className="mx-auto max-w-6xl px-6 py-12 w-full grid md:grid-cols-2 gap-12 md:gap-16 items-start">
          {/* Hero copy */}
          <div className="max-w-md">
            <p className="text-xs uppercase tracking-[0.2em] text-brand font-semibold">
              Sign in
            </p>
            <h1 className="mt-2 text-4xl md:text-6xl font-extrabold text-ink leading-[1.05] tracking-tight">
              Welcome back.
            </h1>
            <p className="mt-6 text-base md:text-lg text-body max-w-prose">
              Pick up where you left off. Choose a city, see the current
              conditions, and watch alerts arrive in real time.
            </p>
          </div>

          {/* Form */}
          <div className="w-full max-w-md md:justify-self-end">
            {sessionExpired && (
              <div
                role="status"
                className="mb-4 rounded-input bg-severity-info-bg p-3 text-severity-info-text text-sm"
              >
                Your session expired. Please sign in again.
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label
                  htmlFor="username"
                  className="block text-sm font-semibold text-ink"
                >
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
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-ink"
                >
                  Password
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={setPassword}
                />
                <div className="mt-1.5 text-right">
                  <Link
                    to="/reset"
                    className="text-sm font-semibold text-brand hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
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
                {submitting ? 'Signing in…' : 'Sign in'}
              </button>

              <div className="rounded-input border border-border bg-surface-2 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Demo accounts
                </p>
                <p className="mt-1.5 text-sm text-body">
                  <code className="text-ink font-mono">admin</code>{' '}
                  <span className="text-border">/</span>{' '}
                  <code className="text-ink font-mono">admin123</code>
                  <span className="text-muted"> — full access</span>
                </p>
                <p className="mt-0.5 text-sm text-body">
                  <code className="text-ink font-mono">viewer</code>{' '}
                  <span className="text-border">/</span>{' '}
                  <code className="text-ink font-mono">viewer123</code>
                  <span className="text-muted"> — view only</span>
                </p>
              </div>

              <p className="text-sm text-muted text-center">
                Don’t have an account?{' '}
                <Link
                  to="/register"
                  className="text-brand font-semibold hover:underline"
                >
                  Create one
                </Link>
              </p>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

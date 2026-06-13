import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { ApiError, register as apiRegister } from '../api/client';
import { useAuth } from '../auth/useAuth';
import Wordmark from '../components/Wordmark';
import PasswordInput from '../components/PasswordInput';

const MIN_PASSWORD = 8;

export default function RegisterPage() {
  const { status, login } = useAuth();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authed') return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Client-side guard so an obviously-invalid submit fails instantly
    // rather than round-tripping for a 400 (server still validates).
    if (!username.trim() || !displayName.trim() || !password) {
      setError('Please fill in every field.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setSubmitting(true);
    try {
      await apiRegister(username.trim(), password, displayName.trim());
      // Registration issues no session, so log in right after to land
      // the new user straight on the home page.
      await login(username.trim(), password);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) setError('That username is already taken.');
        else if (err.status === 400) {
          setError('Check your details — password must be at least 8 characters.');
        } else setError(err.message);
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
        <div className="mx-auto max-w-6xl px-6 py-12 w-full grid md:grid-cols-2 gap-12 md:gap-16 items-start">
          <div className="max-w-md">
            <p className="text-xs uppercase tracking-[0.2em] text-brand font-semibold">
              Create account
            </p>
            <h1 className="mt-2 text-4xl md:text-6xl font-extrabold text-ink leading-[1.05] tracking-tight">
              Join Nimbus.
            </h1>
            <p className="mt-6 text-base md:text-lg text-body max-w-prose">
              Set up an account to track cities and receive live alerts. New
              accounts can view weather and alerts; broadcasting is reserved for
              admins.
            </p>
          </div>

          <div className="w-full max-w-md md:justify-self-end">
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
              <div>
                <label htmlFor="displayName" className="block text-sm font-semibold text-ink">
                  Display name
                </label>
                <input
                  id="displayName"
                  type="text"
                  autoComplete="name"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="mt-1 w-full rounded-input border border-border bg-white px-3 py-2.5 text-base md:text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-ink">
                  Password
                </label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={setPassword}
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
                {submitting ? 'Creating account…' : 'Create account'}
              </button>

              <p className="text-sm text-muted text-center">
                Already have an account?{' '}
                <Link to="/login" className="text-brand font-semibold hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

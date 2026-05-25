import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import Wordmark from './Wordmark';

export default function AppShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-white text-ink">
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <Link to="/" aria-label="Nimbus home" className="-mx-2 px-2 py-1">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-body hidden sm:inline">
                Hi,{' '}
                <span className="font-semibold text-ink">
                  {user.displayName}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={logout}
              className="rounded-full bg-brand-soft px-5 py-2 text-sm font-semibold text-brand hover:bg-brand-soft/70 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

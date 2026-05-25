import { Link, Outlet } from 'react-router-dom';
import Wordmark from './Wordmark';

export default function AppShell() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-ink">
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center justify-between">
          <Link to="/" aria-label="Nimbus home" className="-mx-2 px-2 py-1">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link
              to="/login"
              className="rounded-full bg-brand-soft px-5 py-2.5 font-semibold text-brand hover:bg-brand-soft/70 transition-colors"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

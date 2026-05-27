import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useConnectionStatus } from '../socket/useLiveMessages';
import ConnectionStatus from './ConnectionStatus';
import InstallPrompt from './InstallPrompt';
import MobileTabBar from './MobileTabBar';
import Wordmark from './Wordmark';

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/broadcast', label: 'Broadcast', end: false },
] as const;

export default function AppShell() {
  const { user, logout } = useAuth();
  const connectionStatus = useConnectionStatus();

  return (
    <div className="min-h-screen flex flex-col bg-white text-ink">
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5 flex items-center gap-6">
          <Link to="/" aria-label="Nimbus home" className="-mx-2 px-2 py-1">
            <Wordmark />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  isActive
                    ? 'text-ink font-semibold'
                    : 'text-body hover:text-ink transition-colors'
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <InstallPrompt />
            <ConnectionStatus status={connectionStatus} />
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
      <main className="flex-1 flex flex-col pb-20 md:pb-0">
        <Outlet />
      </main>
      <MobileTabBar />
    </div>
  );
}

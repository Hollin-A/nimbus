import { Home, Megaphone } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/broadcast', label: 'Broadcast', icon: Megaphone, end: false },
] as const;

/**
 * Bottom tab bar shown only on mobile. The PWA installs to the home screen
 * and runs in standalone mode — a bottom bar makes the experience read as a
 * real app rather than a responsive website. `env(safe-area-inset-bottom)`
 * keeps the bar above iOS's home-indicator gesture area.
 */
export default function MobileTabBar() {
  return (
    <nav
      aria-label="Primary"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-border"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-2">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-2.5 text-xs font-semibold transition-colors ${
                  isActive ? 'text-brand' : 'text-muted hover:text-ink'
                }`
              }
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

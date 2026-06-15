import { Home, Megaphone, type LucideIcon } from 'lucide-react';

export interface PrimaryRoute {
  to: string;
  label: string;
  /** Match the path exactly (NavLink `end`) — true for the index route. */
  end: boolean;
  /** Only surfaced to admins. */
  adminOnly: boolean;
  icon: LucideIcon;
}

// Single source of truth for the app's primary navigation. Both the desktop
// header nav (AppShell) and the mobile tab bar (MobileTabBar) render from this,
// so a new destination is added in exactly one place.
export const PRIMARY_ROUTES: PrimaryRoute[] = [
  { to: '/', label: 'Home', end: true, adminOnly: false, icon: Home },
  {
    to: '/broadcast',
    label: 'Broadcast',
    end: false,
    adminOnly: true,
    icon: Megaphone,
  },
];

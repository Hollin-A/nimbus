import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MobileTabBar from '../components/MobileTabBar';

// Broadcasting is admin-only, so the tab is role-gated. Default the mock
// to an admin (the tab shows); the role test flips it to a viewer.
const { mockRole } = vi.hoisted(() => ({
  mockRole: { current: 'admin' as 'admin' | 'user' },
}));
vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: '1', username: 'u', displayName: 'U', role: mockRole.current },
    token: 't',
    status: 'authed' as const,
    sessionExpired: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}));

beforeEach(() => {
  mockRole.current = 'admin';
});

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MobileTabBar />
    </MemoryRouter>,
  );
}

describe('MobileTabBar', () => {
  it('renders Home and Broadcast tab links', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /broadcast/i }),
    ).toBeInTheDocument();
  });

  it('marks Home as active on /', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: /home/i })).toHaveClass(
      'text-brand',
    );
    expect(screen.getByRole('link', { name: /broadcast/i })).not.toHaveClass(
      'text-brand',
    );
  });

  it('marks Broadcast as active on /broadcast', () => {
    renderAt('/broadcast');
    expect(screen.getByRole('link', { name: /broadcast/i })).toHaveClass(
      'text-brand',
    );
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveClass(
      'text-brand',
    );
  });

  it('exposes an aria-label so screen readers identify it as primary nav', () => {
    renderAt('/');
    expect(
      screen.getByRole('navigation', { name: /primary/i }),
    ).toBeInTheDocument();
  });

  it('hides the entire tab bar for a non-admin (Broadcast is the only gated tab; Home alone needs no bar)', () => {
    mockRole.current = 'user';
    renderAt('/');
    expect(screen.queryByRole('navigation', { name: /primary/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /broadcast/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /home/i })).not.toBeInTheDocument();
  });
});

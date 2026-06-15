import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppShell from '../components/AppShell';

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
vi.mock('../socket/useLiveMessages', () => ({
  useConnectionStatus: () => 'connected',
}));

function renderShell() {
  return render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
  );
}

describe('AppShell nav role gating', () => {
  beforeEach(() => {
    mockRole.current = 'admin';
  });

  it('shows the Broadcast link for an admin', () => {
    renderShell();
    expect(screen.queryAllByRole('link', { name: /broadcast/i }).length).toBeGreaterThan(0);
  });

  it('shows no Broadcast link for a non-admin (desktop nav + mobile bar both gated)', () => {
    mockRole.current = 'user';
    renderShell();
    expect(screen.getByRole('link', { name: /nimbus home/i })).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /broadcast/i })).toHaveLength(0);
  });

  it('labels the desktop nav for landmark parity with the mobile tab bar', () => {
    renderShell();
    // Both the desktop header nav and the mobile tab bar are named landmarks,
    // so screen-reader landmark enumeration isn't left with an unnamed <nav>.
    expect(
      screen.getAllByRole('navigation', { name: 'Primary' }),
    ).toHaveLength(2);
  });
});

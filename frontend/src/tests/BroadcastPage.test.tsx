import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BroadcastPage from '../pages/BroadcastPage';

// Broadcasting is admin-only: a non-admin who navigates to /broadcast is
// redirected home (the server's requireRole is the real boundary; this is
// the UX guard).
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

// Keep ApiError real; the page never fetches on mount, so the stubs are
// just guards against accidental network.
vi.mock('../api/client', async (importActual) => {
  const actual = await importActual<typeof import('../api/client')>();
  return { ...actual, pushMessage: vi.fn(), searchCities: vi.fn() };
});

function renderBroadcast() {
  return render(
    <MemoryRouter initialEntries={['/broadcast']}>
      <Routes>
        <Route path="/" element={<div>home page</div>} />
        <Route path="/broadcast" element={<BroadcastPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BroadcastPage role guard', () => {
  beforeEach(() => {
    mockRole.current = 'admin';
  });

  it('renders the broadcast form for an admin', () => {
    renderBroadcast();
    expect(screen.getByText(/send an alert to a city/i)).toBeInTheDocument();
  });

  it('redirects a non-admin (viewer) to home', () => {
    mockRole.current = 'user';
    renderBroadcast();
    expect(screen.getByText('home page')).toBeInTheDocument();
    expect(screen.queryByText(/send an alert to a city/i)).not.toBeInTheDocument();
  });
});

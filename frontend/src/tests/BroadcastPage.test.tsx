import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import BroadcastPage from '../pages/BroadcastPage';
import { ApiError } from '../api/client';

// Broadcasting is admin-only: a non-admin who navigates to /broadcast is
// redirected home (the server's requireRole is the real boundary; this is
// the UX guard).
const { mockRole, mockPushMessage } = vi.hoisted(() => ({
  mockRole: { current: 'admin' as 'admin' | 'user' },
  mockPushMessage: vi.fn(),
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

// Keep ApiError real; stub the network call so submit tests can drive it.
vi.mock('../api/client', async (importActual) => {
  const actual = await importActual<typeof import('../api/client')>();
  return { ...actual, pushMessage: mockPushMessage, searchCities: vi.fn() };
});

// Stub CitySearch to a one-click picker so the submit tests don't depend on
// its debounced-search machinery (covered by its own tests).
const TEST_CITY = { name: 'Lisbon', country: 'PT', latitude: 38.72, longitude: -9.13 };
vi.mock('../components/CitySearch', () => ({
  default: ({ onSelect }: { onSelect: (c: typeof TEST_CITY) => void }) => (
    <button type="button" onClick={() => onSelect(TEST_CITY)}>
      pick test city
    </button>
  ),
}));

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

// Bring the form to a submittable state: pick the city, type a message.
async function fillBroadcast(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /pick test city/i }));
  await user.type(screen.getByLabelText('Message'), 'Flood warning — avoid low roads.');
}

describe('BroadcastPage role guard', () => {
  beforeEach(() => {
    mockRole.current = 'admin';
    mockPushMessage.mockReset();
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

describe('BroadcastPage submit robustness', () => {
  beforeEach(() => {
    mockRole.current = 'admin';
    mockPushMessage.mockReset();
  });

  it('locks the form inputs while a broadcast is in flight', async () => {
    let resolveSend: () => void = () => {};
    mockPushMessage.mockImplementation(
      () => new Promise<void>((resolve) => (resolveSend = resolve)),
    );
    const user = userEvent.setup();
    renderBroadcast();
    await fillBroadcast(user);

    await user.click(screen.getByRole('button', { name: /send broadcast/i }));

    // The message field (and its siblings) must lock so the operator can't
    // change the payload out from under the in-flight request.
    expect(screen.getByLabelText('Message')).toBeDisabled();

    await act(async () => {
      resolveSend();
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Message')).not.toBeDisabled(),
    );
  });

  it('shows a friendly rate-limit message on a 429', async () => {
    mockPushMessage.mockImplementation(() =>
      Promise.reject(new ApiError('Too many requests', 429)),
    );
    const user = userEvent.setup();
    renderBroadcast();
    await fillBroadcast(user);

    await user.click(screen.getByRole('button', { name: /send broadcast/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/sending broadcasts too quickly/i);
  });
});

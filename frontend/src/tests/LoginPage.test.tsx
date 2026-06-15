import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import { ApiError } from '../api/client';

const { mockLogin, authState } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  authState: { status: 'anon' as 'anon' | 'authed' },
}));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    status: authState.status,
    sessionExpired: false,
    login: mockLogin,
    logout: vi.fn(),
  }),
}));

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  );
}

// Renders the login route alongside markers for the destinations, with an
// optional location.state — to observe where an already-authed user lands.
function renderLoginWithRoutes(state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>home page</div>} />
        <Route path="/broadcast" element={<div>broadcast page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    authState.status = 'anon';
    mockLogin.mockReset();
  });

  it('redirects an authed user to location.state.from (the page they were bounced from)', () => {
    authState.status = 'authed';
    renderLoginWithRoutes({ from: { pathname: '/broadcast' } });
    expect(screen.getByText('broadcast page')).toBeInTheDocument();
  });

  it('redirects an authed user to home when there is no saved location', () => {
    authState.status = 'authed';
    renderLoginWithRoutes();
    expect(screen.getByText('home page')).toBeInTheDocument();
  });

  it('renders the username field, password field, and Sign-in button', () => {
    renderLogin();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it('shows the demo credentials hint for both roles', () => {
    renderLogin();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('admin123')).toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
    expect(screen.getByText('viewer123')).toBeInTheDocument();
  });

  it('links to register and password reset', () => {
    renderLogin();
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/reset',
    );
  });

  it('calls login with the trimmed username and raw password', async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), '  demo  ');
    await user.type(screen.getByLabelText('Password'), 'demo123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockLogin).toHaveBeenCalledOnce();
    expect(mockLogin).toHaveBeenCalledWith('demo', 'demo123');
  });

  it('validates empty fields client-side without calling login', async () => {
    const user = userEvent.setup();
    renderLogin();

    // Submit with both fields empty.
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /please fill in both fields/i,
    );
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('does not call login when only the username is filled', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'demo');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /please fill in both fields/i,
    );
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('shows "Invalid username or password." on a 401', async () => {
    mockLogin.mockRejectedValue(new ApiError('Invalid credentials', 401));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'demo');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/invalid username or password/i);
  });

  it('shows "Please fill in both fields." on a 400', async () => {
    mockLogin.mockRejectedValue(new ApiError('Invalid request body', 400));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'demo');
    await user.type(screen.getByLabelText('Password'), 'demo');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/please fill in both fields/i);
  });

  it('shows "Could not reach the server." on a non-ApiError rejection', async () => {
    mockLogin.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'demo');
    await user.type(screen.getByLabelText('Password'), 'demo123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not reach the server/i);
  });

  it('disables the submit button and shows "Signing in…" while pending', async () => {
    let resolveLogin: () => void = () => {};
    mockLogin.mockImplementation(
      () => new Promise<void>((resolve) => (resolveLogin = resolve)),
    );
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'demo');
    await user.type(screen.getByLabelText('Password'), 'demo123');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const pendingButton = screen.getByRole('button', { name: /signing in/i });
    expect(pendingButton).toBeDisabled();

    // Resolve and wait for the post-resolution state update so React isn't
    // mid-render when the test ends (avoids the act() warning).
    await act(async () => {
      resolveLogin();
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /sign in/i }),
      ).not.toBeDisabled(),
    );
  });
});

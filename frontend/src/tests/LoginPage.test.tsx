import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import LoginPage from '../pages/LoginPage';
import { ApiError } from '../api/client';

const { mockLogin } = vi.hoisted(() => ({ mockLogin: vi.fn() }));

vi.mock('../auth/useAuth', () => ({
  useAuth: () => ({
    user: null,
    token: null,
    status: 'anon' as const,
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

describe('LoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset();
  });

  it('renders the username field, password field, and Sign-in button', () => {
    renderLogin();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it('shows the demo credentials hint', () => {
    renderLogin();
    expect(screen.getByText(/try the demo/i)).toBeInTheDocument();
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.getByText('demo123')).toBeInTheDocument();
  });

  it('calls login with the trimmed username and raw password', async () => {
    mockLogin.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), '  demo  ');
    await user.type(screen.getByLabelText(/password/i), 'demo123');
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
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/invalid username or password/i);
  });

  it('shows "Please fill in both fields." on a 400', async () => {
    mockLogin.mockRejectedValue(new ApiError('Invalid request body', 400));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'demo');
    await user.type(screen.getByLabelText(/password/i), 'demo');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/please fill in both fields/i);
  });

  it('shows "Could not reach the server." on a non-ApiError rejection', async () => {
    mockLogin.mockRejectedValue(new Error('network down'));
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText(/username/i), 'demo');
    await user.type(screen.getByLabelText(/password/i), 'demo123');
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
    await user.type(screen.getByLabelText(/password/i), 'demo123');
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

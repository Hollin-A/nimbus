import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '../auth/AuthContext';
import { useAuth } from '../auth/useAuth';

const { mockLogin, mockGetMe, mockLogout, mockRefresh, captured } = vi.hoisted(() => ({
  mockLogin: vi.fn(),
  mockGetMe: vi.fn(),
  mockLogout: vi.fn(),
  mockRefresh: vi.fn(),
  captured: { handler: null as null | (() => Promise<string>) },
}));

vi.mock('../api/client', () => ({
  login: mockLogin,
  getMe: mockGetMe,
  logout: mockLogout,
  refreshTokens: mockRefresh,
  setRefreshHandler: (fn: (() => Promise<string>) | null) => {
    captured.handler = fn;
  },
}));

vi.mock('../components/Splash', () => ({ default: () => <div>loading</div> }));

const ADMIN = { id: '1', username: 'admin', displayName: 'Admin' };
const SESSION = { accessToken: 'access-1', refreshToken: 'refresh-1', user: ADMIN };

function Consumer() {
  const { status, token, user, sessionExpired, login, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="token">{token ?? 'none'}</span>
      <span data-testid="user">{user?.username ?? 'none'}</span>
      <span data-testid="expired">{String(sessionExpired)}</span>
      <button onClick={() => void login('admin', 'admin123')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>,
  );
}

async function loginThrough() {
  const user = userEvent.setup();
  renderAuth();
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anon'));
  await user.click(screen.getByRole('button', { name: 'login' }));
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authed'));
  return user;
}

describe('AuthProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    captured.handler = null;
    mockLogin.mockReset();
    mockGetMe.mockReset();
    mockLogout.mockReset();
    mockRefresh.mockReset();
  });
  afterEach(() => localStorage.clear());

  it('starts anonymous with no saved token', async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anon'));
  });

  it('login stores both tokens and exposes the access token', async () => {
    mockLogin.mockResolvedValue(SESSION);
    await loginThrough();

    expect(screen.getByTestId('token')).toHaveTextContent('access-1');
    expect(screen.getByTestId('user')).toHaveTextContent('admin');
    expect(localStorage.getItem('nimbus.token')).toBe('access-1');
    expect(localStorage.getItem('nimbus.refresh')).toBe('refresh-1');
  });

  it('logout revokes the refresh token and clears the session', async () => {
    mockLogin.mockResolvedValue(SESSION);
    mockLogout.mockResolvedValue({ ok: true });
    const user = await loginThrough();

    await user.click(screen.getByRole('button', { name: 'logout' }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anon'));
    expect(mockLogout).toHaveBeenCalledWith('refresh-1');
    expect(localStorage.getItem('nimbus.token')).toBeNull();
    expect(localStorage.getItem('nimbus.refresh')).toBeNull();
  });

  it('the refresh handler exchanges the refresh token and updates the access token', async () => {
    mockLogin.mockResolvedValue(SESSION);
    mockRefresh.mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      user: ADMIN,
    });
    await loginThrough();

    let newToken: string | undefined;
    await act(async () => {
      newToken = await captured.handler?.();
    });

    expect(newToken).toBe('access-2');
    expect(mockRefresh).toHaveBeenCalledWith('refresh-1');
    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('access-2'));
    expect(localStorage.getItem('nimbus.refresh')).toBe('refresh-2');
  });

  it('a failed refresh clears the session and flags sessionExpired', async () => {
    mockLogin.mockResolvedValue(SESSION);
    mockRefresh.mockRejectedValue(new Error('refresh dead'));
    await loginThrough();

    await act(async () => {
      await captured.handler?.().catch(() => {});
    });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anon'));
    expect(screen.getByTestId('expired')).toHaveTextContent('true');
  });

  it('rehydrates an existing session from localStorage', async () => {
    localStorage.setItem('nimbus.token', 'saved-access');
    localStorage.setItem('nimbus.refresh', 'saved-refresh');
    mockGetMe.mockResolvedValue({ user: ADMIN });

    renderAuth();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authed'));
    expect(mockGetMe).toHaveBeenCalledWith('saved-access');
    expect(screen.getByTestId('user')).toHaveTextContent('admin');
  });
});

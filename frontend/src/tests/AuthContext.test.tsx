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
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

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

  // --- Cross-tab sync via the `storage` event ----------------------------
  // The browser fires a `storage` event in *other* tabs when localStorage
  // changes. We use it to keep tabs consistent: log out everywhere when one
  // tab logs out, and adopt a rotated token pair so a refresh in one tab
  // doesn't leave the others holding a now-revoked refresh token.

  it('logs out when another tab clears the token (no redundant server revoke)', async () => {
    mockLogin.mockResolvedValue(SESSION);
    await loginThrough();

    // Another tab removed the token, which arrives here as a storage event
    // with a null newValue.
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'nimbus.token',
          oldValue: 'access-1',
          newValue: null,
        }),
      );
    });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anon'));
    // The other tab already revoked server-side — we must not call it again.
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('adopts a token pair rotated by another tab so the next refresh uses it', async () => {
    mockLogin.mockResolvedValue(SESSION);
    mockRefresh.mockResolvedValue({
      accessToken: 'access-10',
      refreshToken: 'refresh-10',
      user: ADMIN,
    });
    await loginThrough();

    // Another tab refreshed: it wrote a fresh pair to localStorage, which
    // fires a storage event here.
    localStorage.setItem('nimbus.token', 'access-9');
    localStorage.setItem('nimbus.refresh', 'refresh-9');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'nimbus.token',
          oldValue: 'access-1',
          newValue: 'access-9',
        }),
      );
    });

    // The visible access token updates and we stay authed.
    await waitFor(() => expect(screen.getByTestId('token')).toHaveTextContent('access-9'));
    expect(screen.getByTestId('status')).toHaveTextContent('authed');

    // Crucially, a later refresh uses the *synced* refresh token, not the
    // stale one — otherwise reuse-detection would log every tab out.
    await act(async () => {
      await captured.handler?.();
    });
    expect(mockRefresh).toHaveBeenCalledWith('refresh-9');
  });

  it('does not adopt a session when another tab logs in (logout-only sync)', async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('anon'));

    // A login in another tab writes a token, but we deliberately do not
    // mirror a fresh sign-in across tabs.
    localStorage.setItem('nimbus.token', 'access-x');
    localStorage.setItem('nimbus.refresh', 'refresh-x');
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'nimbus.token',
          oldValue: null,
          newValue: 'access-x',
        }),
      );
    });

    expect(screen.getByTestId('status')).toHaveTextContent('anon');
    expect(screen.getByTestId('token')).toHaveTextContent('none');
  });

  // --- Periodic /me ping -------------------------------------------------
  // While authed, poll /me on an interval so a session that has gone dead
  // server-side surfaces on its own (and a refreshable access token is
  // renewed) instead of waiting for the user's next action.

  it('pings /me on a repeating interval while authed', async () => {
    vi.useFakeTimers();
    localStorage.setItem('nimbus.token', 'saved-access');
    localStorage.setItem('nimbus.refresh', 'saved-refresh');
    mockGetMe.mockResolvedValue({ user: ADMIN });

    renderAuth();

    // Flush the rehydrate promise chain (no timers involved) → authed, with
    // one getMe from the rehydrate itself.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByTestId('status')).toHaveTextContent('authed');
    expect(mockGetMe).toHaveBeenCalledTimes(1);

    // Each interval fires one more ping.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(mockGetMe).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(mockGetMe).toHaveBeenCalledTimes(3);
  });

  it('stops pinging /me once the session ends', async () => {
    vi.useFakeTimers();
    localStorage.setItem('nimbus.token', 'saved-access');
    localStorage.setItem('nimbus.refresh', 'saved-refresh');
    mockGetMe.mockResolvedValue({ user: ADMIN });

    renderAuth();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // rehydrate (1) + one interval (2)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    });
    expect(mockGetMe).toHaveBeenCalledTimes(2);

    // End the session (another tab logged out → status flips to anon). The
    // interval effect should tear down and stop polling.
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'nimbus.token',
          oldValue: 'saved-access',
          newValue: null,
        }),
      );
    });
    expect(screen.getByTestId('status')).toHaveTextContent('anon');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(mockGetMe).toHaveBeenCalledTimes(2); // no further pings
  });
});

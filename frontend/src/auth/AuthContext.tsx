import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PublicUser } from '../types';
import {
  getMe,
  login as apiLogin,
  logout as apiLogout,
  refreshTokens,
  setRefreshHandler,
} from '../api/client';
import Splash from '../components/Splash';
import { AuthContext, type AuthContextValue, type AuthStatus } from './context';

const ACCESS_TOKEN_KEY = 'nimbus.token';
const REFRESH_TOKEN_KEY = 'nimbus.refresh';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null); // access token
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [sessionExpired, setSessionExpired] = useState(false);

  // The refresh handler is registered once but must always read the
  // *latest* refresh token, so it lives in a ref rather than the closure.
  const refreshTokenRef = useRef<string | null>(null);

  function persistTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    refreshTokenRef.current = refreshToken;
    setToken(accessToken);
  }

  function clearSession(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    refreshTokenRef.current = null;
    setToken(null);
    setUser(null);
    setStatus('anon');
  }

  // Register the transparent-refresh handler before anything makes an
  // authenticated request (including the rehydrate below). The handler
  // exchanges the stored refresh token for a fresh pair and returns the
  // new access token; if that fails the session is dead — tear it down
  // and flag it so the login screen can explain.
  useEffect(() => {
    setRefreshHandler(async () => {
      const rt = refreshTokenRef.current;
      if (!rt) throw new Error('no refresh token');
      try {
        const result = await refreshTokens(rt);
        persistTokens(result.accessToken, result.refreshToken);
        setUser(result.user);
        return result.accessToken;
      } catch (err) {
        clearSession();
        setSessionExpired(true);
        throw err;
      }
    });
    return () => setRefreshHandler(null);
  }, []);

  // Restore the session on mount. getMe goes through the client, so an
  // expired-but-refreshable access token is recovered transparently.
  useEffect(() => {
    const savedAccess = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!savedAccess) {
      setStatus('anon');
      return;
    }
    refreshTokenRef.current = localStorage.getItem(REFRESH_TOKEN_KEY);
    let cancelled = false;
    (async () => {
      try {
        const { user } = await getMe(savedAccess);
        if (cancelled) return;
        setUser(user);
        setToken(localStorage.getItem(ACCESS_TOKEN_KEY));
        setStatus('authed');
      } catch {
        if (cancelled) return;
        clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(username: string, password: string): Promise<void> {
    const result = await apiLogin(username, password);
    persistTokens(result.accessToken, result.refreshToken);
    setUser(result.user);
    setStatus('authed');
    setSessionExpired(false);
  }

  function logout(): void {
    // Revoke server-side, but don't block the UI on it — log out locally
    // regardless of whether the request lands.
    const rt = refreshTokenRef.current;
    if (rt) void apiLogout(rt).catch(() => {});
    clearSession();
  }

  const value: AuthContextValue = { user, token, status, sessionExpired, login, logout };

  return (
    <AuthContext.Provider value={value}>
      {status === 'loading' ? <Splash /> : children}
    </AuthContext.Provider>
  );
}

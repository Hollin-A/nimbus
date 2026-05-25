import { useEffect, useState, type ReactNode } from 'react';
import type { PublicUser } from '../types';
import { getMe, login as apiLogin } from '../api/client';
import Splash from '../components/Splash';
import { AuthContext, type AuthContextValue, type AuthStatus } from './context';

const TOKEN_KEY = 'nimbus.token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Restore session on mount if a token is in localStorage.
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (!saved) {
      setStatus('anon');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { user } = await getMe(saved);
        if (cancelled) return;
        setUser(user);
        setToken(saved);
        setStatus('authed');
      } catch {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        setStatus('anon');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function login(username: string, password: string): Promise<void> {
    const result = await apiLogin(username, password);
    localStorage.setItem(TOKEN_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
    setStatus('authed');
  }

  function logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setStatus('anon');
  }

  const value: AuthContextValue = { user, token, status, login, logout };

  return (
    <AuthContext.Provider value={value}>
      {status === 'loading' ? <Splash /> : children}
    </AuthContext.Provider>
  );
}

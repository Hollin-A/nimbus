import { createContext } from 'react';
import type { PublicUser } from '../types';

export type AuthStatus = 'loading' | 'authed' | 'anon';

export interface AuthContextValue {
  user: PublicUser | null;
  /** The current access token (sent as the Bearer credential). */
  token: string | null;
  status: AuthStatus;
  /** True after a refresh failed and the session was torn down, so the
   *  login screen can explain why the user is back there. Cleared on a
   *  successful login. */
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

import { createContext } from 'react';
import type { PublicUser } from '../types';

export type AuthStatus = 'loading' | 'authed' | 'anon';

export interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  status: AuthStatus;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

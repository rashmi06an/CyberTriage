import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  clearAllAuthData,
  currentSession,
  login as doLogin,
  logout as doLogout,
  markTourDone,
  signup as doSignup,
  tourDone,
} from './auth';
import type { SessionUser } from './auth';

interface AuthContextValue {
  user: SessionUser | null;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string, confirm: string, displayName?: string) => Promise<void>;
  logout: () => void;
  resetAuth: () => void;
  showTour: boolean;
  finishTour: () => void;
  startTour: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => currentSession());
  const [showTour, setShowTour] = useState(false);

  const login = useCallback(async (username: string, password: string) => {
    const session = await doLogin(username, password);
    setUser(session);
    if (!tourDone(session.username)) setShowTour(true);
  }, []);

  const signup = useCallback(
    async (username: string, password: string, confirm: string, displayName?: string) => {
      const session = await doSignup(username, password, confirm, displayName);
      setUser(session);
      setShowTour(true); // brand-new accounts always get the guided tour
    },
    []
  );

  const logout = useCallback(() => {
    doLogout();
    setShowTour(false);
    setUser(null);
  }, []);

  const resetAuth = useCallback(() => {
    clearAllAuthData();
    setShowTour(false);
    setUser(null);
  }, []);

  const finishTour = useCallback(() => {
    setShowTour(false);
    if (user) markTourDone(user.username);
  }, [user]);

  const startTour = useCallback(() => setShowTour(true), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, login, signup, logout, resetAuth, showTour, finishTour, startTour }),
    [user, login, signup, logout, resetAuth, showTour, finishTour, startTour]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  clearAllAuthData,
  currentSession,
  login as doLogin,
  logout as doLogout,
  markTourDone,
  updateProfile as doUpdateProfile,
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
  updateProfile: (updates: { displayName?: string; avatar?: string | null }) => void;
  isFirstVisit: boolean;
  showTour: boolean;
  finishTour: () => void;
  startTour: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => currentSession());
  const [showTour, setShowTour] = useState(false);
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  const login = useCallback(async (username: string, password: string) => {
    const session = await doLogin(username, password);
    setUser(session);
    setIsFirstVisit(false); // returning user
    if (!tourDone(session.username)) setShowTour(true);
  }, []);

  const signup = useCallback(
    async (username: string, password: string, confirm: string, displayName?: string) => {
      const session = await doSignup(username, password, confirm, displayName);
      setUser(session);
      setIsFirstVisit(true); // brand-new account
      setShowTour(true); // brand-new accounts always get the guided tour
    },
    []
  );

  const logout = useCallback(() => {
    doLogout();
    setShowTour(false);
    setIsFirstVisit(false);
    setUser(null);
  }, []);

  const resetAuth = useCallback(() => {
    clearAllAuthData();
    setShowTour(false);
    setIsFirstVisit(false);
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    (updates: { displayName?: string; avatar?: string | null }) => {
      if (!user) return;
      const updated = doUpdateProfile(user.username, updates);
      if (updated) setUser(updated);
    },
    [user]
  );

  const finishTour = useCallback(() => {
    setShowTour(false);
    if (user) markTourDone(user.username);
  }, [user]);

  const startTour = useCallback(() => setShowTour(true), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, login, signup, logout, resetAuth, updateProfile, isFirstVisit, showTour, finishTour, startTour }),
    [user, login, signup, logout, resetAuth, updateProfile, isFirstVisit, showTour, finishTour, startTour]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

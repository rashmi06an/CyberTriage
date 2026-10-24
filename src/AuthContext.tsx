import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  clearAllAuthData,
  clearLegacyUsers,
  clearSession,
  currentSession,
  markTourDone,
  setSession,
  takeLegacyUsers,
  tourDone,
} from './auth';
import { AuthError } from './auth';
import type { SessionUser } from './auth';
import { hasBridge, importLegacyUsers, loginUser, signupUser, updateUserProfile } from './api';

interface UserDTO {
  username: string;
  display_name: string;
  avatar?: string | null;
}

function toSession(dto: UserDTO): SessionUser {
  return { username: dto.username, displayName: dto.display_name, avatar: dto.avatar ?? undefined };
}

interface AuthContextValue {
  user: SessionUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  signup: (username: string, password: string, confirm: string, displayName?: string) => Promise<void>;
  logout: () => void;
  resetAuth: () => void;
  updateProfile: (updates: { displayName?: string; avatar?: string | null }) => Promise<void>;
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
  const [ready, setReady] = useState(false);

  // One-time migration of any accounts older builds kept in localStorage → SQLite.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const legacy = takeLegacyUsers();
        if (legacy && legacy.length && hasBridge()) {
          await importLegacyUsers(legacy);
        }
        if (legacy) clearLegacyUsers();
      } catch {
        /* migration is best-effort */
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const session = toSession(await loginUser(username, password));
    setSession(session);
    setUser(session);
    setIsFirstVisit(false);
    if (!tourDone(session.username)) setShowTour(true);
  }, []);

  const signup = useCallback(
    async (username: string, password: string, confirm: string, displayName?: string) => {
      if (password !== confirm) throw new AuthError('Passwords do not match.');
      const session = toSession(await signupUser(username, password, displayName));
      setSession(session);
      setUser(session);
      setIsFirstVisit(true);
      setShowTour(true);
    },
    []
  );

  const logout = useCallback(() => {
    clearSession();
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
    async (updates: { displayName?: string; avatar?: string | null }) => {
      if (!user) return;
      const session = toSession(await updateUserProfile(user.username, updates));
      setSession(session);
      setUser(session);
    },
    [user]
  );

  const finishTour = useCallback(() => {
    setShowTour(false);
    if (user) markTourDone(user.username);
  }, [user]);

  const startTour = useCallback(() => setShowTour(true), []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, ready, login, signup, logout, resetAuth, updateProfile, isFirstVisit, showTour, finishTour, startTour }),
    [user, ready, login, signup, logout, resetAuth, updateProfile, isFirstVisit, showTour, finishTour, startTour]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

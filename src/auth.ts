/**
 * Client-side session handling for the CyberTriage desktop app.
 *
 * User ACCOUNTS now live in the SQLite database (the Python engine validates and
 * stores salted SHA-256 password hashes — see `signup`/`login` engine actions).
 * This file only keeps client-side bits: the active session pointer and the
 * first-run tour flags in localStorage, plus the in-memory "active owner" used to
 * scope every engine query. (Keeping the session on the client and the accounts in
 * the database is exactly how a normal app is structured.)
 *
 * `USERS_KEY` is read ONCE for a one-time migration of accounts created by older
 * builds that stored them in localStorage; after migration it is removed.
 */

const SESSION_KEY = 'ct_session_v1';
const TOUR_PREFIX = 'ct_tour_done_';
const LEGACY_USERS_KEY = 'ct_users_v1';

export interface SessionUser {
  username: string;
  displayName: string;
  avatar?: string;
}

export class AuthError extends Error {}

/**
 * The owner used to scope every engine query, kept in memory so it is correct the
 * instant a user logs in — never relying on a (possibly racy or blocked)
 * localStorage read. Falls back to the persisted session on cold start.
 */
let activeOwner: string | null = null;

export function setActiveOwner(username: string | null) {
  activeOwner = username;
}

export function getActiveOwner(): string {
  if (activeOwner) return activeOwner;
  return currentSession()?.username ?? '';
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode / blocked) — best-effort */
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function currentSession(): SessionUser | null {
  const raw = safeGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    return parsed?.username ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist the signed-in user and set the active owner. */
export function setSession(user: SessionUser) {
  safeSet(SESSION_KEY, JSON.stringify(user));
  setActiveOwner(user.username);
}

/** Log out: forget the session pointer. Accounts stay in the database. */
export function clearSession() {
  safeRemove(SESSION_KEY);
  setActiveOwner(null);
}

export function tourDone(username: string): boolean {
  return safeGet(`${TOUR_PREFIX}${username.toLowerCase()}`) === '1';
}

export function markTourDone(username: string) {
  safeSet(`${TOUR_PREFIX}${username.toLowerCase()}`, '1');
}

/** One-time migration: accounts older builds stored in localStorage. Null if none. */
export function takeLegacyUsers(): Array<Record<string, unknown>> | null {
  const raw = safeGet(LEGACY_USERS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearLegacyUsers() {
  safeRemove(LEGACY_USERS_KEY);
}

/** Forget the session and all onboarding flags (the engine clears accounts from the DB). */
export function clearAllAuthData() {
  setActiveOwner(null);
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key === SESSION_KEY || key === LEGACY_USERS_KEY || key.startsWith(TOUR_PREFIX))) {
        toRemove.push(key);
      }
    }
    toRemove.forEach(safeRemove);
  } catch {
    /* ignore */
  }
}

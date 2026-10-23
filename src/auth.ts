/**
 * Local, offline authentication for the CyberTriage desktop app.
 *
 * Accounts live in localStorage (which Electron persists in the app's userData
 * partition across launches). Passwords are never stored in clear text — we keep
 * a per-user random salt and the SHA-256 hash of `salt:password`. This is a
 * student prototype, not a production identity provider.
 */

const USERS_KEY = 'ct_users_v1';
const SESSION_KEY = 'ct_session_v1';
const TOUR_PREFIX = 'ct_tour_done_';

export interface StoredUser {
  username: string;
  displayName: string;
  salt: string;
  hash: string;
  createdAt: string;
  avatar?: string; // small base64 data URL
}

export interface SessionUser {
  username: string;
  displayName: string;
  avatar?: string;
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

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
  const s = currentSession();
  return s?.username ?? '';
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
    /* storage unavailable (private mode / blocked) — auth is best-effort */
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function loadUsers(): StoredUser[] {
  const raw = safeGet(USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]) {
  safeSet(USERS_KEY, JSON.stringify(users));
}

function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(salt: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hasAccounts(): boolean {
  return loadUsers().length > 0;
}

export function currentSession(): SessionUser | null {
  const raw = safeGet(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.username) return null;
    // Ensure the account still exists (e.g. after a reset) and use the freshest profile data.
    const users = loadUsers();
    const stored = users.find((u) => u.username.toLowerCase() === parsed.username.toLowerCase());
    if (!stored) return null;
    return { username: stored.username, displayName: stored.displayName, avatar: stored.avatar };
  } catch {
    return null;
  }
}

export async function signup(
  rawUsername: string,
  password: string,
  confirm: string,
  displayName?: string,
  avatar?: string
): Promise<SessionUser> {
  const username = rawUsername.trim();
  if (!username) throw new AuthError('Choose a username.');
  if (!USERNAME_RE.test(username)) {
    throw new AuthError('Username must be 3–24 characters: letters, numbers, dot, dash or underscore.');
  }
  if (!password) throw new AuthError('Choose a password.');
  if (password.length < 6) throw new AuthError('Password must be at least 6 characters.');
  if (password !== confirm) throw new AuthError('Passwords do not match.');

  const users = loadUsers();
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    throw new AuthError('That username already exists on this machine. Pick a different one so each account keeps its own cases.');
  }

  const salt = randomHex();
  const hash = await hashPassword(salt, password);
  const user: StoredUser = {
    username,
    displayName: (displayName || username).trim().slice(0, 40),
    salt,
    hash,
    createdAt: new Date().toISOString(),
    avatar: avatar || undefined,
  };
  users.push(user);
  saveUsers(users);

  const session: SessionUser = { username: user.username, displayName: user.displayName, avatar: user.avatar };
  safeSet(SESSION_KEY, JSON.stringify(session));
  setActiveOwner(session.username);
  return session;
}

export async function login(rawUsername: string, password: string): Promise<SessionUser> {
  const username = rawUsername.trim();
  if (!username || !password) throw new AuthError('Enter your username and password.');

  const users = loadUsers();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) throw new AuthError('No account found with that username.');

  const hash = await hashPassword(user.salt, password);
  if (hash !== user.hash) throw new AuthError('Incorrect password.');

  const session: SessionUser = { username: user.username, displayName: user.displayName, avatar: user.avatar };
  safeSet(SESSION_KEY, JSON.stringify(session));
  setActiveOwner(session.username);
  return session;
}

/** Check whether a username is already registered (case-insensitive). */
export function usernameExists(rawUsername: string): boolean {
  const username = rawUsername.trim().toLowerCase();
  if (!username) return false;
  return loadUsers().some((u) => u.username.toLowerCase() === username);
}

/** Update the signed-in user's profile (display name and/or picture). Returns the updated session. */
export function updateProfile(
  username: string,
  updates: { displayName?: string; avatar?: string | null }
): SessionUser | null {
  const users = loadUsers();
  const user = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return null;
  if (updates.displayName !== undefined) {
    const name = updates.displayName.trim().slice(0, 40);
    user.displayName = name || user.username;
  }
  if (updates.avatar !== undefined) {
    user.avatar = updates.avatar || undefined;
  }
  saveUsers(users);
  const session: SessionUser = { username: user.username, displayName: user.displayName, avatar: user.avatar };
  safeSet(SESSION_KEY, JSON.stringify(session));
  setActiveOwner(session.username);
  return session;
}

export function logout() {
  safeRemove(SESSION_KEY);
  setActiveOwner(null);
}

export function tourDone(username: string): boolean {
  return safeGet(`${TOUR_PREFIX}${username.toLowerCase()}`) === '1';
}

export function markTourDone(username: string) {
  safeSet(`${TOUR_PREFIX}${username.toLowerCase()}`, '1');
}

/** Wipe every local account, the active session and all onboarding flags. */
export function clearAllAuthData() {
  setActiveOwner(null);
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key === USERS_KEY || key === SESSION_KEY || key.startsWith(TOUR_PREFIX))) {
        toRemove.push(key);
      }
    }
    toRemove.forEach(safeRemove);
  } catch {
    /* ignore */
  }
}

import type { User } from "./api";

const KEY = "mini-sentry-session";

export type StoredSession = { token: string; user: User };

export function getStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function setStoredSession(session: StoredSession): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable (private mode, quota) — session just won't persist across reloads
  }
}

export function clearStoredSession(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}

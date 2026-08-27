"use client";

import { useCallback, useEffect, useState } from "react";
import { logout as apiLogout, me as apiMe, type User } from "@/lib/api";
import {
  clearStoredSession,
  getStoredSession,
  setStoredSession,
  type StoredSession,
} from "@/lib/session-storage";

type Status = "loading" | "authenticated" | "unauthenticated";

export function useSession() {
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) {
      setStatus("unauthenticated");
      return;
    }
    // Re-validate — the 30-day token may have expired since the last visit.
    apiMe(stored.token)
      .then(({ user }) => {
        const fresh = { token: stored.token, user };
        setStoredSession(fresh);
        setSession(fresh);
        setStatus("authenticated");
      })
      .catch(() => {
        clearStoredSession();
        setSession(null);
        setStatus("unauthenticated");
      });
  }, []);

  const login = useCallback((token: string, user: User) => {
    const next = { token, user };
    setStoredSession(next);
    setSession(next);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    if (session) {
      try {
        await apiLogout(session.token);
      } catch {
        // best-effort — the backend's own logout is idempotent, so a network
        // failure here just means the server-side session outlives the client one
      }
    }
    clearStoredSession();
    setSession(null);
    setStatus("unauthenticated");
  }, [session]);

  return {
    status,
    user: session?.user ?? null,
    token: session?.token ?? null,
    login,
    logout,
  };
}

import { randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { SESSION_TTL_MS } from "./constants";
import { prisma } from "./db";
import { sha256Hex } from "./hash";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  // Snapshotted at session-lookup time (Phase 14) — SUPERADMIN promotion is
  // re-checked on every login (see auth/login/route.ts), but a role change
  // to an already-issued session token only takes effect on the next login,
  // not live mid-session. See DECISIONS.md for the trade-off.
  role: Role;
}

export interface CreatedSession {
  token: string;
  expiresAt: Date;
}

/** Creates a session row and returns the raw token — only ever returned once, never stored raw. */
export async function createSession(userId: string): Promise<CreatedSession> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { userId, tokenHash: sha256Hex(token), expiresAt },
  });

  return { token, expiresAt };
}

/** Resolves a bearer session token to its user, or null if unknown/expired. */
export async function findUserBySessionToken(rawToken: string): Promise<AuthenticatedUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256Hex(rawToken) },
    select: { expiresAt: true, user: { select: { id: true, name: true, email: true, role: true } } },
  });

  if (!session || session.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return session.user;
}

/** Idempotent: deleting an already-gone/unknown token is not an error. */
export async function deleteSessionByToken(rawToken: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: sha256Hex(rawToken) } });
}

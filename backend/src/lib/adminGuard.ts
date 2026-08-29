import type { Role } from "@prisma/client";
import { requireSessionUser } from "./authGuard";
import { prisma } from "./db";
import { ERRORS } from "./errors";
import type { AuthenticatedUser } from "./session";

function getSuperAdminEmails(): string[] {
  return (process.env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Promotion-only bootstrap: if `email` is in the SUPERADMIN_EMAILS allowlist
 * and the account isn't already SUPERADMIN, promotes it. Re-checked on every
 * login/register (see auth routes) rather than once — but never demotes:
 * removing an email from the allowlist doesn't revoke an already-granted
 * role, since that should be a deliberate future admin action, not an env
 * var side effect. See DECISIONS.md.
 */
export async function syncSuperAdminRole(userId: string, email: string, currentRole: Role): Promise<Role> {
  if (currentRole === "SUPERADMIN") {
    return currentRole;
  }
  if (!getSuperAdminEmails().includes(email.toLowerCase())) {
    return currentRole;
  }
  await prisma.user.update({ where: { id: userId }, data: { role: "SUPERADMIN" } });
  return "SUPERADMIN";
}

/**
 * Resolves the authenticated user and requires SUPERADMIN, or throws the
 * appropriate ApiError — same try/catch-in-the-route pattern as
 * requireSessionUser. No extra DB query needed: AuthenticatedUser's role is
 * already fetched fresh from the session lookup itself.
 */
export async function requireSuperAdmin(request: Request): Promise<AuthenticatedUser> {
  const user = await requireSessionUser(request);
  if (user.role !== "SUPERADMIN") {
    throw ERRORS.FORBIDDEN();
  }
  return user;
}

import { randomBytes } from "node:crypto";
import type { InvitationStatus, TeamRole } from "@prisma/client";
import { INVITATION_TTL_MS } from "./constants";
import { prisma } from "./db";
import { sha256Hex } from "./hash";

export interface SafeInvitation {
  id: string;
  teamId: string;
  invitedEmail: string;
  invitedRole: TeamRole;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

const SAFE_INVITATION_SELECT = {
  id: true,
  teamId: true,
  invitedEmail: true,
  invitedRole: true,
  status: true,
  expiresAt: true,
  createdAt: true,
} as const;

interface GeneratedInvitationToken {
  rawToken: string;
  tokenHash: string;
}

/** Same shape as generateApiKey() — high-entropy random value, unsalted sha256 for storage. */
function generateInvitationToken(): GeneratedInvitationToken {
  const rawToken = randomBytes(24).toString("hex");
  return { rawToken, tokenHash: sha256Hex(rawToken) };
}

export type CreateInvitationResult =
  | { status: "created"; invitation: SafeInvitation; token: string; teamName: string; inviterName: string }
  | { status: "forbidden" }
  | { status: "already_pending" };

/**
 * Assumes the caller's team membership was already verified by the route
 * (findAccessibleTeam) — this only enforces the LEAD requirement on top of
 * that. Rejects a duplicate pending invite for the same team+email
 * (app-level uniqueness, see schema.prisma's Invitation model comment).
 * Does not send the email itself — returns teamName/inviterName so the
 * route can do that as a best-effort side effect after this commits (same
 * "best-effort side effects caught at the call site" pattern as
 * notify.ts/notifyIfNeeded).
 */
export async function createInvitation(
  teamId: string,
  invitedByUserId: string,
  invitedEmail: string,
  invitedRole: TeamRole,
): Promise<CreateInvitationResult> {
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: invitedByUserId } },
    select: { role: true },
  });
  if (membership?.role !== "LEAD") {
    return { status: "forbidden" };
  }

  const existingPending = await prisma.invitation.findFirst({
    where: { teamId, invitedEmail, status: "PENDING" },
    select: { id: true },
  });
  if (existingPending) {
    return { status: "already_pending" };
  }

  const { rawToken, tokenHash } = generateInvitationToken();
  const [invitation, team, inviter] = await Promise.all([
    prisma.invitation.create({
      data: {
        teamId,
        invitedEmail,
        invitedRole,
        tokenHash,
        invitedById: invitedByUserId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      select: SAFE_INVITATION_SELECT,
    }),
    prisma.team.findUniqueOrThrow({ where: { id: teamId }, select: { name: true } }),
    prisma.user.findUniqueOrThrow({ where: { id: invitedByUserId }, select: { name: true } }),
  ]);

  return { status: "created", invitation, token: rawToken, teamName: team.name, inviterName: inviter.name };
}

export async function listPendingInvitationsForTeam(teamId: string): Promise<SafeInvitation[]> {
  return prisma.invitation.findMany({
    where: { teamId, status: "PENDING" },
    select: SAFE_INVITATION_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export async function listPendingInvitationsForUser(email: string): Promise<SafeInvitation[]> {
  return prisma.invitation.findMany({
    where: { invitedEmail: email, status: "PENDING", expiresAt: { gt: new Date() } },
    select: SAFE_INVITATION_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/** LEAD-only (assumed pre-verified by the route). IDOR-safe count-checked updateMany, same pattern as lib/project.ts. */
export async function revokeInvitation(teamId: string, invitationId: string): Promise<boolean> {
  const { count } = await prisma.invitation.updateMany({
    where: { id: invitationId, teamId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  return count > 0;
}

export type AcceptInvitationResult =
  | { status: "accepted"; teamId: string }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "email_mismatch" };

/**
 * A revoked/accepted token behaves identically to one that never existed
 * ("not_found") — reusing/guessing an old token can't reveal it was ever
 * valid. A lazily-discovered expiry ("expired") is distinguished only
 * because the token did exist; the response is still a 404 either way (see
 * lib/errors.ts). Joining an already-invited team is idempotent: it marks
 * the invitation ACCEPTED without creating a duplicate membership row.
 */
export async function acceptInvitation(rawToken: string, userId: string, userEmail: string): Promise<AcceptInvitationResult> {
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: sha256Hex(rawToken) } });
  if (!invitation || invitation.status !== "PENDING") {
    return { status: "not_found" };
  }

  if (invitation.expiresAt.getTime() <= Date.now()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "EXPIRED" } });
    return { status: "expired" };
  }

  if (invitation.invitedEmail.toLowerCase() !== userEmail.toLowerCase()) {
    return { status: "email_mismatch" };
  }

  await prisma.$transaction(async (tx) => {
    const existingMembership = await tx.teamMember.findUnique({
      where: { teamId_userId: { teamId: invitation.teamId, userId } },
    });
    if (!existingMembership) {
      await tx.teamMember.create({ data: { teamId: invitation.teamId, userId, role: invitation.invitedRole } });
    }
    await tx.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } });
  });

  return { status: "accepted", teamId: invitation.teamId };
}

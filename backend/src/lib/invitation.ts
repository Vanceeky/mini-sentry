import { randomBytes } from "node:crypto";
import type { InvitationStatus } from "@prisma/client";
import { INVITATION_TTL_MS } from "./constants";
import { prisma } from "./db";
import { findOwnedProject } from "./project";
import { sha256Hex } from "./hash";

export interface SafeInvitation {
  id: string;
  projectId: string;
  invitedEmail: string;
  status: InvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

const SAFE_INVITATION_SELECT = {
  id: true,
  projectId: true,
  invitedEmail: true,
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
  | { status: "created"; invitation: SafeInvitation; token: string; projectName: string; inviterName: string }
  | { status: "forbidden" }
  | { status: "already_pending" };

/**
 * Owner-only (verified here via findOwnedProject, reusing the same
 * owner-scoped lookup every other project mutation uses). Rejects a
 * duplicate pending invite for the same project+email (app-level
 * uniqueness, see schema.prisma's Invitation model comment). Does not send
 * the email itself — returns projectName/inviterName so the route can do
 * that as a best-effort side effect after this commits.
 */
export async function createInvitation(
  projectId: string,
  invitedByUserId: string,
  invitedEmail: string,
): Promise<CreateInvitationResult> {
  const project = await findOwnedProject(invitedByUserId, projectId);
  if (!project) {
    return { status: "forbidden" };
  }

  const existingPending = await prisma.invitation.findFirst({
    where: { projectId, invitedEmail, status: "PENDING" },
    select: { id: true },
  });
  if (existingPending) {
    return { status: "already_pending" };
  }

  const { rawToken, tokenHash } = generateInvitationToken();
  const [invitation, inviter] = await Promise.all([
    prisma.invitation.create({
      data: {
        projectId,
        invitedEmail,
        tokenHash,
        invitedById: invitedByUserId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
      select: SAFE_INVITATION_SELECT,
    }),
    prisma.user.findUniqueOrThrow({ where: { id: invitedByUserId }, select: { name: true } }),
  ]);

  return { status: "created", invitation, token: rawToken, projectName: project.name, inviterName: inviter.name };
}

export async function listPendingInvitationsForProject(projectId: string): Promise<SafeInvitation[]> {
  return prisma.invitation.findMany({
    where: { projectId, status: "PENDING" },
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

/** Owner-only (assumed pre-verified by the route). IDOR-safe count-checked updateMany, same pattern as lib/project.ts. */
export async function revokeInvitation(projectId: string, invitationId: string): Promise<boolean> {
  const { count } = await prisma.invitation.updateMany({
    where: { id: invitationId, projectId, status: "PENDING" },
    data: { status: "REVOKED" },
  });
  return count > 0;
}

export type PreviewInvitationResult =
  | { status: "ok"; projectName: string; invitedEmail: string }
  | { status: "not_found" }
  | { status: "expired" };

/**
 * PUBLIC, no-auth — used to preview an invite before an account exists, so
 * a frontend can show "you're invited to X" ahead of registration. Same
 * not-found/expired collapsing as acceptInvitation's lookup below. Never
 * reveals anything beyond project name + invited email, both already
 * implied by possessing the raw token.
 */
export async function previewInvitation(rawToken: string): Promise<PreviewInvitationResult> {
  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: sha256Hex(rawToken) },
    select: { status: true, expiresAt: true, invitedEmail: true, project: { select: { name: true } } },
  });
  if (!invitation || invitation.status !== "PENDING") {
    return { status: "not_found" };
  }
  if (invitation.expiresAt.getTime() <= Date.now()) {
    return { status: "expired" };
  }
  return { status: "ok", projectName: invitation.project.name, invitedEmail: invitation.invitedEmail };
}

export type AcceptInvitationResult =
  | { status: "accepted"; projectId: string }
  | { status: "not_found" }
  | { status: "expired" }
  | { status: "email_mismatch" };

/**
 * A revoked/accepted token behaves identically to one that never existed
 * ("not_found") — reusing/guessing an old token can't reveal it was ever
 * valid. A lazily-discovered expiry ("expired") is distinguished only
 * because the token did exist; the response is still a 404 either way (see
 * lib/errors.ts). Joining an already-invited project is idempotent: it
 * marks the invitation ACCEPTED without creating a duplicate membership row.
 * Called both from POST /invitations/accept (already-authenticated caller)
 * and from POST /auth/register (a brand-new user, right after their
 * account row commits) — identical logic either way.
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
    const project = await tx.project.findUnique({ where: { id: invitation.projectId }, select: { ownerId: true } });
    // The owner already has full access and deliberately never gets a
    // ProjectMember row (see schema.prisma) — skip creating one even if
    // they somehow end up redeeming their own project's invite token.
    if (project?.ownerId !== userId) {
      const existingMembership = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: invitation.projectId, userId } },
      });
      if (!existingMembership) {
        await tx.projectMember.create({ data: { projectId: invitation.projectId, userId } });
      }
    }
    await tx.invitation.update({ where: { id: invitation.id }, data: { status: "ACCEPTED" } });
  });

  return { status: "accepted", projectId: invitation.projectId };
}

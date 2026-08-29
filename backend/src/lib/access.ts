import type { TeamRole } from "@prisma/client";
import { prisma } from "./db";
import type { SafeProject } from "./project";

const ACCESSIBLE_PROJECT_SELECT = {
  id: true,
  name: true,
  apiKeyLastFour: true,
  teamId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AccessibleProject = SafeProject & { teamId: string | null };

/**
 * A user can access a project's error data if they're its direct owner OR a
 * member of its team (any TeamRole) — scoped entirely in the query, same
 * IDOR-safe pattern as lib/project.ts's findOwnedProject: a project owned by
 * someone else, on a team the caller isn't in, is indistinguishable from one
 * that doesn't exist at all.
 *
 * This is the access gate for read/error-data routes only (errors, events,
 * stats, error-group assignment) — project identity/lifecycle mutations
 * (rename, delete, rotate key, attach/detach team) stay owner-only via
 * findOwnedProject, unchanged. See DECISIONS.md.
 */
export async function resolveProjectAccess(userId: string, projectId: string): Promise<AccessibleProject | null> {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ ownerId: userId }, { team: { members: { some: { userId } } } }],
    },
    select: ACCESSIBLE_PROJECT_SELECT,
  });
}

/** A user's TeamRole on a given team, or null if they aren't a member. */
export async function findTeamMembership(teamId: string, userId: string): Promise<{ role: TeamRole } | null> {
  return prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    select: { role: true },
  });
}

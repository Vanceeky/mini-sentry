import { prisma } from "./db";
import type { SafeProject } from "./project";

const ACCESSIBLE_PROJECT_SELECT = {
  id: true,
  name: true,
  apiKeyLastFour: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type AccessibleProject = SafeProject & { ownerId: string | null };

/**
 * A user can access a project's error data if they're its direct owner OR a
 * ProjectMember — scoped entirely in the query, same IDOR-safe pattern as
 * lib/project.ts's findOwnedProject: a project owned by someone else, that
 * the caller isn't a member of, is indistinguishable from one that doesn't
 * exist at all.
 *
 * This is the access gate for read/error-data routes only (errors, events,
 * stats, error-group assignment/status) — project identity/lifecycle
 * mutations (rename, delete, rotate key, invite/remove members) stay
 * owner-only via findOwnedProject, unchanged. See DECISIONS.md.
 */
export async function resolveProjectAccess(userId: string, projectId: string): Promise<AccessibleProject | null> {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
    select: ACCESSIBLE_PROJECT_SELECT,
  });
}

/**
 * Whether userId is a plain ProjectMember of projectId — false for the
 * owner, who deliberately has no ProjectMember row of their own (check
 * project.ownerId separately, e.g. via resolveProjectAccess's return value).
 */
export async function findProjectMembership(projectId: string, userId: string): Promise<{ userId: string } | null> {
  return prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { userId: true },
  });
}

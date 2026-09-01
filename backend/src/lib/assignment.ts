import type { ErrorGroupStatus } from "@prisma/client";
import { findProjectMembership, resolveProjectAccess } from "./access";
import { prisma } from "./db";
import type { AuthenticatedUser } from "./session";

export type AssignErrorGroupResult =
  | { status: "assigned"; group: { id: string; message: string; assigneeId: string | null } }
  | { status: "project_not_found" }
  | { status: "insufficient_role" }
  | { status: "not_a_project_member" }
  | { status: "group_not_found" };

/**
 * Enforces: the project owner may assign any accessible member (or
 * unassign); a non-owner member may only assign/unassign themselves
 * (insufficient_role otherwise); the target, if not null, must be the
 * owner or an existing ProjectMember (not_a_project_member otherwise) —
 * the owner-as-target case is special-cased since the owner deliberately
 * has no ProjectMember row (see schema.prisma).
 */
export async function assignErrorGroup(
  actingUser: AuthenticatedUser,
  projectId: string,
  groupId: string,
  assigneeId: string | null,
): Promise<AssignErrorGroupResult> {
  const project = await resolveProjectAccess(actingUser.id, projectId);
  if (!project) return { status: "project_not_found" };

  const isOwner = project.ownerId === actingUser.id;

  if (!isOwner && assigneeId !== null && assigneeId !== actingUser.id) {
    return { status: "insufficient_role" };
  }

  if (assigneeId !== null && assigneeId !== project.ownerId) {
    const targetMembership = await findProjectMembership(projectId, assigneeId);
    if (!targetMembership) return { status: "not_a_project_member" };
  }

  const { count } = await prisma.errorGroup.updateMany({ where: { id: groupId, projectId }, data: { assigneeId } });
  if (count === 0) return { status: "group_not_found" };

  const group = await prisma.errorGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: { id: true, message: true, assigneeId: true },
  });
  return { status: "assigned", group };
}

export interface ErrorGroupSummary {
  id: string;
  message: string;
  assigneeId: string | null;
  status: ErrorGroupStatus;
}

/** Scoped by projectId — used to build a consistent PATCH response after one or both of assignment/status update. */
export async function getErrorGroupSummary(projectId: string, groupId: string): Promise<ErrorGroupSummary | null> {
  return prisma.errorGroup.findFirst({
    where: { id: groupId, projectId },
    select: { id: true, message: true, assigneeId: true, status: true },
  });
}

export type UpdateErrorGroupStatusResult = "updated" | "project_not_found" | "group_not_found";

/**
 * Any accessible project member or the owner may set an error group's
 * status — deliberately more open than assignment, no ownership check
 * beyond resolveProjectAccess itself succeeding. See DECISIONS.md.
 */
export async function updateErrorGroupStatus(
  actingUser: AuthenticatedUser,
  projectId: string,
  groupId: string,
  status: ErrorGroupStatus,
): Promise<UpdateErrorGroupStatusResult> {
  const project = await resolveProjectAccess(actingUser.id, projectId);
  if (!project) return "project_not_found";

  const { count } = await prisma.errorGroup.updateMany({ where: { id: groupId, projectId }, data: { status } });
  return count > 0 ? "updated" : "group_not_found";
}

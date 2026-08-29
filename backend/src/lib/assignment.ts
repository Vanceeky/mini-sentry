import { findTeamMembership, resolveProjectAccess } from "./access";
import { prisma } from "./db";
import type { AuthenticatedUser } from "./session";

export type AssignErrorGroupResult =
  | { status: "assigned"; group: { id: string; message: string; assigneeId: string | null } }
  | { status: "project_not_found" }
  | { status: "project_not_on_team" }
  | { status: "insufficient_role" }
  | { status: "not_a_team_member" }
  | { status: "group_not_found" };

/**
 * Enforces: assignment only makes sense on a team-owned project
 * (PROJECT_NOT_ON_TEAM otherwise); a LEAD may assign any team member (or
 * unassign); a MEMBER may only assign/unassign themselves
 * (INSUFFICIENT_ROLE otherwise); the target, if not null, must actually be a
 * member of the project's team (NOT_A_TEAM_MEMBER otherwise).
 */
export async function assignErrorGroup(
  actingUser: AuthenticatedUser,
  projectId: string,
  groupId: string,
  assigneeId: string | null,
): Promise<AssignErrorGroupResult> {
  const project = await resolveProjectAccess(actingUser.id, projectId);
  if (!project) return { status: "project_not_found" };
  if (!project.teamId) return { status: "project_not_on_team" };

  const actingMembership = await findTeamMembership(project.teamId, actingUser.id);
  if (!actingMembership) return { status: "project_not_found" };

  if (actingMembership.role !== "LEAD" && assigneeId !== null && assigneeId !== actingUser.id) {
    return { status: "insufficient_role" };
  }

  if (assigneeId !== null) {
    const targetMembership = await findTeamMembership(project.teamId, assigneeId);
    if (!targetMembership) return { status: "not_a_team_member" };
  }

  const { count } = await prisma.errorGroup.updateMany({ where: { id: groupId, projectId }, data: { assigneeId } });
  if (count === 0) return { status: "group_not_found" };

  const group = await prisma.errorGroup.findUniqueOrThrow({
    where: { id: groupId },
    select: { id: true, message: true, assigneeId: true },
  });
  return { status: "assigned", group };
}

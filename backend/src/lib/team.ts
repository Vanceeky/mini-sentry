import type { TeamRole } from "@prisma/client";
import { prisma } from "./db";
import { findOwnedProject } from "./project";

export interface SafeTeam {
  id: string;
  name: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SAFE_TEAM_SELECT = {
  id: true,
  name: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface TeamMemberSummary {
  userId: string;
  name: string;
  email: string;
  role: TeamRole;
  createdAt: Date;
}

/** Creates a team and its creator's first LEAD membership in one transaction. */
export async function createTeam(userId: string, name: string): Promise<SafeTeam> {
  return prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: { name, createdById: userId },
      select: SAFE_TEAM_SELECT,
    });
    await tx.teamMember.create({ data: { teamId: team.id, userId, role: "LEAD" } });
    return team;
  });
}

export async function listTeamsForUser(userId: string): Promise<SafeTeam[]> {
  return prisma.team.findMany({
    where: { members: { some: { userId } } },
    select: SAFE_TEAM_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * IDOR-safe: a team that exists but the caller isn't a member of is
 * indistinguishable from a nonexistent one, same pattern as findOwnedProject.
 */
export async function findAccessibleTeam(userId: string, teamId: string): Promise<SafeTeam | null> {
  return prisma.team.findFirst({
    where: { id: teamId, members: { some: { userId } } },
    select: SAFE_TEAM_SELECT,
  });
}

/** LEAD-only: the role condition is baked into the same query as the IDOR check. */
export async function renameTeam(userId: string, teamId: string, name: string): Promise<SafeTeam | null> {
  const { count } = await prisma.team.updateMany({
    where: { id: teamId, members: { some: { userId, role: "LEAD" } } },
    data: { name },
  });
  if (count === 0) return null;
  return findAccessibleTeam(userId, teamId);
}

/** LEAD-only. Projects attached to this team are detached (onDelete: SetNull), never deleted. */
export async function deleteTeam(userId: string, teamId: string): Promise<boolean> {
  const { count } = await prisma.team.deleteMany({
    where: { id: teamId, members: { some: { userId, role: "LEAD" } } },
  });
  return count > 0;
}

export async function listTeamMembers(teamId: string): Promise<TeamMemberSummary[]> {
  const members = await prisma.teamMember.findMany({
    where: { teamId },
    select: { userId: true, role: true, createdAt: true, user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members.map((m) => ({ userId: m.userId, role: m.role, createdAt: m.createdAt, name: m.user.name, email: m.user.email }));
}

/** Internal helper — team membership is created via invitation acceptance, never a standalone "add member" endpoint. */
export async function addMember(teamId: string, userId: string, role: TeamRole): Promise<void> {
  await prisma.teamMember.create({ data: { teamId, userId, role } });
}

async function countRemainingLeads(teamId: string, excludingUserId: string): Promise<number> {
  return prisma.teamMember.count({ where: { teamId, role: "LEAD", userId: { not: excludingUserId } } });
}

/**
 * Self-leave is always permitted (subject to the last-LEAD guard below);
 * removing someone else requires the acting user to be a LEAD.
 */
export async function removeMember(actingUserId: string, teamId: string, targetUserId: string): Promise<"removed" | "not_found" | "forbidden" | "last_lead"> {
  if (actingUserId !== targetUserId) {
    const actingMembership = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: actingUserId } },
      select: { role: true },
    });
    if (actingMembership?.role !== "LEAD") {
      return "forbidden";
    }
  }

  const target = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) return "not_found";

  if (target.role === "LEAD" && (await countRemainingLeads(teamId, targetUserId)) === 0) {
    return "last_lead";
  }

  await prisma.teamMember.delete({ where: { teamId_userId: { teamId, userId: targetUserId } } });
  return "removed";
}

/** LEAD-only, guarded against demoting the last remaining LEAD to zero LEADs. */
export async function updateMemberRole(
  actingUserId: string,
  teamId: string,
  targetUserId: string,
  role: TeamRole,
): Promise<"updated" | "not_found" | "forbidden" | "last_lead"> {
  const actingMembership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: actingUserId } },
    select: { role: true },
  });
  if (actingMembership?.role !== "LEAD") {
    return "forbidden";
  }

  const target = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) return "not_found";

  if (target.role === "LEAD" && role === "MEMBER" && (await countRemainingLeads(teamId, targetUserId)) === 0) {
    return "last_lead";
  }

  await prisma.teamMember.update({ where: { teamId_userId: { teamId, userId: targetUserId } }, data: { role } });
  return "updated";
}

/**
 * Owner-only (bakes ownerId into the query via findOwnedProject, same as
 * every other lib/project.ts mutator) — a project's owner decides whether to
 * share it with a team, not the team itself. Also requires the owner to
 * already be a member of the target team.
 */
export async function attachProjectToTeam(ownerId: string, projectId: string, teamId: string): Promise<"attached" | "project_not_found" | "not_a_team_member"> {
  const project = await findOwnedProject(ownerId, projectId);
  if (!project) return "project_not_found";

  const membership = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId, userId: ownerId } } });
  if (!membership) return "not_a_team_member";

  await prisma.project.update({ where: { id: projectId }, data: { teamId } });
  return "attached";
}

export async function detachProjectFromTeam(ownerId: string, projectId: string): Promise<boolean> {
  const { count } = await prisma.project.updateMany({ where: { id: projectId, ownerId }, data: { teamId: null } });
  return count > 0;
}

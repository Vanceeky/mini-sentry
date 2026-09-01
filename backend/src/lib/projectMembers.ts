import { prisma } from "./db";

export interface ProjectMemberSummary {
  userId: string;
  name: string;
  email: string;
  createdAt: Date;
  isOwner: boolean;
}

/**
 * The owner row is synthesized from Project.owner — the owner deliberately
 * has no ProjectMember row of their own (see schema.prisma) — followed by
 * ProjectMember rows, oldest first.
 */
export async function listProjectMembers(projectId: string): Promise<ProjectMemberSummary[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      createdAt: true,
      owner: { select: { id: true, name: true, email: true } },
      members: {
        select: { userId: true, createdAt: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!project) return [];

  const ownerRow: ProjectMemberSummary[] = project.owner
    ? [{ userId: project.owner.id, name: project.owner.name, email: project.owner.email, createdAt: project.createdAt, isOwner: true }]
    : [];

  const memberRows: ProjectMemberSummary[] = project.members.map((m) => ({
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    createdAt: m.createdAt,
    isOwner: false,
  }));

  return [...ownerRow, ...memberRows];
}

/** Internal — membership is created only via invitation acceptance/registration, never a standalone "add member" endpoint. */
export async function addProjectMember(projectId: string, userId: string): Promise<void> {
  await prisma.projectMember.create({ data: { projectId, userId } });
}

/**
 * Owner removes anyone; anyone removes themselves (self-leave). Removing
 * the owner is rejected outright — there's no "last lead" concept to guard
 * since ownership is singular and fixed, unlike the old team LEAD role.
 */
export async function removeProjectMember(
  actingUserId: string,
  projectId: string,
  targetUserId: string,
): Promise<"removed" | "not_found" | "forbidden" | "cannot_remove_owner"> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) return "not_found";

  if (targetUserId === project.ownerId) {
    return "cannot_remove_owner";
  }

  if (actingUserId !== targetUserId && actingUserId !== project.ownerId) {
    return "forbidden";
  }

  const { count } = await prisma.projectMember.deleteMany({ where: { projectId, userId: targetUserId } });
  return count > 0 ? "removed" : "not_found";
}

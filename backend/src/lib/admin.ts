import type { Role } from "@prisma/client";
import { prisma } from "./db";
import type { Pagination } from "./errorQuery";

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: Date;
}

export interface AdminTeamSummary {
  id: string;
  name: string;
  createdAt: Date;
  createdBy: { id: string; name: string; email: string } | null;
  memberCount: number;
  projectCount: number;
}

interface PageQuery {
  page: number;
  limit: number;
}

/** Superadmin-only: every registered user, newest first. */
export async function listAllUsers(query: PageQuery): Promise<{ data: AdminUserSummary[]; pagination: Pagination }> {
  const [data, total] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.user.count(),
  ]);
  return { data, pagination: { page: query.page, limit: query.limit, total } };
}

/** Superadmin-only: every team in the system ("my clients"), with member/project counts. */
export async function listAllTeams(query: PageQuery): Promise<{ data: AdminTeamSummary[]; pagination: Pagination }> {
  const [teams, total] = await Promise.all([
    prisma.team.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { members: true, projects: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.team.count(),
  ]);

  const data = teams.map((team) => ({
    id: team.id,
    name: team.name,
    createdAt: team.createdAt,
    createdBy: team.createdBy,
    memberCount: team._count.members,
    projectCount: team._count.projects,
  }));

  return { data, pagination: { page: query.page, limit: query.limit, total } };
}

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

export interface AdminProjectSummary {
  id: string;
  name: string;
  createdAt: Date;
  owner: { id: string; name: string; email: string } | null;
  memberCount: number;
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

/**
 * Superadmin-only: every project in the system ("my clients"), with owner
 * info and member count — successor to Phase 14's listAllTeams now that
 * Team is gone.
 */
export async function listAllProjects(query: PageQuery): Promise<{ data: AdminProjectSummary[]; pagination: Pagination }> {
  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      select: {
        id: true,
        name: true,
        createdAt: true,
        owner: { select: { id: true, name: true, email: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.project.count(),
  ]);

  const data = projects.map((project) => ({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    owner: project.owner,
    memberCount: project._count.members,
  }));

  return { data, pagination: { page: query.page, limit: query.limit, total } };
}

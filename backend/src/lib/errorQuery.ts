import type { z } from "zod";
import { ACTIVE_GROUP_WINDOW_MS } from "./constants";
import { prisma } from "./db";
import type { listErrorGroupsQuerySchema, listEventsQuerySchema, occurrencesQuerySchema } from "./errorQuerySchema";

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

const GROUP_SUMMARY_SELECT = {
  id: true,
  message: true,
  type: true,
  endpoint: true,
  statusCode: true,
  occurrenceCount: true,
  firstSeenAt: true,
  lastSeenAt: true,
} as const;

const SORT_FIELD_MAP = {
  lastSeen: "lastSeenAt",
  firstSeen: "firstSeenAt",
  occurrences: "occurrenceCount",
} as const;

type ListErrorGroupsQuery = z.infer<typeof listErrorGroupsQuerySchema>;
type OccurrencesQuery = z.infer<typeof occurrencesQuerySchema>;
type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

export async function listErrorGroups(projectId: string, query: ListErrorGroupsQuery) {
  const where = {
    projectId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.status !== undefined ? { statusCode: query.status } : {}),
    ...(query.environment ? { environment: query.environment } : {}),
    ...(query.search ? { message: { contains: query.search, mode: "insensitive" as const } } : {}),
  };

  const [data, total] = await Promise.all([
    prisma.errorGroup.findMany({
      where,
      select: GROUP_SUMMARY_SELECT,
      orderBy: { [SORT_FIELD_MAP[query.sort]]: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.errorGroup.count({ where }),
  ]);

  return { data, pagination: { page: query.page, limit: query.limit, total } satisfies Pagination };
}

/**
 * Returns null when the group doesn't exist in this project (the caller
 * turns that into 404 PROJECT_NOT_FOUND-style — actually a distinct
 * "group not found" case, see the route). `group.stack` comes from the
 * most recent occurrence, independent of which occurrences page was
 * requested, so it always reflects "what does this error look like right
 * now" rather than whatever page happens to be on screen.
 */
export async function getErrorGroupDetail(projectId: string, groupId: string, occurrencesQuery: OccurrencesQuery) {
  const group = await prisma.errorGroup.findFirst({
    where: { id: groupId, projectId },
    select: {
      id: true,
      message: true,
      type: true,
      endpoint: true,
      statusCode: true,
      environment: true,
      firstSeenAt: true,
      lastSeenAt: true,
      occurrenceCount: true,
    },
  });
  if (!group) return null;

  const [occurrences, total, mostRecent] = await Promise.all([
    prisma.errorEvent.findMany({
      where: { groupId },
      select: { id: true, timestamp: true, browser: true, url: true, method: true, statusCode: true },
      orderBy: { createdAt: "desc" },
      skip: (occurrencesQuery.page - 1) * occurrencesQuery.limit,
      take: occurrencesQuery.limit,
    }),
    prisma.errorEvent.count({ where: { groupId } }),
    prisma.errorEvent.findFirst({
      where: { groupId },
      orderBy: { createdAt: "desc" },
      select: { stack: true, filename: true, line: true, column: true },
    }),
  ]);

  return {
    group: {
      ...group,
      stack: mostRecent?.stack ?? null,
      filename: mostRecent?.filename ?? null,
      line: mostRecent?.line ?? null,
      column: mostRecent?.column ?? null,
    },
    occurrences: {
      data: occurrences,
      pagination: { page: occurrencesQuery.page, limit: occurrencesQuery.limit, total } satisfies Pagination,
    },
  };
}

export async function listProjectEvents(projectId: string, query: ListEventsQuery) {
  const where = { projectId, ...(query.type ? { type: query.type } : {}) };

  const [data, total] = await Promise.all([
    prisma.errorEvent.findMany({
      where,
      select: {
        id: true,
        groupId: true,
        type: true,
        message: true,
        url: true,
        method: true,
        statusCode: true,
        timestamp: true,
        browser: true,
        environment: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.errorEvent.count({ where }),
  ]);

  return { data, pagination: { page: query.page, limit: query.limit, total } satisfies Pagination };
}

export interface ProjectStats {
  errors: number;
  events: number;
  lastErrorAt: Date | null;
  activeGroups: number;
}

/** "Active" = at least one occurrence within ACTIVE_GROUP_WINDOW_MS — see constants.ts/DECISIONS.md. */
export async function getProjectStats(projectId: string): Promise<ProjectStats> {
  const activeSince = new Date(Date.now() - ACTIVE_GROUP_WINDOW_MS);

  const [errors, events, activeGroups, lastError] = await Promise.all([
    prisma.errorGroup.count({ where: { projectId } }),
    prisma.errorEvent.count({ where: { projectId } }),
    prisma.errorGroup.count({ where: { projectId, lastSeenAt: { gte: activeSince } } }),
    prisma.errorGroup.aggregate({ where: { projectId }, _max: { lastSeenAt: true } }),
  ]);

  return { errors, events, activeGroups, lastErrorAt: lastError._max.lastSeenAt };
}

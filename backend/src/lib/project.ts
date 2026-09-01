import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { sha256Hex } from "./hash";

export interface SafeProject {
  id: string;
  name: string;
  apiKeyLastFour: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const SAFE_PROJECT_SELECT = {
  id: true,
  name: true,
  apiKeyLastFour: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface GeneratedApiKey {
  rawKey: string;
  apiKeyHash: string;
  apiKeyLastFour: string;
}

/**
 * `mnst_` + 24 random bytes (48 hex chars) — high entropy, same shape as the
 * seeded dev key. Only the hash is ever persisted; the raw key is returned
 * to the caller exactly once (creation or rotation) and never stored.
 */
export function generateApiKey(): GeneratedApiKey {
  const rawKey = `mnst_${randomBytes(24).toString("hex")}`;
  return { rawKey, apiKeyHash: sha256Hex(rawKey), apiKeyLastFour: rawKey.slice(-4) };
}

export async function listOwnedProjects(ownerId: string): Promise<SafeProject[]> {
  return prisma.project.findMany({
    where: { ownerId },
    select: SAFE_PROJECT_SELECT,
    orderBy: { createdAt: "desc" },
  });
}

export type AccessibleProjectSummary = SafeProject & { isOwner: boolean };

/**
 * Every project the caller can access — owned, or joined as a member (see
 * ProjectMember) — each tagged isOwner. Purely additive on top of
 * listOwnedProjects: a caller with no memberships sees identical results.
 * Without this, a newly-invited member would have no way to discover which
 * project they joined after the one-time invite/register response.
 */
export async function listAccessibleProjects(userId: string): Promise<AccessibleProjectSummary[]> {
  const projects = await prisma.project.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    select: { ...SAFE_PROJECT_SELECT, ownerId: true },
    orderBy: { createdAt: "desc" },
  });
  return projects.map(({ ownerId, ...project }) => ({ ...project, isOwner: ownerId === userId }));
}

/**
 * Scoped to ownerId in the query itself (not "find then check owner in JS")
 * — a project that exists but belongs to someone else is indistinguishable
 * from one that doesn't exist at all, both here and in the 404 the caller
 * returns. Prevents IDOR: a manipulated project id never reveals whether it
 * belongs to another user.
 */
export async function findOwnedProject(ownerId: string, projectId: string): Promise<SafeProject | null> {
  return prisma.project.findFirst({
    where: { id: projectId, ownerId },
    select: SAFE_PROJECT_SELECT,
  });
}

export async function createProject(ownerId: string, name: string): Promise<SafeProject & { apiKey: string }> {
  const { rawKey, apiKeyHash, apiKeyLastFour } = generateApiKey();

  const project = await prisma.project.create({
    data: { name, ownerId, apiKeyHash, apiKeyLastFour },
    select: SAFE_PROJECT_SELECT,
  });

  return { ...project, apiKey: rawKey };
}

export async function updateProjectName(ownerId: string, projectId: string, name: string): Promise<SafeProject | null> {
  const { count } = await prisma.project.updateMany({ where: { id: projectId, ownerId }, data: { name } });
  if (count === 0) return null;
  return findOwnedProject(ownerId, projectId);
}

/** Returns whether a project (owned by ownerId) was actually deleted. */
export async function deleteOwnedProject(ownerId: string, projectId: string): Promise<boolean> {
  const { count } = await prisma.project.deleteMany({ where: { id: projectId, ownerId } });
  return count > 0;
}

/** Returns the new raw key, or null if no project with this id is owned by ownerId. */
export async function rotateApiKey(ownerId: string, projectId: string): Promise<string | null> {
  const { rawKey, apiKeyHash, apiKeyLastFour } = generateApiKey();
  const { count } = await prisma.project.updateMany({
    where: { id: projectId, ownerId },
    data: { apiKeyHash, apiKeyLastFour },
  });
  return count > 0 ? rawKey : null;
}

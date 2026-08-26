import { prisma } from "./db";
import { sha256Hex } from "./hash";

export { extractBearerToken } from "./bearer";

/**
 * API keys are high-entropy random tokens (not low-entropy passwords), so a
 * plain unsalted SHA-256 digest is sufficient — never store the raw key.
 */
export function hashApiKey(rawKey: string): string {
  return sha256Hex(rawKey);
}

export interface AuthenticatedProject {
  id: string;
  name: string;
  // Nullable — see Project.ownerId's schema comment. A project with no
  // owner (only possible for pre-Phase-10 rows) simply has no one to
  // notify; lib/notify.ts treats a null ownerId as "skip notification."
  ownerId: string | null;
}

export async function findProjectByApiKey(rawKey: string): Promise<AuthenticatedProject | null> {
  const project = await prisma.project.findUnique({
    where: { apiKeyHash: hashApiKey(rawKey) },
    select: { id: true, name: true, ownerId: true },
  });
  return project;
}

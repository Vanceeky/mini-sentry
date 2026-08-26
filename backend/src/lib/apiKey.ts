import { createHash } from "node:crypto";
import { prisma } from "./db";

/**
 * API keys are high-entropy random tokens (not low-entropy passwords), so a
 * plain unsalted SHA-256 digest is sufficient — never store the raw key.
 */
export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export interface AuthenticatedProject {
  id: string;
  name: string;
}

export async function findProjectByApiKey(rawKey: string): Promise<AuthenticatedProject | null> {
  const project = await prisma.project.findUnique({
    where: { apiKeyHash: hashApiKey(rawKey) },
    select: { id: true, name: true },
  });
  return project;
}

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

/** Extracts the raw token from an `Authorization: Bearer <token>` header, or null. */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = BEARER_PATTERN.exec(authorizationHeader.trim());
  return match ? match[1].trim() || null : null;
}

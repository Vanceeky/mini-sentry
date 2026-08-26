const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

/**
 * Extracts the raw token from an `Authorization: Bearer <token>` header, or
 * null. Shared by both project-API-key auth (events ingestion) and
 * user-session auth (Phase 9) — same header shape, different token
 * namespaces looked up by the caller.
 */
export function extractBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = BEARER_PATTERN.exec(authorizationHeader.trim());
  return match ? match[1].trim() || null : null;
}

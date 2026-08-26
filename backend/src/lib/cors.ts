function getAllowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Global env-var allowlist, not per-project — CORS preflight (OPTIONS) fires
 * before the browser sends the Authorization header, so there's no way to
 * know which project is asking during preflight, only the Origin. Deliberately
 * never reflects "*"; an unrecognized/missing origin gets no CORS headers at
 * all, which the browser treats as a block. See DECISIONS.md (Phase 7).
 */
export function resolveCorsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !getAllowedOrigins().includes(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
  };
}

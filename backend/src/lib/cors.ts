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
 *
 * `allowedMethods` must match the route's own real methods (its
 * `METHOD_NOT_ALLOWED(...)` string) — a mismatch here silently breaks real
 * browser preflight for any route whose actual method isn't in the
 * advertised list, since the browser (not this server) enforces it
 * client-side. See DECISIONS.md (Phase 13) for the bug this fixed.
 */
export function resolveCorsHeaders(origin: string | null, allowedMethods: string = "POST, OPTIONS"): Record<string, string> {
  if (!origin || !getAllowedOrigins().includes(origin)) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": allowedMethods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
  };
}

/**
 * CORS for POST /api/v1/events only — deliberately open to any origin,
 * unlike resolveCorsHeaders' allowlist above. Safe specifically because this
 * endpoint is authenticated by a project API key in the Authorization
 * header, never cookies: a page on an arbitrary origin can't forge a
 * request using a key it doesn't have, so there's no CSRF-style risk in
 * accepting any origin. This is also a functional requirement, not just a
 * relaxation — the SDK is meant to be embedded on arbitrary third-party
 * websites (the whole point of a client-side error-monitoring SDK), so a
 * fixed domain allowlist can't express "any site that installs the SDK."
 * No `Access-Control-Allow-Credentials` is sent (this API never uses
 * cookies), so a literal `*` origin is valid per the CORS spec — no need to
 * reflect the caller's origin back. See DECISIONS.md.
 */
export function resolveEventsCorsHeaders(origin: string | null, allowedMethods: string = "POST, OPTIONS"): Record<string, string> {
  if (!origin) {
    return {};
  }

  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": allowedMethods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
  };
}

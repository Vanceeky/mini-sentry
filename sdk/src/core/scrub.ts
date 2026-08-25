const FALLBACK_BASE = "http://localhost/";
const SENSITIVE_QUERY_PARAM_PATTERN = /token|secret|password|passwd|auth|key|session|jwt|credential/i;

/**
 * Redacts the values of query-string parameters whose name suggests they
 * carry a credential (token/secret/password/auth/key/session/jwt/...), so a
 * captured page or request URL never leaks something like `?api_key=...` or
 * `?session_token=...`. Only query-parameter values are touched; the rest of
 * the URL (scheme/host/path) is untouched, and a URL with nothing to redact
 * is returned exactly as given (not just an equivalent re-serialization).
 *
 * Does not scrub hash-fragment content (e.g. an OAuth implicit-flow
 * `#access_token=...`) — parsing an arbitrary fragment as a query string
 * risks corrupting a legitimate hash-based route. See DECISIONS.md.
 */
export function scrubUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;

  try {
    const base = typeof location !== "undefined" ? location.href : FALLBACK_BASE;
    const parsed = new URL(rawUrl, base);

    const keysToRedact: string[] = [];
    parsed.searchParams.forEach((_value, key) => {
      if (SENSITIVE_QUERY_PARAM_PATTERN.test(key) && !keysToRedact.includes(key)) {
        keysToRedact.push(key);
      }
    });
    if (keysToRedact.length === 0) return rawUrl;

    keysToRedact.forEach((key) => parsed.searchParams.set(key, "[Redacted]"));
    return parsed.toString();
  } catch {
    // Not a parseable URL — return as-is rather than risk mangling a string
    // we can't safely interpret.
    return rawUrl;
  }
}

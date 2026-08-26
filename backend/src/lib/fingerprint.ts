import { createHash } from "node:crypto";
import type { CapturedEventInput } from "./eventSchema";

/**
 * Groups events into an ErrorGroup. The SDK doesn't send structured stack
 * frames (just a raw string — see sdk/src/capture/normalize.ts), so this
 * can't group by "top stack frame" the way a real Sentry does; message-based
 * grouping is the simplest thing that actually works for this MVP.
 *
 * For "http" events, `message` alone is too coarse — e.g. every failed
 * request produces the generic "HTTP 500 Internal Server Error" (see
 * docs/API_EXAMPLES.md), which would merge unrelated endpoints into one
 * group. Including `request.method`+`request.url` fixes that. For
 * "error"/"unhandledrejection", `message` is already specific to the actual
 * JS error, so no extra context is needed.
 */
export function computeFingerprint(event: CapturedEventInput): string {
  const parts = [event.type, event.message];
  if (event.request) {
    parts.push(`${event.request.method} ${event.request.url}`);
  }
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

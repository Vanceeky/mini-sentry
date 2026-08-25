import type { CapturedEvent } from "../capture/types";
import { safeExec, warn } from "../core/safe";

/**
 * Captured once at module load — before capture/network.ts ever gets a
 * chance to patch window.fetch — so the SDK's own outbound requests are
 * never observed by its own fetch interceptor. Without this, a broken
 * transport endpoint would generate an "http" capture event, which would
 * itself be sent to the same broken endpoint, and so on.
 */
const rawFetch: typeof fetch | undefined =
  typeof window !== "undefined" && typeof window.fetch === "function"
    ? window.fetch.bind(window)
    : undefined;

/**
 * Fire-and-forget POST of a single captured event to the configured
 * endpoint. Never throws and never surfaces a failure to the host app — a
 * down, unreachable, or non-2xx-responding endpoint only produces a console
 * warning.
 */
export function sendEvent(endpoint: string, event: CapturedEvent): void {
  if (!rawFetch) {
    warn("no fetch available; cannot send captured event to the transport endpoint.");
    return;
  }

  safeExec(() => {
    void rawFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) {
          warn(`transport endpoint responded with HTTP ${response.status}`);
        }
      })
      .catch((error: unknown) => {
        warn("failed to send captured event to the transport endpoint", error);
      });
  }, "sendEvent() failed unexpectedly");
}

import { captureEnvironment } from "../context/environment";
import { generateId } from "../core/id";
import { safeExec, warn } from "../core/safe";
import type { CapturedEvent } from "./types";

export type NetworkCaptureHandler = (event: CapturedEvent) => void;

let installed = false;

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function resolveMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input !== "string" && !(input instanceof URL)) return input.method.toUpperCase();
  return "GET";
}

function buildEvent(message: string, request: CapturedEvent["request"]): CapturedEvent {
  return {
    id: generateId(),
    type: "http",
    message,
    timestamp: new Date().toISOString(),
    request,
    ...captureEnvironment(),
  };
}

/**
 * Wraps window.fetch to observe non-success responses (status outside
 * 200-299) and requests that fail outright (network error, CORS, etc.).
 * The original response/rejection is always returned/rethrown unchanged —
 * this only observes, it never alters fetch semantics for the host app.
 * Only method/URL/status are captured, never headers or bodies, since those
 * can carry auth tokens or other sensitive data.
 */
export function installFetchInterceptor(onCapture: NetworkCaptureHandler): void {
  if (installed) return;

  if (typeof window === "undefined" || typeof window.fetch !== "function") {
    warn("no window.fetch available; skipping network capture setup.");
    return;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    const url = resolveRequestUrl(input);
    const method = resolveMethod(input, init);

    return originalFetch(input, init).then(
      (response) => {
        if (!response.ok) {
          safeExec(() => {
            onCapture(
              buildEvent(`HTTP ${response.status} ${response.statusText}`.trim(), {
                url,
                method,
                statusCode: response.status,
              }),
            );
          }, "failed to handle a captured non-success HTTP response");
        }
        return response;
      },
      (error: unknown) => {
        safeExec(() => {
          onCapture(
            buildEvent(error instanceof Error ? error.message : "Network request failed", {
              url,
              method,
            }),
          );
        }, "failed to handle a captured network failure");
        throw error;
      },
    );
  };

  installed = true;
}

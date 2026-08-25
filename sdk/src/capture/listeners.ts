import { safeExec, warn } from "../core/safe";
import { normalizeErrorEvent, normalizeRejectionEvent } from "./normalize";
import type { CapturedEvent } from "./types";

export type CaptureHandler = (event: CapturedEvent) => void;

let installed = false;

/**
 * Uses addEventListener rather than assigning window.onerror, so it composes
 * with any handler the host app already has instead of replacing it, and
 * never suppresses the browser's own default console error logging.
 */
export function installGlobalErrorListeners(onCapture: CaptureHandler): void {
  if (installed) return;

  if (typeof window === "undefined") {
    warn("no window object available; skipping global error listener setup.");
    return;
  }

  window.addEventListener("error", (event) => {
    safeExec(() => onCapture(normalizeErrorEvent(event)), "failed to handle a captured error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    safeExec(
      () => onCapture(normalizeRejectionEvent(event)),
      "failed to handle a captured unhandled rejection",
    );
  });

  installed = true;
}

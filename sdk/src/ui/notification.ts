import type { CapturedEvent } from "../capture/types";
import { safeExec, warn } from "../core/safe";

const AUTO_DISMISS_MS = 6000;
/** Caps how many toasts can be on screen at once, so a burst of errors can't
 * flood the page with DOM nodes — the oldest is evicted first. */
const MAX_VISIBLE_TOASTS = 3;

interface ToastEntry {
  el: HTMLElement;
  timerId: ReturnType<typeof setTimeout>;
}

let list: HTMLDivElement | null = null;
const toasts: ToastEntry[] = [];

/**
 * Renders into a Shadow DOM host appended to document.body, so the demo/host
 * page's CSS can never bleed into the notification and vice versa. The host
 * itself has pointer-events: none (so it never blocks clicks anywhere on the
 * page); only individual toasts opt back into pointer-events, for their
 * dismiss button.
 */
function ensureHost(): HTMLDivElement | null {
  if (list) return list;

  if (typeof document === "undefined" || !document.body) {
    return null;
  }

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  document.body.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .list { position: fixed; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 8px; font-family: system-ui, sans-serif; }
    .toast { pointer-events: auto; display: flex; align-items: flex-start; gap: 8px; max-width: 320px; padding: 10px 14px; border-radius: 8px; background: #1f2430; color: #fff; font-size: 13px; line-height: 1.4; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25); }
    .toast button { flex: none; padding: 0; border: none; background: none; color: inherit; opacity: 0.6; font-size: 15px; line-height: 1; cursor: pointer; }
    .toast button:hover { opacity: 1; }
  `;
  shadowRoot.appendChild(style);

  list = document.createElement("div");
  list.className = "list";
  list.setAttribute("role", "status");
  list.setAttribute("aria-live", "polite");
  shadowRoot.appendChild(list);

  return list;
}

function removeToast(entry: ToastEntry): void {
  clearTimeout(entry.timerId);
  entry.el.remove();
  const index = toasts.indexOf(entry);
  if (index !== -1) toasts.splice(index, 1);
}

function labelFor(event: CapturedEvent): string {
  switch (event.type) {
    case "error":
      return `Error captured: ${event.message}`;
    case "unhandledrejection":
      return `Unhandled rejection captured: ${event.message}`;
    case "http":
      return `Network error captured: ${event.message}`;
    default:
      return event.message;
  }
}

/**
 * Shows a small, non-blocking, auto-dismissing notification for a captured
 * event. Never throws — a UI failure must not affect the host app any more
 * than a capture/transport failure would.
 */
export function showCaptureNotification(event: CapturedEvent): void {
  safeExec(() => {
    const container = ensureHost();
    if (!container) {
      warn("no document available; skipping capture notification.");
      return;
    }

    const el = document.createElement("div");
    el.className = "toast";

    const text = document.createElement("span");
    text.textContent = labelFor(event);
    el.appendChild(text);

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Dismiss notification");
    dismiss.textContent = "×";
    el.appendChild(dismiss);

    const entry: ToastEntry = { el, timerId: setTimeout(() => removeToast(entry), AUTO_DISMISS_MS) };
    dismiss.addEventListener("click", () => removeToast(entry));

    container.appendChild(el);
    toasts.push(entry);

    while (toasts.length > MAX_VISIBLE_TOASTS) {
      removeToast(toasts[0]);
    }
  }, "showCaptureNotification() failed unexpectedly");
}

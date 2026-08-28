import { getCapturedEvents, init } from "@vanceeq/canary";

const statusEl = document.querySelector<HTMLParagraphElement>("#sdk-status");
const logEl = document.querySelector<HTMLPreElement>("#capture-log");

function setStatus(text: string) {
  if (statusEl) statusEl.textContent = text;
}

function refreshCaptureLog() {
  if (!logEl) return;
  const events = getCapturedEvents();
  logEl.textContent =
    events.length === 0
      ? "No events captured yet."
      : events
          .map((e) => {
            const request = e.request ? ` (${e.request.method} ${e.request.url})` : "";
            return `[${e.type}] ${e.message}${request}`;
          })
          .join("\n");
}

// Points at a local backend (Phase 7, `npm run dev:backend`) seeded via
// `npm run db:seed -w backend` with this exact dev-only API key. If the
// backend isn't running, transport sends still fail gracefully (console
// warning only) — the host app keeps working either way.
init({
  apiKey: "mnst_dev_local_0000000000000000000000000000",
  endpoint: "http://localhost:3000/api/v1/events",
});
setStatus(
  "SDK initialized with a valid API key. Open the console for details. " +
    "(Requires the backend running locally — see docs/API_EXAMPLES.md — " +
    "otherwise transport sends fail gracefully; check the console.)",
);

// Prove that a bad configuration can never crash the host app: this call is
// intentionally invalid (empty apiKey) and must be a no-op, not a throw.
init({ apiKey: "" } as never);
console.log("Host app is still running after an invalid init() call.");

document.querySelector<HTMLButtonElement>("#trigger-error")?.addEventListener("click", () => {
  // setTimeout makes this a genuinely uncaught error (not inside the click
  // handler's own try/catch scope), the same way a real bug would surface.
  setTimeout(() => {
    throw new Error("Demo JS error triggered by the user");
  }, 0);
  setTimeout(refreshCaptureLog, 50);
});

document.querySelector<HTMLButtonElement>("#trigger-rejection")?.addEventListener("click", () => {
  Promise.reject(new Error("Demo unhandled promise rejection"));
  setTimeout(refreshCaptureLog, 50);
});

document.querySelector<HTMLButtonElement>("#trigger-http-error")?.addEventListener("click", () => {
  // POST (not GET) to a same-origin route the dev server has no handler for:
  // Vite's dev server serves index.html as an SPA fallback for unmatched GET
  // requests (200 OK), but a POST correctly comes back 404.
  fetch("/definitely-not-a-real-endpoint", { method: "POST" })
    .catch(() => {
      // Ignored here; the SDK's fetch interceptor already captured it.
    })
    .finally(() => setTimeout(refreshCaptureLog, 50));
});

document.querySelector<HTMLButtonElement>("#trigger-network-error")?.addEventListener("click", () => {
  // A host that can't resolve, so the fetch itself rejects (no response at all).
  fetch("https://this-domain-does-not-exist.invalid/")
    .catch(() => {
      // Ignored here; the SDK's fetch interceptor already captured it.
    })
    .finally(() => setTimeout(refreshCaptureLog, 50));
});

refreshCaptureLog();

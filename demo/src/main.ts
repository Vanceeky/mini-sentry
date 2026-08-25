import { getCapturedEvents, init } from "@mini-sentry/sdk";

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
      : events.map((e) => `[${e.type}] ${e.message}`).join("\n");
}

init({ apiKey: "demo_local_key" });
setStatus("SDK initialized with a valid API key. Open the console for details.");

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

refreshCaptureLog();

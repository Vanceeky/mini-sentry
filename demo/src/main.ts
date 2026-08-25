import { init } from "@mini-sentry/sdk";

const statusEl = document.querySelector<HTMLParagraphElement>("#sdk-status");
function setStatus(text: string) {
  if (statusEl) statusEl.textContent = text;
}

init({ apiKey: "demo_local_key" });
setStatus("SDK initialized with a valid API key. Open the console for details.");

// Prove that a bad configuration can never crash the host app: this call is
// intentionally invalid (empty apiKey) and must be a no-op, not a throw.
init({ apiKey: "" } as never);
console.log("Host app is still running after an invalid init() call.");

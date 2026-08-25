import { isSdkLoaded } from "@mini-sentry/sdk";

const statusEl = document.querySelector<HTMLParagraphElement>("#sdk-status");
if (statusEl) {
  statusEl.textContent = isSdkLoaded()
    ? "SDK loaded successfully from local workspace."
    : "SDK failed to load.";
}

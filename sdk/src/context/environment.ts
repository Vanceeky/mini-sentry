import type { CapturedEvent } from "../capture/types";

/**
 * Only the raw user agent string is captured — no UA parsing/guessing of
 * browser name or version, to avoid a fragile dependency for marginal value.
 */
export function captureEnvironment(): Pick<CapturedEvent, "url" | "environment" | "browser"> {
  return {
    url: typeof location !== "undefined" ? location.href : "",
    environment: "browser",
    browser: {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    },
  };
}

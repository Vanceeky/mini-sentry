import { afterEach, describe, expect, it } from "vitest";
import { captureEnvironment } from "./environment";

describe("captureEnvironment", () => {
  it("reports the environment marker, current url, and user agent", () => {
    const env = captureEnvironment();
    expect(env.environment).toBe("browser");
    expect(typeof env.url).toBe("string");
    expect(typeof env.browser.userAgent).toBe("string");
    expect(env.browser.userAgent.length).toBeGreaterThan(0);
  });

  describe("with a sensitive query param on the page URL", () => {
    const originalUrl = window.location.href;

    afterEach(() => {
      window.history.replaceState(null, "", originalUrl);
    });

    it("redacts it before capturing", () => {
      window.history.replaceState(null, "", "/?session_token=super-secret");
      expect(captureEnvironment().url).toContain("session_token=%5BRedacted%5D");
      expect(captureEnvironment().url).not.toContain("super-secret");
    });
  });
});

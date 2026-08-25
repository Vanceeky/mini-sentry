import { describe, expect, it } from "vitest";
import { captureEnvironment } from "./environment";

describe("captureEnvironment", () => {
  it("reports the environment marker, current url, and user agent", () => {
    const env = captureEnvironment();
    expect(env.environment).toBe("browser");
    expect(typeof env.url).toBe("string");
    expect(typeof env.browser.userAgent).toBe("string");
    expect(env.browser.userAgent.length).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from "vitest";
import { computeFingerprint } from "./fingerprint";
import type { CapturedEventInput } from "./eventSchema";

const baseEvent: CapturedEventInput = {
  id: "evt_1",
  type: "error",
  message: "boom",
  timestamp: "2026-01-01T00:00:00.000Z",
  environment: "browser",
  browser: { userAgent: "test-agent" },
  url: "https://example.com/",
};

describe("computeFingerprint", () => {
  it("is deterministic for identical events", () => {
    expect(computeFingerprint(baseEvent)).toBe(computeFingerprint({ ...baseEvent, id: "evt_2" }));
  });

  it("differs for different messages", () => {
    expect(computeFingerprint(baseEvent)).not.toBe(computeFingerprint({ ...baseEvent, message: "different" }));
  });

  it("differs for different types", () => {
    expect(computeFingerprint(baseEvent)).not.toBe(
      computeFingerprint({ ...baseEvent, type: "unhandledrejection" }),
    );
  });

  it("groups http events by method+url, not just message", () => {
    const a: CapturedEventInput = {
      ...baseEvent,
      type: "http",
      message: "HTTP 500 Internal Server Error",
      request: { url: "/api/users", method: "GET", statusCode: 500 },
    };
    const b: CapturedEventInput = {
      ...a,
      request: { url: "/api/orders", method: "GET", statusCode: 500 },
    };
    // Same generic message, different endpoint -> different fingerprint.
    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it("groups identical http requests together regardless of statusCode presence elsewhere", () => {
    const a: CapturedEventInput = {
      ...baseEvent,
      type: "http",
      message: "HTTP 500 Internal Server Error",
      request: { url: "/api/users", method: "GET", statusCode: 500 },
    };
    const b: CapturedEventInput = { ...a, id: "evt_other" };
    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });
});

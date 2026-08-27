import { describe, expect, it } from "vitest";
import { MESSAGE_MAX_LEN, URL_MAX_LEN } from "./constants";
import { capturedEventSchema, normalizeEvent } from "./eventSchema";

const baseErrorEvent = {
  id: "evt_1",
  type: "error" as const,
  message: "boom",
  timestamp: "2026-01-01T00:00:00.000Z",
  environment: "browser" as const,
  browser: { userAgent: "test-agent" },
  url: "https://example.com/",
};

describe("capturedEventSchema", () => {
  it("accepts a valid error event", () => {
    expect(capturedEventSchema.safeParse(baseErrorEvent).success).toBe(true);
  });

  it("accepts a valid unhandledrejection event", () => {
    expect(capturedEventSchema.safeParse({ ...baseErrorEvent, type: "unhandledrejection" }).success).toBe(true);
  });

  it("accepts a valid http event with request", () => {
    const event = {
      ...baseErrorEvent,
      type: "http" as const,
      request: { url: "https://example.com/api", method: "GET", statusCode: 500 },
    };
    expect(capturedEventSchema.safeParse(event).success).toBe(true);
  });

  it("accepts an http event whose request.url is a relative path", () => {
    // scrubUrl() can legitimately return the raw input unchanged when there's
    // nothing to redact, which can be a relative path for a same-origin fetch.
    const event = {
      ...baseErrorEvent,
      type: "http" as const,
      request: { url: "/api/x", method: "GET" },
    };
    expect(capturedEventSchema.safeParse(event).success).toBe(true);
  });

  it("accepts an http request without a statusCode (network failure, no response)", () => {
    const event = {
      ...baseErrorEvent,
      type: "http" as const,
      request: { url: "https://example.com/api", method: "GET" },
    };
    expect(capturedEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects a type:'http' event with no request", () => {
    const result = capturedEventSchema.safeParse({ ...baseErrorEvent, type: "http" });
    expect(result.success).toBe(false);
  });

  it("accepts a valid resource event", () => {
    const event = {
      ...baseErrorEvent,
      type: "resource" as const,
      message: "Failed to load resource: img",
      resource: { url: "https://example.com/broken.png", tagName: "img" as const },
    };
    expect(capturedEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects a type:'resource' event with no resource", () => {
    const result = capturedEventSchema.safeParse({ ...baseErrorEvent, type: "resource" });
    expect(result.success).toBe(false);
  });

  it("rejects a resource event with an unsupported tagName", () => {
    const event = {
      ...baseErrorEvent,
      type: "resource" as const,
      resource: { url: "https://example.com/broken.mp3", tagName: "audio" },
    };
    expect(capturedEventSchema.safeParse(event).success).toBe(false);
  });

  it("accepts a resource event with a statusCode", () => {
    const event = {
      ...baseErrorEvent,
      type: "resource" as const,
      resource: { url: "https://example.com/broken.png", tagName: "img" as const, statusCode: 404 },
    };
    expect(capturedEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects a resource event with an out-of-range statusCode", () => {
    const tooLow = {
      ...baseErrorEvent,
      type: "resource" as const,
      resource: { url: "https://example.com/broken.png", tagName: "img" as const, statusCode: 50 },
    };
    const tooHigh = {
      ...baseErrorEvent,
      type: "resource" as const,
      resource: { url: "https://example.com/broken.png", tagName: "img" as const, statusCode: 700 },
    };
    expect(capturedEventSchema.safeParse(tooLow).success).toBe(false);
    expect(capturedEventSchema.safeParse(tooHigh).success).toBe(false);
  });

  it("rejects a missing required field", () => {
    const { message: _drop, ...withoutMessage } = baseErrorEvent;
    expect(capturedEventSchema.safeParse(withoutMessage).success).toBe(false);
  });

  it("rejects an invalid type enum value", () => {
    expect(capturedEventSchema.safeParse({ ...baseErrorEvent, type: "not-a-real-type" }).success).toBe(false);
  });

  it("rejects a non-ISO timestamp", () => {
    expect(capturedEventSchema.safeParse({ ...baseErrorEvent, timestamp: "not-a-date" }).success).toBe(false);
  });

  it("rejects an environment other than 'browser'", () => {
    expect(capturedEventSchema.safeParse({ ...baseErrorEvent, environment: "server" }).success).toBe(false);
  });

  it("accepts an error event with filename/line/column", () => {
    const event = { ...baseErrorEvent, filename: "https://example.com/app.js", line: 42, column: 15 };
    expect(capturedEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects a zero line number", () => {
    const event = { ...baseErrorEvent, line: 0 };
    expect(capturedEventSchema.safeParse(event).success).toBe(false);
  });

  it("rejects a negative column number", () => {
    const event = { ...baseErrorEvent, column: -1 };
    expect(capturedEventSchema.safeParse(event).success).toBe(false);
  });

  it("strips unknown top-level fields rather than storing them", () => {
    const result = capturedEventSchema.safeParse({ ...baseErrorEvent, metadata: { foo: "bar" } });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).metadata).toBeUndefined();
    }
  });
});

describe("normalizeEvent", () => {
  it("truncates an overlong message and appends the truncation suffix", () => {
    const event = { ...baseErrorEvent, message: "x".repeat(MESSAGE_MAX_LEN + 100) };
    const normalized = normalizeEvent(event);
    expect(normalized.message.length).toBe(MESSAGE_MAX_LEN);
    expect(normalized.message.endsWith("…[truncated]")).toBe(true);
  });

  it("leaves an in-bounds message untouched", () => {
    const normalized = normalizeEvent(baseErrorEvent);
    expect(normalized.message).toBe("boom");
  });

  it("leaves stack undefined when not provided", () => {
    const normalized = normalizeEvent(baseErrorEvent);
    expect(normalized.stack).toBeUndefined();
  });

  it("truncates an overlong filename", () => {
    const event = { ...baseErrorEvent, filename: "https://example.com/" + "x".repeat(URL_MAX_LEN + 100) };
    const normalized = normalizeEvent(event);
    expect(normalized.filename?.length).toBe(URL_MAX_LEN);
  });

  it("leaves filename undefined when not provided", () => {
    const normalized = normalizeEvent(baseErrorEvent);
    expect(normalized.filename).toBeUndefined();
  });

  it("truncates an overlong resource.url", () => {
    const event = {
      ...baseErrorEvent,
      type: "resource" as const,
      resource: { url: "https://example.com/" + "x".repeat(URL_MAX_LEN + 100), tagName: "img" as const },
    };
    const normalized = normalizeEvent(event);
    expect(normalized.resource?.url.length).toBe(URL_MAX_LEN);
  });

  it("leaves resource undefined when not provided", () => {
    const normalized = normalizeEvent(baseErrorEvent);
    expect(normalized.resource).toBeUndefined();
  });
});

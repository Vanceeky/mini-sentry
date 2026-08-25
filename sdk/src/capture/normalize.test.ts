import { describe, expect, it } from "vitest";
import { normalizeErrorEvent, normalizeRejectionEvent } from "./normalize";

describe("normalizeErrorEvent", () => {
  it("extracts message and stack from the underlying Error", () => {
    const error = new Error("boom");
    const event = new ErrorEvent("error", { message: "boom", error });

    const normalized = normalizeErrorEvent(event);

    expect(normalized.type).toBe("error");
    expect(normalized.message).toBe("boom");
    expect(normalized.stack).toBe(error.stack);
    expect(normalized.id).toEqual(expect.any(String));
    expect(normalized.environment).toBe("browser");
  });

  it("falls back to event.message when no Error object is available", () => {
    const event = new ErrorEvent("error", { message: "Script error." });

    const normalized = normalizeErrorEvent(event);

    expect(normalized.message).toBe("Script error.");
    expect(normalized.stack).toBeUndefined();
  });
});

describe("normalizeRejectionEvent", () => {
  it("extracts message and stack from an Error reason", () => {
    const reason = new Error("rejected");
    const promise = Promise.reject(reason);
    promise.catch(() => {});
    const event = { reason, promise } as unknown as PromiseRejectionEvent;

    const normalized = normalizeRejectionEvent(event);

    expect(normalized.type).toBe("unhandledrejection");
    expect(normalized.message).toBe("rejected");
    expect(normalized.stack).toBe(reason.stack);
  });

  it("stringifies a non-Error rejection reason", () => {
    const event = { reason: "just a string", promise: Promise.resolve() } as unknown as PromiseRejectionEvent;

    const normalized = normalizeRejectionEvent(event);

    expect(normalized.message).toBe("just a string");
    expect(normalized.stack).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { getRecordedEvents, recordEvent } from "./store";
import type { CapturedEvent } from "./types";

function makeEvent(id: string): CapturedEvent {
  return {
    id,
    type: "error",
    message: "m",
    url: "http://example.test",
    timestamp: new Date().toISOString(),
    environment: "browser",
    browser: { userAgent: "ua" },
  };
}

describe("capture store", () => {
  it("records events and returns them in insertion order", () => {
    recordEvent(makeEvent("a"));
    recordEvent(makeEvent("b"));
    expect(getRecordedEvents().map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("caps the buffer so it cannot grow without bound", () => {
    for (let i = 0; i < 60; i++) {
      recordEvent(makeEvent(`extra-${i}`));
    }
    expect(getRecordedEvents().length).toBeLessThanOrEqual(50);
  });

  it("returns a snapshot copy, so mutating the result cannot corrupt internal state", () => {
    const before = getRecordedEvents().length;
    const snapshot = getRecordedEvents() as CapturedEvent[];
    snapshot.push(makeEvent("injected"));
    snapshot.length = 0;

    expect(getRecordedEvents().length).toBe(before);
  });
});

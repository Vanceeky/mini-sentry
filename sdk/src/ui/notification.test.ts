import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedEvent } from "../capture/types";

function makeEvent(overrides: Partial<CapturedEvent> = {}): CapturedEvent {
  return {
    id: "evt_1",
    type: "error",
    message: "boom",
    timestamp: "2026-01-01T00:00:00.000Z",
    environment: "browser",
    browser: { userAgent: "test-agent" },
    url: "https://example.com/",
    ...overrides,
  };
}

async function freshNotification() {
  vi.resetModules();
  return import("./notification");
}

function getToasts(): NodeListOf<HTMLElement> {
  const host = document.body.querySelector("div");
  const shadowRoot = host?.shadowRoot;
  return (shadowRoot?.querySelectorAll(".toast") ?? document.querySelectorAll(".__none__")) as NodeListOf<HTMLElement>;
}

describe("showCaptureNotification", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a toast inside a Shadow DOM host appended to document.body", async () => {
    const { showCaptureNotification } = await freshNotification();
    showCaptureNotification(makeEvent({ message: "boom" }));

    const toasts = getToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].textContent).toContain("boom");
  });

  it("reuses the same host across multiple notifications instead of creating a new one", async () => {
    const { showCaptureNotification } = await freshNotification();
    showCaptureNotification(makeEvent({ id: "a" }));
    showCaptureNotification(makeEvent({ id: "b" }));

    expect(document.body.querySelectorAll("div")).toHaveLength(1);
    expect(getToasts()).toHaveLength(2);
  });

  it("auto-dismisses a toast after the timeout", async () => {
    const { showCaptureNotification } = await freshNotification();
    showCaptureNotification(makeEvent());

    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    expect(getToasts()).toHaveLength(0);
  });

  it("dismisses a toast immediately when its dismiss button is clicked", async () => {
    const { showCaptureNotification } = await freshNotification();
    showCaptureNotification(makeEvent());

    const button = getToasts()[0].querySelector("button");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(getToasts()).toHaveLength(0);
  });

  it("caps visible toasts, evicting the oldest first", async () => {
    const { showCaptureNotification } = await freshNotification();
    showCaptureNotification(makeEvent({ id: "1", message: "first" }));
    showCaptureNotification(makeEvent({ id: "2", message: "second" }));
    showCaptureNotification(makeEvent({ id: "3", message: "third" }));
    showCaptureNotification(makeEvent({ id: "4", message: "fourth" }));

    const toasts = getToasts();
    expect(toasts).toHaveLength(3);
    expect(Array.from(toasts).some((t) => t.textContent?.includes("first"))).toBe(false);
    expect(Array.from(toasts).some((t) => t.textContent?.includes("fourth"))).toBe(true);
  });

  it("never throws even without a document available", async () => {
    const { showCaptureNotification } = await freshNotification();
    const originalBody = document.body;
    Object.defineProperty(document, "body", { value: null, configurable: true });

    expect(() => showCaptureNotification(makeEvent())).not.toThrow();

    Object.defineProperty(document, "body", { value: originalBody, configurable: true });
  });
});

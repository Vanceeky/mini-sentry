import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapturedEvent } from "../capture/types";

const sampleEvent: CapturedEvent = {
  id: "evt_1",
  type: "error",
  message: "boom",
  timestamp: "2026-01-01T00:00:00.000Z",
  environment: "browser",
  browser: { userAgent: "test-agent" },
  url: "https://example.com/",
};

async function freshSend() {
  vi.resetModules();
  return import("./send");
}

describe("sendEvent", () => {
  const originalFetch = window.fetch;

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it("POSTs the event as JSON to the configured endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    window.fetch = mockFetch;
    const { sendEvent } = await freshSend();

    sendEvent("https://collector.example.com/events", "test-api-key", sampleEvent);
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://collector.example.com/events");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer test-api-key",
    });
    expect(JSON.parse(init.body as string)).toEqual(sampleEvent);
  });

  it("warns but does not throw when the endpoint responds with a non-2xx status", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEvent } = await freshSend();

    expect(() => sendEvent("https://collector.example.com/events", "test-api-key", sampleEvent)).not.toThrow();
    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());

    warnSpy.mockRestore();
  });

  it("warns but does not throw when the fetch itself rejects", async () => {
    window.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEvent } = await freshSend();

    expect(() => sendEvent("https://collector.example.com/events", "test-api-key", sampleEvent)).not.toThrow();
    await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());

    warnSpy.mockRestore();
  });

  it("uses the fetch captured at module load, ignoring later reassignment", async () => {
    const originalMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    window.fetch = originalMock;
    const { sendEvent } = await freshSend();

    const laterMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    window.fetch = laterMock;

    sendEvent("https://collector.example.com/events", "test-api-key", sampleEvent);
    await vi.waitFor(() => expect(originalMock).toHaveBeenCalledTimes(1));

    expect(laterMock).not.toHaveBeenCalled();
  });

  it("warns and does not throw when no fetch is available", async () => {
    // @ts-expect-error simulating an environment without fetch
    window.fetch = undefined;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { sendEvent } = await freshSend();

    expect(() => sendEvent("https://collector.example.com/events", "test-api-key", sampleEvent)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

async function freshResources() {
  vi.resetModules();
  return import("./resources");
}

describe("installResourceErrorListener", () => {
  const appended: Element[] = [];

  afterEach(() => {
    appended.forEach((el) => el.remove());
    appended.length = 0;
  });

  function attach<T extends Element>(el: T): T {
    document.body.appendChild(el);
    appended.push(el);
    return el;
  }

  it("captures a failed <img> load", async () => {
    const { installResourceErrorListener } = await freshResources();
    const received: unknown[] = [];
    installResourceErrorListener((event) => received.push(event));

    const img = attach(document.createElement("img"));
    img.src = "https://example.com/broken.png";
    img.dispatchEvent(new Event("error"));

    expect(received).toHaveLength(1);
    const event = received[0] as {
      type: string;
      message: string;
      resource: { url: string; tagName: string };
    };
    expect(event.type).toBe("resource");
    expect(event.message).toBe("Failed to load resource: img");
    expect(event.resource).toEqual({ url: "https://example.com/broken.png", tagName: "img" });
  });

  it("captures a failed <script src> load", async () => {
    const { installResourceErrorListener } = await freshResources();
    const received: unknown[] = [];
    installResourceErrorListener((event) => received.push(event));

    const script = attach(document.createElement("script"));
    script.src = "https://example.com/broken.js";
    script.dispatchEvent(new Event("error"));

    expect(received).toHaveLength(1);
    expect((received[0] as { resource: { tagName: string } }).resource.tagName).toBe("script");
  });

  it("captures a failed <link href> load", async () => {
    const { installResourceErrorListener } = await freshResources();
    const received: unknown[] = [];
    installResourceErrorListener((event) => received.push(event));

    const link = attach(document.createElement("link"));
    link.href = "https://example.com/broken.css";
    link.dispatchEvent(new Event("error"));

    expect(received).toHaveLength(1);
    expect((received[0] as { resource: { tagName: string } }).resource.tagName).toBe("link");
  });

  it("ignores a resource tag not in the img/script/link scope", async () => {
    const { installResourceErrorListener } = await freshResources();
    const received: unknown[] = [];
    installResourceErrorListener((event) => received.push(event));

    const audio = attach(document.createElement("audio"));
    audio.dispatchEvent(new Event("error"));

    expect(received).toHaveLength(0);
  });

  it("ignores a plain window-targeted error (not a resource load failure)", async () => {
    const { installResourceErrorListener } = await freshResources();
    const received: unknown[] = [];
    installResourceErrorListener((event) => received.push(event));

    window.dispatchEvent(new ErrorEvent("error", { message: "boom" }));

    expect(received).toHaveLength(0);
  });

  it("captures a status code from a matching Resource Timing entry", async () => {
    const spy = vi
      .spyOn(performance, "getEntriesByName")
      .mockReturnValue([{ responseStatus: 404 } as PerformanceResourceTiming]);
    const { installResourceErrorListener } = await freshResources();
    const received: unknown[] = [];
    installResourceErrorListener((event) => received.push(event));

    const img = attach(document.createElement("img"));
    img.src = "https://example.com/broken.png";
    img.dispatchEvent(new Event("error"));

    expect((received[0] as { resource: { statusCode?: number } }).resource.statusCode).toBe(404);
    spy.mockRestore();
  });

  it("treats a responseStatus of 0 (unavailable) as no status, not a real 0", async () => {
    const spy = vi
      .spyOn(performance, "getEntriesByName")
      .mockReturnValue([{ responseStatus: 0 } as PerformanceResourceTiming]);
    const { installResourceErrorListener } = await freshResources();
    const received: unknown[] = [];
    installResourceErrorListener((event) => received.push(event));

    const img = attach(document.createElement("img"));
    img.src = "https://example.com/broken.png";
    img.dispatchEvent(new Event("error"));

    expect((received[0] as { resource: { statusCode?: number } }).resource.statusCode).toBeUndefined();
    spy.mockRestore();
  });

  it("leaves status code undefined when no Resource Timing entry is found", async () => {
    const { installResourceErrorListener } = await freshResources();
    const received: unknown[] = [];
    installResourceErrorListener((event) => received.push(event));

    const img = attach(document.createElement("img"));
    img.src = "https://example.com/broken.png";
    img.dispatchEvent(new Event("error"));

    expect((received[0] as { resource: { statusCode?: number } }).resource.statusCode).toBeUndefined();
  });
});

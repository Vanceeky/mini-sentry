import { afterEach, describe, expect, it, vi } from "vitest";

async function freshNetwork() {
  vi.resetModules();
  return import("./network");
}

describe("installFetchInterceptor", () => {
  const originalFetch = window.fetch;

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it("captures a non-success response without altering it for the caller", async () => {
    const response = new Response("not found", { status: 404, statusText: "Not Found" });
    window.fetch = vi.fn().mockResolvedValue(response);
    const { installFetchInterceptor } = await freshNetwork();
    const received: unknown[] = [];

    installFetchInterceptor((event) => received.push(event));
    const result = await window.fetch("https://api.example.com/things", { method: "GET" });

    expect(result).toBe(response);
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe("http");
    expect((received[0] as { request: { statusCode: number } }).request.statusCode).toBe(404);
    expect((received[0] as { request: { url: string } }).request.url).toBe(
      "https://api.example.com/things",
    );
    expect((received[0] as { request: { method: string } }).request.method).toBe("GET");
  });

  it("does not capture a successful response", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const { installFetchInterceptor } = await freshNetwork();
    const received: unknown[] = [];

    installFetchInterceptor((event) => received.push(event));
    await window.fetch("https://api.example.com/things");

    expect(received).toHaveLength(0);
  });

  it("captures a network failure (rejected fetch) and rethrows it unchanged", async () => {
    const networkError = new TypeError("Failed to fetch");
    window.fetch = vi.fn().mockRejectedValue(networkError);
    const { installFetchInterceptor } = await freshNetwork();
    const received: unknown[] = [];

    installFetchInterceptor((event) => received.push(event));

    await expect(window.fetch("https://api.example.com/things")).rejects.toBe(networkError);
    expect(received).toHaveLength(1);
    expect((received[0] as { type: string }).type).toBe("http");
    expect((received[0] as { message: string }).message).toBe("Failed to fetch");
    expect((received[0] as { request: { statusCode?: number } }).request.statusCode).toBeUndefined();
  });

  it("defaults the method to GET when none is specified", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const { installFetchInterceptor } = await freshNetwork();
    const received: unknown[] = [];

    installFetchInterceptor((event) => received.push(event));
    await window.fetch("https://api.example.com/things");

    expect((received[0] as { request: { method: string } }).request.method).toBe("GET");
  });

  it("reads the method off a Request object when no init is passed", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const { installFetchInterceptor } = await freshNetwork();
    const received: unknown[] = [];

    installFetchInterceptor((event) => received.push(event));
    await window.fetch(new Request("https://api.example.com/things", { method: "post" }));

    expect((received[0] as { request: { method: string } }).request.method).toBe("POST");
  });

  it("redacts a sensitive query param from the captured request URL", async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const { installFetchInterceptor } = await freshNetwork();
    const received: unknown[] = [];

    installFetchInterceptor((event) => received.push(event));
    await window.fetch("https://api.example.com/things?api_key=super-secret");

    const requestUrl = (received[0] as { request: { url: string } }).request.url;
    expect(requestUrl).toContain("api_key=%5BRedacted%5D");
    expect(requestUrl).not.toContain("super-secret");
  });

  it("only installs once even if called twice", async () => {
    const firstFetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    window.fetch = firstFetch;
    const { installFetchInterceptor } = await freshNetwork();

    installFetchInterceptor(() => {});
    const patchedOnce = window.fetch;
    installFetchInterceptor(() => {});

    expect(window.fetch).toBe(patchedOnce);
  });
});

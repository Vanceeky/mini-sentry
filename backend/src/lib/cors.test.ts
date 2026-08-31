import { afterEach, beforeEach, describe, expect, it } from "vitest";

async function freshCors() {
  return import("./cors");
}

describe("resolveCorsHeaders", () => {
  const originalEnv = process.env.CORS_ALLOWED_ORIGINS;

  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173,https://demo.example.com";
  });

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = originalEnv;
  });

  it("returns full CORS headers for an allowed origin, defaulting Allow-Methods to POST, OPTIONS", async () => {
    const { resolveCorsHeaders } = await freshCors();
    const headers = resolveCorsHeaders("http://localhost:5173");

    expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:5173");
    expect(headers["Vary"]).toBe("Origin");
    expect(headers["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization");
  });

  it("reflects the given allowedMethods instead of the default", async () => {
    const { resolveCorsHeaders } = await freshCors();
    const headers = resolveCorsHeaders("http://localhost:5173", "GET, PATCH, DELETE, OPTIONS");
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, PATCH, DELETE, OPTIONS");
  });

  it("returns no headers for a disallowed origin", async () => {
    const { resolveCorsHeaders } = await freshCors();
    expect(resolveCorsHeaders("https://evil.example.com")).toEqual({});
  });

  it("returns no headers when origin is null", async () => {
    const { resolveCorsHeaders } = await freshCors();
    expect(resolveCorsHeaders(null)).toEqual({});
  });

  it("never reflects an allowlist of '*'", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "*";
    const { resolveCorsHeaders } = await freshCors();
    expect(resolveCorsHeaders("https://anything.example.com")).toEqual({});
  });
});

describe("resolveEventsCorsHeaders", () => {
  const originalEnv = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = originalEnv;
  });

  it("returns a literal wildcard Allow-Origin regardless of CORS_ALLOWED_ORIGINS", async () => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
    const { resolveEventsCorsHeaders } = await freshCors();
    const headers = resolveEventsCorsHeaders("https://some-random-customer-site.example.com");

    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Methods"]).toBe("POST, OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type, Authorization");
  });

  it("does not send Vary: Origin (the response never varies by origin)", async () => {
    const { resolveEventsCorsHeaders } = await freshCors();
    expect(resolveEventsCorsHeaders("https://example.com")["Vary"]).toBeUndefined();
  });

  it("reflects the given allowedMethods instead of the default", async () => {
    const { resolveEventsCorsHeaders } = await freshCors();
    expect(resolveEventsCorsHeaders("https://example.com", "GET, OPTIONS")["Access-Control-Allow-Methods"]).toBe("GET, OPTIONS");
  });

  it("returns no headers when origin is null (non-browser caller)", async () => {
    const { resolveEventsCorsHeaders } = await freshCors();
    expect(resolveEventsCorsHeaders(null)).toEqual({});
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedProject } from "@/lib/apiKey";

const sampleEvent = {
  id: "abc-123",
  type: "error",
  message: "boom",
  timestamp: "2026-01-01T00:00:00.000Z",
  environment: "browser",
  browser: { userAgent: "test-agent" },
  url: "https://example.com/",
};

async function freshRoute(project: AuthenticatedProject | null) {
  vi.resetModules();
  vi.doMock("@/lib/apiKey", async () => {
    const actual = await vi.importActual<typeof import("@/lib/apiKey")>("@/lib/apiKey");
    return {
      ...actual,
      findProjectByApiKey: vi.fn().mockResolvedValue(project),
    };
  });
  return import("./route");
}

function postRequest(body: unknown, init: { auth?: string; origin?: string; raw?: string } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.auth !== undefined) headers.set("Authorization", init.auth);
  if (init.origin !== undefined) headers.set("Origin", init.origin);
  return new Request("http://localhost:3000/api/v1/events", {
    method: "POST",
    headers,
    body: init.raw ?? JSON.stringify(body),
  });
}

describe("POST /api/v1/events", () => {
  const originalEnv = process.env.CORS_ALLOWED_ORIGINS;

  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = originalEnv;
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/apiKey");
  });

  it("returns 401 UNAUTHORIZED when the Authorization header is missing", async () => {
    const { POST } = await freshRoute(null);
    const response = await POST(postRequest(sampleEvent));
    expect(response.status).toBe(401);
    expect((await response.json()) as unknown).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
  });

  it("returns 401 UNAUTHORIZED when the Authorization header isn't Bearer-shaped", async () => {
    const { POST } = await freshRoute(null);
    const response = await POST(postRequest(sampleEvent, { auth: "Basic abc123" }));
    expect(response.status).toBe(401);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("returns 401 INVALID_API_KEY when no project matches the key", async () => {
    const { POST } = await freshRoute(null);
    const response = await POST(postRequest(sampleEvent, { auth: "Bearer wrong-key" }));
    expect(response.status).toBe(401);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVALID_API_KEY" } });
  });

  it("returns 413 PAYLOAD_TOO_LARGE for an oversized body", async () => {
    const { POST } = await freshRoute({ id: "proj_1", name: "Test" });
    const raw = JSON.stringify({ ...sampleEvent, message: "x".repeat(40 * 1024) });
    const response = await POST(postRequest(null, { auth: "Bearer key", raw }));
    expect(response.status).toBe(413);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "PAYLOAD_TOO_LARGE" } });
  });

  it("returns 400 INVALID_EVENT for malformed JSON", async () => {
    const { POST } = await freshRoute({ id: "proj_1", name: "Test" });
    const response = await POST(postRequest(null, { auth: "Bearer key", raw: "{not json" }));
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVALID_EVENT" } });
  });

  it("returns 400 INVALID_EVENT when a required field is missing", async () => {
    const { POST } = await freshRoute({ id: "proj_1", name: "Test" });
    const { message: _drop, ...withoutMessage } = sampleEvent;
    const response = await POST(postRequest(withoutMessage, { auth: "Bearer key" }));
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVALID_EVENT" } });
  });

  it("returns 400 INVALID_EVENT when type is 'http' but request is missing", async () => {
    const { POST } = await freshRoute({ id: "proj_1", name: "Test" });
    const response = await POST(postRequest({ ...sampleEvent, type: "http" }, { auth: "Bearer key" }));
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVALID_EVENT" } });
  });

  it("returns 200 with {success:true, eventId} for a valid event and known key", async () => {
    const { POST } = await freshRoute({ id: "proj_1", name: "Test" });
    const response = await POST(postRequest(sampleEvent, { auth: "Bearer good-key" }));
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, eventId: "evt_abc-123" });
  });

  it("attaches CORS headers for an allowed origin", async () => {
    const { POST } = await freshRoute({ id: "proj_1", name: "Test" });
    const response = await POST(postRequest(sampleEvent, { auth: "Bearer good-key", origin: "http://localhost:5173" }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("omits CORS headers for a disallowed origin", async () => {
    const { POST } = await freshRoute({ id: "proj_1", name: "Test" });
    const response = await POST(postRequest(sampleEvent, { auth: "Bearer good-key", origin: "https://evil.example.com" }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});

describe("OPTIONS /api/v1/events", () => {
  const originalEnv = process.env.CORS_ALLOWED_ORIGINS;

  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
  });

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = originalEnv;
  });

  it("returns 204 with CORS headers for an allowed origin preflight", async () => {
    const { OPTIONS } = await freshRoute(null);
    const request = new Request("http://localhost:3000/api/v1/events", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" },
    });
    const response = await OPTIONS(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});

describe("unsupported methods", () => {
  it("GET returns 405 METHOD_NOT_ALLOWED", async () => {
    const { GET } = await freshRoute(null);
    const response = await GET();
    expect(response.status).toBe(405);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "METHOD_NOT_ALLOWED" } });
  });
});

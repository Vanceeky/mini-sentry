import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: {
  authFails?: boolean;
  registerDevice?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails
      ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED())
      : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/device", () => ({
    registerDevice: opts.registerDevice ?? vi.fn().mockResolvedValue({ id: "dev_1", platform: "ios", createdAt: new Date() }),
  }));
  return import("./route");
}

function postRequest(body: unknown, init: { origin?: string; raw?: string } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.origin !== undefined) headers.set("Origin", init.origin);
  return new Request("http://localhost:3000/api/v1/devices", {
    method: "POST",
    headers,
    body: init.raw ?? JSON.stringify(body),
  });
}

describe("POST /api/v1/devices", () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/device");
  });

  it("returns 401 when not authenticated", async () => {
    const { POST } = await freshRoute({ authFails: true });
    const response = await POST(postRequest({ platform: "ios", pushToken: "abc" }));
    expect(response.status).toBe(401);
  });

  it("returns 200 with the safe device shape on success", async () => {
    const device = { id: "dev_1", platform: "ios", createdAt: new Date().toISOString() };
    const { POST } = await freshRoute({ registerDevice: vi.fn().mockResolvedValue(device) });

    const response = await POST(postRequest({ platform: "ios", pushToken: "abc" }));
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, device });
  });

  it("calls registerDevice with the authenticated user id and the request body", async () => {
    const registerDevice = vi.fn().mockResolvedValue({ id: "dev_1", platform: "ios", createdAt: new Date() });
    const { POST } = await freshRoute({ registerDevice });

    await POST(postRequest({ platform: "ios", pushToken: "abc123" }));
    expect(registerDevice).toHaveBeenCalledWith("user_1", "ios", "abc123");
  });

  it("returns 400 VALIDATION_ERROR for an unsupported platform", async () => {
    const { POST } = await freshRoute();
    const response = await POST(postRequest({ platform: "web", pushToken: "abc" }));
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 400 VALIDATION_ERROR for a missing pushToken", async () => {
    const { POST } = await freshRoute();
    const response = await POST(postRequest({ platform: "ios" }));
    expect(response.status).toBe(400);
  });

  it("returns 400 VALIDATION_ERROR for malformed JSON", async () => {
    const { POST } = await freshRoute();
    const response = await POST(postRequest(undefined, { raw: "{not json" }));
    expect(response.status).toBe(400);
  });

  it("attaches CORS headers for an allowed origin", async () => {
    const { POST } = await freshRoute();
    const response = await POST(postRequest({ platform: "ios", pushToken: "abc" }, { origin: "http://localhost:5173" }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});

describe("unsupported methods on /api/v1/devices", () => {
  it("GET returns 405 METHOD_NOT_ALLOWED", async () => {
    const { GET } = await freshRoute();
    expect((await GET()).status).toBe(405);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: {
  authFails?: boolean;
  deleteOwnedDevice?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails
      ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED())
      : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/device", () => ({
    deleteOwnedDevice: opts.deleteOwnedDevice ?? vi.fn().mockResolvedValue(false),
  }));
  return import("./route");
}

function makeRequest() {
  return new Request("http://localhost:3000/api/v1/devices/dev_1", { method: "DELETE" });
}

function ctx() {
  return { params: Promise.resolve({ deviceId: "dev_1" }) };
}

describe("DELETE /api/v1/devices/:deviceId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/device");
  });

  it("returns 401 when not authenticated", async () => {
    const { DELETE } = await freshRoute({ authFails: true });
    expect((await DELETE(makeRequest(), ctx())).status).toBe(401);
  });

  it("returns 404 DEVICE_NOT_FOUND when not owned", async () => {
    const { DELETE } = await freshRoute({ deleteOwnedDevice: vi.fn().mockResolvedValue(false) });
    const response = await DELETE(makeRequest(), ctx());
    expect(response.status).toBe(404);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "DEVICE_NOT_FOUND" } });
  });

  it("returns 200 {success:true} and scopes the delete to the authenticated user", async () => {
    const deleteOwnedDevice = vi.fn().mockResolvedValue(true);
    const { DELETE } = await freshRoute({ deleteOwnedDevice });

    const response = await DELETE(makeRequest(), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true });
    expect(deleteOwnedDevice).toHaveBeenCalledWith("user_1", "dev_1");
  });
});

describe("unsupported methods on /api/v1/devices/:deviceId", () => {
  it("GET returns 405 METHOD_NOT_ALLOWED", async () => {
    const { GET } = await freshRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/devices/dev_1"));
    expect(response.status).toBe(405);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("DELETE");
  });
});

describe("OPTIONS /api/v1/devices/:deviceId", () => {
  const originalEnv = process.env.CORS_ALLOWED_ORIGINS;

  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
  });

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = originalEnv;
  });

  it("advertises DELETE (the real method), not just POST", async () => {
    const { OPTIONS } = await freshRoute();
    const request = new Request("http://localhost:3000/api/v1/devices/dev_1", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    const response = await OPTIONS(request);
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("DELETE, OPTIONS");
  });
});

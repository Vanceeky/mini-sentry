import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function freshRoute(deleteMany: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ count: 1 })) {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ prisma: { session: { deleteMany } } }));
  return import("./route");
}

function makeRequest(init: { auth?: string; origin?: string } = {}) {
  const headers = new Headers();
  if (init.auth !== undefined) headers.set("Authorization", init.auth);
  if (init.origin !== undefined) headers.set("Origin", init.origin);
  return new Request("http://localhost:3000/api/v1/auth/logout", { method: "POST", headers });
}

describe("POST /api/v1/auth/logout", () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
  });

  it("returns 401 UNAUTHORIZED when the Authorization header is missing", async () => {
    const { POST } = await freshRoute();
    const response = await POST(makeRequest());
    expect(response.status).toBe(401);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("returns 200 {success:true} for a valid header, and deletes the session by hash", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const { POST } = await freshRoute(deleteMany);
    const response = await POST(makeRequest({ auth: "Bearer some-session-token" }));

    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true });
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it("is idempotent — succeeds even when the token doesn't match any session", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const { POST } = await freshRoute(deleteMany);
    const response = await POST(makeRequest({ auth: "Bearer already-logged-out" }));
    expect(response.status).toBe(200);
  });

  it("attaches CORS headers for an allowed origin", async () => {
    const { POST } = await freshRoute();
    const response = await POST(makeRequest({ auth: "Bearer token", origin: "http://localhost:5173" }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});

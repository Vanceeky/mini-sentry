import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function freshRoute(findUnique: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(null)) {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ prisma: { session: { findUnique } } }));
  return import("./route");
}

function makeRequest(init: { auth?: string; origin?: string } = {}) {
  const headers = new Headers();
  if (init.auth !== undefined) headers.set("Authorization", init.auth);
  if (init.origin !== undefined) headers.set("Origin", init.origin);
  return new Request("http://localhost:3000/api/v1/auth/me", { method: "GET", headers });
}

describe("GET /api/v1/auth/me", () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
  });

  afterEach(() => {
    vi.doUnmock("@/lib/db");
  });

  it("returns 401 UNAUTHORIZED when the Authorization header is missing", async () => {
    const { GET } = await freshRoute();
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  });

  it("returns 401 INVALID_SESSION for an unknown token", async () => {
    const { GET } = await freshRoute(vi.fn().mockResolvedValue(null));
    const response = await GET(makeRequest({ auth: "Bearer unknown-token" }));
    expect(response.status).toBe(401);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVALID_SESSION" } });
  });

  it("returns 401 INVALID_SESSION for an expired token", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      expiresAt: new Date(Date.now() - 1000),
      user: { id: "usr_1", name: "Ada", email: "ada@example.com" },
    });
    const { GET } = await freshRoute(findUnique);
    const response = await GET(makeRequest({ auth: "Bearer expired-token" }));
    expect(response.status).toBe(401);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVALID_SESSION" } });
  });

  it("returns 200 with {id, name, email} for a valid session", async () => {
    const user = { id: "usr_1", name: "Ada", email: "ada@example.com" };
    const findUnique = vi.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 1_000_000), user });
    const { GET } = await freshRoute(findUnique);

    const response = await GET(makeRequest({ auth: "Bearer valid-token" }));
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, user });
  });

  it("attaches CORS headers for an allowed origin", async () => {
    const user = { id: "usr_1", name: "Ada", email: "ada@example.com" };
    const findUnique = vi.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 1_000_000), user });
    const { GET } = await freshRoute(findUnique);
    const response = await GET(makeRequest({ auth: "Bearer valid-token", origin: "http://localhost:5173" }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});

describe("unsupported methods on /api/v1/auth/me", () => {
  it("POST returns 405 METHOD_NOT_ALLOWED", async () => {
    const { POST } = await freshRoute();
    const response = await POST();
    expect(response.status).toBe(405);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("GET");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOGIN_RATE_LIMIT_MAX } from "@/lib/constants";

async function freshRoute(opts: {
  findUnique?: ReturnType<typeof vi.fn>;
  sessionCreate?: ReturnType<typeof vi.fn>;
}) {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({
    prisma: {
      user: { findUnique: opts.findUnique ?? vi.fn().mockResolvedValue(null) },
      session: { create: opts.sessionCreate ?? vi.fn().mockResolvedValue({}) },
    },
  }));
  return import("./route");
}

function postRequest(body: unknown, init: { origin?: string; raw?: string } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.origin !== undefined) headers.set("Origin", init.origin);
  return new Request("http://localhost:3000/api/v1/auth/login", {
    method: "POST",
    headers,
    body: init.raw ?? JSON.stringify(body),
  });
}

describe("POST /api/v1/auth/login", () => {
  let hashPassword: typeof import("@/lib/password").hashPassword;

  beforeEach(async () => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
    vi.spyOn(console, "error").mockImplementation(() => {});
    ({ hashPassword } = await import("@/lib/password"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/db");
  });

  it("returns 200 with a token and safe user object for correct credentials", async () => {
    const user = { id: "usr_1", name: "Ada", email: "ada@example.com", role: "USER", passwordHash: hashPassword("correct-password") };
    const sessionCreate = vi.fn().mockResolvedValue({});
    const { POST } = await freshRoute({ findUnique: vi.fn().mockResolvedValue(user), sessionCreate });

    const response = await POST(postRequest({ email: "ada@example.com", password: "correct-password" }));
    expect(response.status).toBe(200);

    const body = (await response.json()) as { success: boolean; token: string; user: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.user).toEqual({ id: "usr_1", name: "Ada", email: "ada@example.com", role: "USER" });
    expect(JSON.stringify(body)).not.toContain(user.passwordHash);

    expect(sessionCreate).toHaveBeenCalledTimes(1);
    expect(sessionCreate.mock.calls[0][0].data.userId).toBe("usr_1");
  });

  it("returns 401 INVALID_CREDENTIALS for an unknown email", async () => {
    const { POST } = await freshRoute({ findUnique: vi.fn().mockResolvedValue(null) });
    const response = await POST(postRequest({ email: "unknown@example.com", password: "anything" }));
    expect(response.status).toBe(401);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
  });

  it("returns 401 INVALID_CREDENTIALS for a wrong password", async () => {
    const user = { id: "usr_1", name: "Ada", email: "ada@example.com", passwordHash: hashPassword("correct-password") };
    const { POST } = await freshRoute({ findUnique: vi.fn().mockResolvedValue(user) });
    const response = await POST(postRequest({ email: "ada@example.com", password: "wrong-password" }));
    expect(response.status).toBe(401);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
  });

  it("does not create a session on failed login", async () => {
    const sessionCreate = vi.fn().mockResolvedValue({});
    const { POST } = await freshRoute({ findUnique: vi.fn().mockResolvedValue(null), sessionCreate });
    await POST(postRequest({ email: "unknown@example.com", password: "anything" }));
    expect(sessionCreate).not.toHaveBeenCalled();
  });

  it("returns 400 VALIDATION_ERROR for a malformed email", async () => {
    const { POST } = await freshRoute({});
    const response = await POST(postRequest({ email: "not-an-email", password: "x" }));
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("attaches CORS headers for an allowed origin", async () => {
    const user = { id: "usr_1", name: "Ada", email: "ada@example.com", passwordHash: hashPassword("correct-password") };
    const { POST } = await freshRoute({ findUnique: vi.fn().mockResolvedValue(user) });
    const response = await POST(
      postRequest({ email: "ada@example.com", password: "correct-password" }, { origin: "http://localhost:5173" }),
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("returns 429 RATE_LIMITED after exceeding the per-email attempt limit", async () => {
    const { POST } = await freshRoute({ findUnique: vi.fn().mockResolvedValue(null) });

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX; i++) {
      const response = await POST(postRequest({ email: "flood@example.com", password: "x" }));
      expect(response.status).toBe(401); // INVALID_CREDENTIALS — still under the limit
    }

    const limited = await POST(postRequest({ email: "flood@example.com", password: "x" }));
    expect(limited.status).toBe(429);
    const body = (await limited.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("rate-limits a different email independently", async () => {
    const { POST } = await freshRoute({ findUnique: vi.fn().mockResolvedValue(null) });

    for (let i = 0; i < LOGIN_RATE_LIMIT_MAX; i++) {
      await POST(postRequest({ email: "flood2@example.com", password: "x" }));
    }
    await POST(postRequest({ email: "flood2@example.com", password: "x" })); // now limited

    const response = await POST(postRequest({ email: "someone-else@example.com", password: "x" }));
    expect(response.status).toBe(401); // not 429 — different key
  });
});

describe("unsupported methods on /api/v1/auth/login", () => {
  it("GET returns 405 METHOD_NOT_ALLOWED", async () => {
    const { GET } = await freshRoute({});
    const response = await GET(new Request("http://localhost:3000/api/v1/auth/login"));
    expect(response.status).toBe(405);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const user = { id: "usr_1", name: "Ada", email: "ada@example.com", passwordHash: hashPassword("correct-password") };
    const sessionCreate = vi.fn().mockResolvedValue({});
    const { POST } = await freshRoute({ findUnique: vi.fn().mockResolvedValue(user), sessionCreate });

    const response = await POST(postRequest({ email: "ada@example.com", password: "correct-password" }));
    expect(response.status).toBe(200);

    const body = (await response.json()) as { success: boolean; token: string; user: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
    expect(body.user).toEqual({ id: "usr_1", name: "Ada", email: "ada@example.com" });
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
});

describe("unsupported methods on /api/v1/auth/login", () => {
  it("GET returns 405 METHOD_NOT_ALLOWED", async () => {
    const { GET } = await freshRoute({});
    const response = await GET();
    expect(response.status).toBe(405);
  });
});

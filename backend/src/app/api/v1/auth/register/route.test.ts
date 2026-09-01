import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function freshRoute(createMock: ReturnType<typeof vi.fn>, opts: { acceptInvitation?: ReturnType<typeof vi.fn> } = {}) {
  vi.resetModules();
  vi.doMock("@/lib/db", () => ({ prisma: { user: { create: createMock } } }));
  vi.doMock("@/lib/invitation", () => ({
    acceptInvitation: opts.acceptInvitation ?? vi.fn().mockResolvedValue({ status: "accepted", projectId: "proj_1" }),
  }));
  return import("./route");
}

function postRequest(body: unknown, init: { origin?: string; raw?: string } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.origin !== undefined) headers.set("Origin", init.origin);
  return new Request("http://localhost:3000/api/v1/auth/register", {
    method: "POST",
    headers,
    body: init.raw ?? JSON.stringify(body),
  });
}

const validBody = { name: "Ada Lovelace", email: "ada@example.com", password: "supersecret1" };

describe("POST /api/v1/auth/register", () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/db");
    vi.doUnmock("@/lib/invitation");
  });

  it("returns 201 with a safe user object (no password) on success", async () => {
    const createdUser = { id: "usr_1", name: "Ada Lovelace", email: "ada@example.com", createdAt: new Date() };
    const createMock = vi.fn().mockResolvedValue(createdUser);
    const { POST } = await freshRoute(createMock);

    const response = await POST(postRequest(validBody));
    expect(response.status).toBe(201);

    const body = (await response.json()) as { success: boolean; user: Record<string, unknown> };
    expect(body.success).toBe(true);
    expect(body.user).toMatchObject({ id: "usr_1", name: "Ada Lovelace", email: "ada@example.com" });
    expect(JSON.stringify(body)).not.toContain("supersecret1");
  });

  it("hashes the password before persisting — never stores it raw", async () => {
    const createMock = vi.fn().mockResolvedValue({ id: "usr_1", name: "Ada", email: "ada@example.com", createdAt: new Date() });
    const { POST } = await freshRoute(createMock);

    await POST(postRequest(validBody));

    const createArgs = createMock.mock.calls[0][0];
    expect(createArgs.data.passwordHash).not.toBe("supersecret1");
    expect(createArgs.data.passwordHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it("returns 400 VALIDATION_ERROR for a malformed email", async () => {
    const { POST } = await freshRoute(vi.fn());
    const response = await POST(postRequest({ ...validBody, email: "not-an-email" }));
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 400 VALIDATION_ERROR for a too-short password", async () => {
    const { POST } = await freshRoute(vi.fn());
    const response = await POST(postRequest({ ...validBody, password: "short" }));
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 400 VALIDATION_ERROR for malformed JSON", async () => {
    const { POST } = await freshRoute(vi.fn());
    const response = await POST(postRequest(null, { raw: "{not json" }));
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 409 EMAIL_ALREADY_REGISTERED on a duplicate email", async () => {
    const createMock = vi.fn().mockRejectedValue({ code: "P2002" });
    const { POST } = await freshRoute(createMock);

    const response = await POST(postRequest(validBody));
    expect(response.status).toBe(409);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "EMAIL_ALREADY_REGISTERED" } });
  });

  it("returns 500 INTERNAL_ERROR (never leaking the underlying error) on an unexpected failure", async () => {
    const createMock = vi.fn().mockRejectedValue(new Error("connection refused: password=hunter2"));
    const { POST } = await freshRoute(createMock);

    const response = await POST(postRequest(validBody));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain("hunter2");
  });

  it("attaches CORS headers for an allowed origin", async () => {
    const createMock = vi.fn().mockResolvedValue({ id: "usr_1", name: "Ada", email: "ada@example.com", createdAt: new Date() });
    const { POST } = await freshRoute(createMock);

    const response = await POST(postRequest(validBody, { origin: "http://localhost:5173" }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("with a valid invitationToken, joins the project and reports it in the response", async () => {
    const createMock = vi.fn().mockResolvedValue({ id: "usr_1", name: "Ada", email: "ada@example.com", createdAt: new Date() });
    const acceptInvitation = vi.fn().mockResolvedValue({ status: "accepted", projectId: "proj_1" });
    const { POST } = await freshRoute(createMock, { acceptInvitation });

    const response = await POST(postRequest({ ...validBody, invitationToken: "tok_123" }));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { invitation: { status: string; projectId: string } };
    expect(body.invitation).toEqual({ status: "accepted", projectId: "proj_1" });
    expect(acceptInvitation).toHaveBeenCalledWith("tok_123", "usr_1", "ada@example.com");
  });

  it("still creates the account when invitationToken is invalid/expired — never blocks registration", async () => {
    const createMock = vi.fn().mockResolvedValue({ id: "usr_1", name: "Ada", email: "ada@example.com", createdAt: new Date() });
    const acceptInvitation = vi.fn().mockResolvedValue({ status: "expired" });
    const { POST } = await freshRoute(createMock, { acceptInvitation });

    const response = await POST(postRequest({ ...validBody, invitationToken: "stale-token" }));
    expect(response.status).toBe(201);
    expect(createMock).toHaveBeenCalledTimes(1);
    const body = (await response.json()) as { invitation: { status: string } };
    expect(body.invitation).toEqual({ status: "expired" });
  });

  it("omits the invitation key entirely when no invitationToken was sent", async () => {
    const createMock = vi.fn().mockResolvedValue({ id: "usr_1", name: "Ada", email: "ada@example.com", createdAt: new Date() });
    const { POST } = await freshRoute(createMock);

    const response = await POST(postRequest(validBody));
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).not.toHaveProperty("invitation");
  });
});

describe("unsupported methods on /api/v1/auth/register", () => {
  it("GET returns 405 METHOD_NOT_ALLOWED", async () => {
    const { GET } = await freshRoute(vi.fn());
    const response = await GET(new Request("http://localhost:3000/api/v1/auth/register"));
    expect(response.status).toBe(405);
  });
});

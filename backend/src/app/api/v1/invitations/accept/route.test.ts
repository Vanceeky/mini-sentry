import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: { authFails?: boolean; acceptInvitation?: ReturnType<typeof vi.fn> } = {}) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED()) : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/invitation", () => ({
    acceptInvitation: opts.acceptInvitation ?? vi.fn().mockResolvedValue({ status: "accepted", teamId: "team_1" }),
  }));
  return import("./route");
}

function postRequest(body: unknown) {
  return new Request("http://localhost:3000/x", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/v1/invitations/accept", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/invitation");
  });

  it("returns 400 VALIDATION_ERROR for a missing token", async () => {
    const { POST } = await freshRoute();
    expect((await POST(postRequest({}))).status).toBe(400);
  });

  it("returns 404 INVITATION_NOT_FOUND for an unknown token", async () => {
    const { POST } = await freshRoute({ acceptInvitation: vi.fn().mockResolvedValue({ status: "not_found" }) });
    const response = await POST(postRequest({ token: "bad" }));
    expect(response.status).toBe(404);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVITATION_NOT_FOUND" } });
  });

  it("returns 404 INVITATION_EXPIRED for an expired token", async () => {
    const { POST } = await freshRoute({ acceptInvitation: vi.fn().mockResolvedValue({ status: "expired" }) });
    const response = await POST(postRequest({ token: "old" }));
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVITATION_EXPIRED" } });
  });

  it("returns 403 INVITATION_EMAIL_MISMATCH when the token isn't addressed to the caller", async () => {
    const { POST } = await freshRoute({ acceptInvitation: vi.fn().mockResolvedValue({ status: "email_mismatch" }) });
    const response = await POST(postRequest({ token: "tok" }));
    expect(response.status).toBe(403);
  });

  it("returns 200 with the joined teamId on success", async () => {
    const { POST } = await freshRoute();
    const response = await POST(postRequest({ token: "tok" }));
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, teamId: "team_1" });
  });
});

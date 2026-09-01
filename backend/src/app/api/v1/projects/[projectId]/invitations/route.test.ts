import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(
  opts: {
    authFails?: boolean;
    findOwnedProject?: ReturnType<typeof vi.fn>;
    createInvitation?: ReturnType<typeof vi.fn>;
    listPendingInvitationsForProject?: ReturnType<typeof vi.fn>;
    sendInvitationEmail?: ReturnType<typeof vi.fn>;
  } = {},
) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED()) : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/project", () => ({
    findOwnedProject: opts.findOwnedProject ?? vi.fn().mockResolvedValue({ id: "proj_1" }),
  }));
  vi.doMock("@/lib/invitation", () => ({
    createInvitation:
      opts.createInvitation ??
      vi.fn().mockResolvedValue({
        status: "created",
        invitation: { id: "inv_1", invitedEmail: "bob@example.com" },
        token: "raw-token",
        projectName: "Rocket",
        inviterName: "Ada",
      }),
    listPendingInvitationsForProject: opts.listPendingInvitationsForProject ?? vi.fn().mockResolvedValue([]),
  }));
  vi.doMock("@/lib/email", () => ({
    getEmailService: () => ({ sendInvitationEmail: opts.sendInvitationEmail ?? vi.fn().mockResolvedValue(undefined) }),
  }));
  return import("./route");
}

function ctx() {
  return { params: Promise.resolve({ projectId: "proj_1" }) };
}

describe("GET /api/v1/projects/:projectId/invitations", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
    vi.doUnmock("@/lib/invitation");
    vi.doUnmock("@/lib/email");
  });

  it("returns 404 when the caller doesn't own the project", async () => {
    const { GET } = await freshRoute({ findOwnedProject: vi.fn().mockResolvedValue(null) });
    const response = await GET(new Request("http://localhost:3000/x"), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 200 with pending invitations for the owner", async () => {
    const { GET } = await freshRoute();
    expect((await GET(new Request("http://localhost:3000/x"), ctx())).status).toBe(200);
  });
});

describe("POST /api/v1/projects/:projectId/invitations", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
    vi.doUnmock("@/lib/invitation");
    vi.doUnmock("@/lib/email");
  });

  function postRequest(body: unknown) {
    return new Request("http://localhost:3000/x", { method: "POST", body: JSON.stringify(body) });
  }

  it("returns 201 with the raw token and best-effort sends the email", async () => {
    const sendInvitationEmail = vi.fn().mockResolvedValue(undefined);
    const { POST } = await freshRoute({ sendInvitationEmail });

    const response = await POST(postRequest({ email: "bob@example.com" }), ctx());
    expect(response.status).toBe(201);
    const body = (await response.json()) as { token: string };
    expect(body.token).toBe("raw-token");
    expect(sendInvitationEmail).toHaveBeenCalledWith("bob@example.com", expect.objectContaining({ projectName: "Rocket" }));
  });

  it("still returns 201 when the email send fails (best-effort)", async () => {
    const { POST } = await freshRoute({ sendInvitationEmail: vi.fn().mockRejectedValue(new Error("smtp down")) });
    const response = await POST(postRequest({ email: "bob@example.com" }), ctx());
    expect(response.status).toBe(201);
  });

  it("returns 409 INVITATION_ALREADY_PENDING on a duplicate invite", async () => {
    const { POST } = await freshRoute({ createInvitation: vi.fn().mockResolvedValue({ status: "already_pending" }) });
    const response = await POST(postRequest({ email: "bob@example.com" }), ctx());
    expect(response.status).toBe(409);
  });

  it("returns 400 VALIDATION_ERROR for a malformed email", async () => {
    const { POST } = await freshRoute();
    const response = await POST(postRequest({ email: "not-an-email" }), ctx());
    expect(response.status).toBe(400);
  });
});

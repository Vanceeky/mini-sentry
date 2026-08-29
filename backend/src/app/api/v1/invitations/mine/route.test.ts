import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: { authFails?: boolean; listPendingInvitationsForUser?: ReturnType<typeof vi.fn> } = {}) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED()) : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/invitation", () => ({
    listPendingInvitationsForUser: opts.listPendingInvitationsForUser ?? vi.fn().mockResolvedValue([]),
  }));
  return import("./route");
}

describe("GET /api/v1/invitations/mine", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/invitation");
  });

  it("returns 401 when not authenticated", async () => {
    const { GET } = await freshRoute({ authFails: true });
    expect((await GET(new Request("http://localhost:3000/x"))).status).toBe(401);
  });

  it("looks up invitations by the caller's own email", async () => {
    const listPendingInvitationsForUser = vi.fn().mockResolvedValue([{ id: "inv_1" }]);
    const { GET } = await freshRoute({ listPendingInvitationsForUser });

    const response = await GET(new Request("http://localhost:3000/x"));
    expect(response.status).toBe(200);
    expect(listPendingInvitationsForUser).toHaveBeenCalledWith("ada@example.com");
  });
});

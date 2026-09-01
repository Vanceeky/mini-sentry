import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(
  opts: { authFails?: boolean; findOwnedProject?: ReturnType<typeof vi.fn>; revokeInvitation?: ReturnType<typeof vi.fn> } = {},
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
    revokeInvitation: opts.revokeInvitation ?? vi.fn().mockResolvedValue(true),
  }));
  return import("./route");
}

function ctx() {
  return { params: Promise.resolve({ projectId: "proj_1", invitationId: "inv_1" }) };
}

describe("DELETE /api/v1/projects/:projectId/invitations/:invitationId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
    vi.doUnmock("@/lib/invitation");
  });

  it("returns 404 when the caller doesn't own the project", async () => {
    const { DELETE } = await freshRoute({ findOwnedProject: vi.fn().mockResolvedValue(null) });
    const response = await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 404 INVITATION_NOT_FOUND when nothing was revoked", async () => {
    const { DELETE } = await freshRoute({ revokeInvitation: vi.fn().mockResolvedValue(false) });
    const response = await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 200 on success", async () => {
    const { DELETE } = await freshRoute();
    expect((await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx())).status).toBe(200);
  });
});

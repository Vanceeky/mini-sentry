import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(
  opts: { authFails?: boolean; resolveProjectAccess?: ReturnType<typeof vi.fn>; removeProjectMember?: ReturnType<typeof vi.fn> } = {},
) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED()) : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/access", () => ({
    resolveProjectAccess: opts.resolveProjectAccess ?? vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "user_1" }),
  }));
  vi.doMock("@/lib/projectMembers", () => ({
    removeProjectMember: opts.removeProjectMember ?? vi.fn().mockResolvedValue("removed"),
  }));
  return import("./route");
}

function ctx() {
  return { params: Promise.resolve({ projectId: "proj_1", userId: "user_2" }) };
}

describe("DELETE /api/v1/projects/:projectId/members/:userId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/access");
    vi.doUnmock("@/lib/projectMembers");
  });

  it("returns 404 when the caller can't access the project", async () => {
    const { DELETE } = await freshRoute({ resolveProjectAccess: vi.fn().mockResolvedValue(null) });
    const response = await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 403 INSUFFICIENT_ROLE when a non-owner tries to remove someone else", async () => {
    const { DELETE } = await freshRoute({ removeProjectMember: vi.fn().mockResolvedValue("forbidden") });
    const response = await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx());
    expect(response.status).toBe(403);
  });

  it("returns 409 CANNOT_REMOVE_OWNER when targeting the owner", async () => {
    const { DELETE } = await freshRoute({ removeProjectMember: vi.fn().mockResolvedValue("cannot_remove_owner") });
    const response = await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx());
    expect(response.status).toBe(409);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "CANNOT_REMOVE_OWNER" } });
  });

  it("returns 200 on success", async () => {
    const { DELETE } = await freshRoute();
    expect((await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx())).status).toBe(200);
  });
});

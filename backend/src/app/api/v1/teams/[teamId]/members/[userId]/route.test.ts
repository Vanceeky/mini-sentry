import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(
  opts: {
    authFails?: boolean;
    findAccessibleTeam?: ReturnType<typeof vi.fn>;
    updateMemberRole?: ReturnType<typeof vi.fn>;
    removeMember?: ReturnType<typeof vi.fn>;
  } = {},
) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED()) : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/team", () => ({
    findAccessibleTeam: opts.findAccessibleTeam ?? vi.fn().mockResolvedValue({ id: "team_1" }),
    updateMemberRole: opts.updateMemberRole ?? vi.fn().mockResolvedValue("updated"),
    removeMember: opts.removeMember ?? vi.fn().mockResolvedValue("removed"),
  }));
  return import("./route");
}

function ctx() {
  return { params: Promise.resolve({ teamId: "team_1", userId: "user_2" }) };
}

function patchRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/teams/team_1/members/user_2", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/v1/teams/:teamId/members/:userId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/team");
  });

  it("returns 404 when the caller isn't a team member", async () => {
    const { PATCH } = await freshRoute({ findAccessibleTeam: vi.fn().mockResolvedValue(null) });
    expect((await PATCH(patchRequest({ role: "LEAD" }), ctx())).status).toBe(404);
  });

  it("returns 409 LAST_TEAM_LEAD when demoting the last LEAD", async () => {
    const { PATCH } = await freshRoute({ updateMemberRole: vi.fn().mockResolvedValue("last_lead") });
    const response = await PATCH(patchRequest({ role: "MEMBER" }), ctx());
    expect(response.status).toBe(409);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "LAST_TEAM_LEAD" } });
  });

  it("returns 200 on success", async () => {
    const { PATCH } = await freshRoute();
    expect((await PATCH(patchRequest({ role: "LEAD" }), ctx())).status).toBe(200);
  });
});

describe("DELETE /api/v1/teams/:teamId/members/:userId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/team");
  });

  it("returns 403 INSUFFICIENT_ROLE when a non-LEAD removes someone else", async () => {
    const { DELETE } = await freshRoute({ removeMember: vi.fn().mockResolvedValue("forbidden") });
    const response = await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx());
    expect(response.status).toBe(403);
  });

  it("returns 200 on success", async () => {
    const { DELETE } = await freshRoute();
    expect((await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx())).status).toBe(200);
  });
});

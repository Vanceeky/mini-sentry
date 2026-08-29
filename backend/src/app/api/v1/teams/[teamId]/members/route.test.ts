import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(
  opts: { authFails?: boolean; findAccessibleTeam?: ReturnType<typeof vi.fn>; listTeamMembers?: ReturnType<typeof vi.fn> } = {},
) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED()) : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/team", () => ({
    findAccessibleTeam: opts.findAccessibleTeam ?? vi.fn().mockResolvedValue({ id: "team_1" }),
    listTeamMembers: opts.listTeamMembers ?? vi.fn().mockResolvedValue([]),
  }));
  return import("./route");
}

function ctx() {
  return { params: Promise.resolve({ teamId: "team_1" }) };
}

describe("GET /api/v1/teams/:teamId/members", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/team");
  });

  it("returns 404 when the caller isn't a member", async () => {
    const { GET } = await freshRoute({ findAccessibleTeam: vi.fn().mockResolvedValue(null) });
    const response = await GET(new Request("http://localhost:3000/api/v1/teams/team_1/members"), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 200 with the member list", async () => {
    const members = [{ userId: "user_1", name: "Ada", email: "ada@example.com", role: "LEAD" }];
    const { GET } = await freshRoute({ listTeamMembers: vi.fn().mockResolvedValue(members) });
    const response = await GET(new Request("http://localhost:3000/api/v1/teams/team_1/members"), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, members });
  });
});

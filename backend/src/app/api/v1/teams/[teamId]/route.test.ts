import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(
  opts: {
    authFails?: boolean;
    findAccessibleTeam?: ReturnType<typeof vi.fn>;
    renameTeam?: ReturnType<typeof vi.fn>;
    deleteTeam?: ReturnType<typeof vi.fn>;
  } = {},
) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED()) : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/team", () => ({
    findAccessibleTeam: opts.findAccessibleTeam ?? vi.fn().mockResolvedValue({ id: "team_1", name: "Rocket" }),
    renameTeam: opts.renameTeam ?? vi.fn(),
    deleteTeam: opts.deleteTeam ?? vi.fn(),
  }));
  return import("./route");
}

function makeRequest(method: string, body?: unknown) {
  return new Request("http://localhost:3000/api/v1/teams/team_1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function ctx() {
  return { params: Promise.resolve({ teamId: "team_1" }) };
}

describe("GET /api/v1/teams/:teamId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/team");
  });

  it("returns 404 TEAM_NOT_FOUND when the caller isn't a member", async () => {
    const { GET } = await freshRoute({ findAccessibleTeam: vi.fn().mockResolvedValue(null) });
    const response = await GET(makeRequest("GET"), ctx());
    expect(response.status).toBe(404);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "TEAM_NOT_FOUND" } });
  });

  it("returns 200 with the team", async () => {
    const { GET } = await freshRoute();
    const response = await GET(makeRequest("GET"), ctx());
    expect(response.status).toBe(200);
  });
});

describe("PATCH /api/v1/teams/:teamId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/team");
  });

  it("returns 403 INSUFFICIENT_ROLE when a non-LEAD member tries to rename", async () => {
    const { PATCH } = await freshRoute({ renameTeam: vi.fn().mockResolvedValue(null) });
    const response = await PATCH(makeRequest("PATCH", { name: "New Name" }), ctx());
    expect(response.status).toBe(403);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INSUFFICIENT_ROLE" } });
  });

  it("returns 404 TEAM_NOT_FOUND when the caller isn't a member at all", async () => {
    const { PATCH } = await freshRoute({
      renameTeam: vi.fn().mockResolvedValue(null),
      findAccessibleTeam: vi.fn().mockResolvedValue(null),
    });
    const response = await PATCH(makeRequest("PATCH", { name: "New Name" }), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 200 on a successful rename by a LEAD", async () => {
    const team = { id: "team_1", name: "New Name" };
    const { PATCH } = await freshRoute({ renameTeam: vi.fn().mockResolvedValue(team) });
    const response = await PATCH(makeRequest("PATCH", { name: "New Name" }), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, team });
  });
});

describe("DELETE /api/v1/teams/:teamId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/team");
  });

  it("returns 200 on successful delete", async () => {
    const { DELETE } = await freshRoute({ deleteTeam: vi.fn().mockResolvedValue(true) });
    const response = await DELETE(makeRequest("DELETE"), ctx());
    expect(response.status).toBe(200);
  });
});

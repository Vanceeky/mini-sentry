import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(
  opts: { authFails?: boolean; listTeamsForUser?: ReturnType<typeof vi.fn>; createTeam?: ReturnType<typeof vi.fn> } = {},
) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED()) : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/team", () => ({
    listTeamsForUser: opts.listTeamsForUser ?? vi.fn().mockResolvedValue([]),
    createTeam: opts.createTeam ?? vi.fn(),
  }));
  return import("./route");
}

function makeRequest(method: string, body?: unknown) {
  return new Request("http://localhost:3000/api/v1/teams", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/v1/teams", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/team");
  });

  it("returns 401 when not authenticated", async () => {
    const { GET } = await freshRoute({ authFails: true });
    expect((await GET(makeRequest("GET"))).status).toBe(401);
  });

  it("returns 200 with the caller's teams", async () => {
    const teams = [{ id: "team_1", name: "Rocket" }];
    const { GET } = await freshRoute({ listTeamsForUser: vi.fn().mockResolvedValue(teams) });
    const response = await GET(makeRequest("GET"));
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, teams });
  });
});

describe("POST /api/v1/teams", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/team");
  });

  it("returns 201 and makes the caller the creator", async () => {
    const team = { id: "team_1", name: "Rocket" };
    const createTeam = vi.fn().mockResolvedValue(team);
    const { POST } = await freshRoute({ createTeam });

    const response = await POST(makeRequest("POST", { name: "Rocket" }));
    expect(response.status).toBe(201);
    expect((await response.json()) as unknown).toEqual({ success: true, team });
    expect(createTeam).toHaveBeenCalledWith("user_1", "Rocket");
  });

  it("returns 400 VALIDATION_ERROR for a missing name", async () => {
    const { POST } = await freshRoute();
    const response = await POST(makeRequest("POST", {}));
    expect(response.status).toBe(400);
  });
});

describe("unsupported methods on /api/v1/teams", () => {
  it("PUT returns 405", async () => {
    const { PUT } = await freshRoute();
    expect((await PUT(makeRequest("PUT"))).status).toBe(405);
  });
});

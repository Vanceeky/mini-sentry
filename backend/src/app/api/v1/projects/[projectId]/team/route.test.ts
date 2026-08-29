import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(
  opts: {
    authFails?: boolean;
    attachProjectToTeam?: ReturnType<typeof vi.fn>;
    detachProjectFromTeam?: ReturnType<typeof vi.fn>;
  } = {},
) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED()) : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/team", () => ({
    attachProjectToTeam: opts.attachProjectToTeam ?? vi.fn().mockResolvedValue("attached"),
    detachProjectFromTeam: opts.detachProjectFromTeam ?? vi.fn().mockResolvedValue(true),
  }));
  return import("./route");
}

function ctx() {
  return { params: Promise.resolve({ projectId: "proj_1" }) };
}

function putRequest(body: unknown) {
  return new Request("http://localhost:3000/x", { method: "PUT", body: JSON.stringify(body) });
}

describe("PUT /api/v1/projects/:projectId/team", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/team");
  });

  it("returns 404 PROJECT_NOT_FOUND when the caller doesn't own the project", async () => {
    const { PUT } = await freshRoute({ attachProjectToTeam: vi.fn().mockResolvedValue("project_not_found") });
    const response = await PUT(putRequest({ teamId: "team_1" }), ctx());
    expect(response.status).toBe(404);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "PROJECT_NOT_FOUND" } });
  });

  it("returns 404 TEAM_NOT_FOUND when the owner isn't a member of the target team", async () => {
    const { PUT } = await freshRoute({ attachProjectToTeam: vi.fn().mockResolvedValue("not_a_team_member") });
    const response = await PUT(putRequest({ teamId: "team_1" }), ctx());
    expect(response.status).toBe(404);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "TEAM_NOT_FOUND" } });
  });

  it("returns 200 on success", async () => {
    const { PUT } = await freshRoute();
    expect((await PUT(putRequest({ teamId: "team_1" }), ctx())).status).toBe(200);
  });
});

describe("DELETE /api/v1/projects/:projectId/team", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/team");
  });

  it("returns 404 when nothing was detached", async () => {
    const { DELETE } = await freshRoute({ detachProjectFromTeam: vi.fn().mockResolvedValue(false) });
    const response = await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 200 on success", async () => {
    const { DELETE } = await freshRoute();
    expect((await DELETE(new Request("http://localhost:3000/x", { method: "DELETE" }), ctx())).status).toBe(200);
  });
});
